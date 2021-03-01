import { MsgReqComplete, ServerUiMessage, YUZU_SETTINGS as SETTINGS } from "./shared";
import { YuzuSubscription } from "./subscription";

/**
 * An object containing a subscribe function with a typed listener function as a parameter, returning a subscription
 */
type SubscribeFn<T> = { subscribe: (listener: (value: T) => void) => YuzuSubscription };

/**
 * A value with a scribe object, or an object with subscribe functions recursively added to every part of the object
 */
type Subscribable<T> = T extends object
  ? { [K in keyof T]: Subscribable<T[K]> } & SubscribeFn<T>
  : (T & SubscribeFn<T>);

/**
 * A function supplied when subscribing to a state key, called when the target key updates
 */
type StateListenerFn = (value: any, updatedPath: string[]) => void;

interface StateListener {
  path: string[],
  listenerFn: StateListenerFn,
}

export interface ClientUiStateSocketConfig {
  address: string,
  reconnectTimeout: number,
}

export class ClientUiState<T extends object> {

  /** Internal state. Do not edit directly, use setState() or patchState() */
  private _state: T;
  /** The current state. Readonly */
  public get state() { return this._state; }

  /** Internal subscribable state. Do not edit directly, use setState() or patchState() */
  private _subbableState: Subscribable<T>;
  /**
   * Subscribable version of the current state.
   * Any key can be subscribed to, and the listener function will be notified of any update
   * affecting the targeted value.
   */
  public get subbableState() { return this._subbableState; }

  /** The list of listeners each listening to some key in the state tree */
  private listeners: StateListener[] = [];

  private ws: WebSocket | undefined;
  private wsConfig: ClientUiStateSocketConfig = {
    address: SETTINGS.CLIENT_DEFAULT_TARGET_ADDRESS,
    reconnectTimeout: SETTINGS.CLIENT_DEFAULT_RECONNECT_TIMEOUT,
  };

  constructor(initial: T, config?: Partial<ClientUiStateSocketConfig>) {
    this._state = initial;
    this._subbableState = this.setState(initial);

    this.wsConfig = Object.assign(this.wsConfig, config);
    this.connect();
  }

  /**
   * Set up connection to the specified WS server, and reload whenever the connection is dropped
   */
  private connect() {
    console.log("Connecting...");
    this.ws = new WebSocket(this.wsConfig.address);

    this.ws.addEventListener("open", (ev) => {
      console.log("socket open");
      this.reload();
    });

    this.ws.addEventListener("close", (ev) => {
      setTimeout(() => {
        console.log("Socket closed, reconnecting...");
        this.connect();
      }, this.wsConfig.reconnectTimeout);
    });

    this.ws.addEventListener("error", (ev) => {
      this.ws?.close();
    });

    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data) as ServerUiMessage;
      this.handleMessage(msg);
    });
  }

  /**
   * Handle a socket message received from the server
   */
  private handleMessage(msg: ServerUiMessage) {

    if (msg.type === "complete") {
      this.setState(msg.state as T);
      this.notifyAllListeners();
    }

    if (msg.type === "patch") {
      const { path, value } = msg.patch;
      this.patchState(path, value);
      this.notifyListeners(path);
    }

    if (msg.type === "patch-batch") {
      for (const patch of msg.patches) {
        this.patchState(patch.path, patch.value);
      }
      this.notifyListenersOnce(msg.patches.map(p => p.path));
    }

  }

  /**
   * Set the values of the private state and subscribable state members with the given new value.
   * The subscribable state member has proxy handlers set up to add subscribe methods recursively
   * when reading any value.
   * Returns the subscribable state to satisfy the compiler in the constructor.
   */
  private setState(state: T) {
    this._state = state;

    const buildProxyHandler = (path: string[]) => {
      const proxyHandler: ProxyHandler<T> = {

        // Find the requested value, then
        // if the value is an object, wrap it with the proxy handler, then
        // add the subscribe method to the value before returning it
        get: (target, prop, receiver) => {
          let value = Reflect.get(target, prop, receiver);
          this.logRead(target, prop, value);

          // Ensure object values are recursively proxied
          if (typeof value === "object" && value !== null) {
            value = new Proxy(value, buildProxyHandler([...path, prop.toString()]));
          }

          // Add the subscribe method to whatever the value is
          const valueWithSub: Subscribable<typeof value> = (!value.hasOwnProperty("subscribe"))
          ? Object.defineProperty(value, "subscribe", {
              value: (listener: StateListenerFn) => {
                // Wire up subscription listener
                const sub = this.subscribe(listener, [...path, prop.toString()]);
                return sub;
              },
            }) : value;
          return valueWithSub;
        },

        // set: (target, prop, value, receiver) => {
        //   const currVal = Reflect.get(target, prop, receiver);
        //   const success = Reflect.set(target, prop, value, receiver);
        //   this.logChange([...path, prop.toString()], `${currVal} => ${value}`);
        //   // this._updated.next(this.doc);
        //   // this.sendPatch([...path, prop.toString()], value);
        //   // TODO: notify listeners
        //   return success;
        // },

      };
      return proxyHandler;
    };

    const proxiedState = new Proxy(state, buildProxyHandler([])) as Subscribable<T>;
    this._subbableState = proxiedState;
    return this._subbableState;
  }

  /**
   * Patch the state and subscribable state members at the specified path
   */
  private patchState(path: string[], value: any) {

    let s: any = this._state;
    let ss: any = this._subbableState;
    const lastPathIndex = path.length - 1;
    for (let i = 0; i < lastPathIndex; i++) {
      const p = path[i];
      s = s[p];
      ss = ss[p];
    }
    s[path[lastPathIndex]] = value;
    ss[path[lastPathIndex]] = value;

  }

  /**
   * Add the given listener function to the list of listeners, returning a subscription
   */
  private subscribe(listenerFn: StateListenerFn, path: string[]): YuzuSubscription {
    this.listeners.push({
      path,
      listenerFn,
    });
    const sub = new YuzuSubscription(() => {
      this.removeListener(listenerFn);
    });
    return sub;
  }

  /**
   * Notify all listeners of a change, usually in response to a complete reload
   */
  private notifyAllListeners() {
    this.listeners.forEach(listener => {
      listener.listenerFn(this.readPath(listener.path), []);
    });
  }

  /**
   * Nofify all listeners triggered by an update to the specified path with
   * the current value at each triggered listener's target path within the state
   */
  private notifyListeners(path: string[]) {

    // Each listener must have its path to which it is listening entirely mset by the patched path,
    // any additional keys patching a greater depth do not matter
    this.listeners.forEach(listener => {
      // Abandon loop if path not met
      for (let i = 0; i < listener.path.length; i++) {
        if (path[i] !== listener.path[i]) return;
      }

      // Call the listener function with the latest value at the specified path
      listener.listenerFn(this.readPath(listener.path), path);
    });

  }

  /**
   * 
   */
  private notifyListenersOnce(paths: string[][]) {

    // TODO: deduplicate parameter list

    // Find the deduplicated list of triggered subscription listeners
    // using method from notifyListeners
    const triggered = this.listeners.filter(listener => {
      return paths.some(path => {
        for (let i = 0; i < listener.path.length; i++) {
          if (path[i] !== listener.path[i]) return false;
        }
        return true;
      });
    });

    // Call the listener functions with the latest values at the specified paths
    for (const { listenerFn, path } of triggered) {
      listenerFn(this.readPath(path), path);
    }

  }

  /**
   * Remove the state listener from the list by matching the given listener function.
   * Used to unsubscribe from subscriptions.
   */
  private removeListener(listener: StateListenerFn) {
    this.listeners = this.listeners.filter(l => l.listenerFn !== listener);
  }

  /** For testing */
  private logRead(target: object, prop: string | number | symbol, value: any) {
    if (!SETTINGS.CLIENT_LOG_READ) return;
    const targ = SETTINGS.CLIENT_LOG_READ_FULL ? JSON.stringify(target) : target;
    const val = SETTINGS.CLIENT_LOG_READ_FULL ? JSON.stringify(value) : value;
    console.log(`state read: ${targ}.${String(prop)} => ${val}`);
  }

  /** For testing */
  private logChange(path: (string | number)[], change: any) {
    if (!SETTINGS.SERVER_LOG_WRITE) return;
    console.log("state changed:", path, change);
  }

  /**
   * Completely reload the state from the server
   */
  reload() {
    const msg: MsgReqComplete = {
      type: "complete",
    };
    this.ws?.send(JSON.stringify(msg));
  }

  /**
   * Read the value at the specified path in the state tree.
   * Throws an error if the value at the path cannot be read.
   */
  readPath(path: string[]) {

    // Current location while traversing the state tree
    let curr: Subscribable<any> = this.state;

    for (const p of path) {
      if (!(p in curr)) {
        throw new Error(`The path "${path.join(".")}" does not exist in the state tree (key "${p}" was not found)`);
      }
      curr = curr[p as keyof typeof curr];
    }

    return curr;
  }

  /**
   * Listen to changes at the given path.
   * The path parameter is untyped, but throws an error at runtime if the path does not currently exist.
   */
  onChange(path: string[], listener: StateListenerFn): YuzuSubscription {

    // Attempt to read the specified location in the tree to check if it exists
    this.readPath(path);

    // Specified path exists, wire up subscription
    const sub = this.subscribe(listener, path);

    return sub;
  }

  /**
   * Subscribe to all changes to the state
   */
  onAny(listener: StateListenerFn): YuzuSubscription {
    return this.onChange([], listener);
  }

}


// // ===== EXAMPLE

// interface State {
//   aNumber: number;
//   aBool: boolean;
//   aString: string;
//   aNullableNumber: number | null,
//   aList: number[];
//   anObject: {
//     a: number;
//     b: number;
//     c: number;
//   };
//   aNestedObject: {
//     name: string;
//     one: {
//       name: string,
//       two: {
//         name: string,
//         three: number[],
//       },
//     },
//   };
//   keyedObject: {
//     [key: string]: {
//       name: string,
//       status: string,
//     } | undefined,
//   };
// }

// const initialState: State = {
//   aNumber: 4,
//   aBool: true,
//   aString: "howdy!",
//   aNullableNumber: 44,
//   aList: [1, 2, 3, 4, 5],
//   anObject: {
//     a: 1,
//     b: 2,
//     c: 3,
//   },
//   aNestedObject: {
//     name: "nest",
//     one: {
//       name: "one",
//       two: {
//         name: "two",
//         three: [1, 2, 3],
//       },
//     },
//   },
//   keyedObject: {},
// };

// const client = new ClientUiState(initialState);

// const sub1 = client.onChange(["aNestedObject"], (v) => {});

// const sub2 = client.subbableState.aNumber.subscribe(num => {
//   console.log("num now", num);
// });

// client.subbableState.aNestedObject.subscribe(v => { v.one });
// client.subbableState.aNestedObject.one.subscribe(v => { v.two });
// client.subbableState.aNestedObject.one.two.subscribe(v => { v.three });
// client.subbableState.aNestedObject.one.two.three.subscribe(v => { v.map(elem => elem) });

// client.subbableState.keyedObject.subscribe(val => {
//   const id = "id";
//   if (id in val) {
//     console.log(val[id]?.name);
//     console.log(val[id]?.status);
//   }
// });
