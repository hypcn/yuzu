import { BehaviorSubject } from "rxjs";
import { MsgReqComplete, ServerUiMessage, YUZU_SETTINGS as SETTINGS } from "./shared";
import { YuzuSubscription } from "./subscription";

/**
 * An object containing a subscribe function with a typed listener function as a parameter, returning a subscription
 */
type SubscribeFn<T> = { subscribe: (listener: (value: T) => void) => YuzuSubscription };

/**
 * A value with a subscribe method, or an object with subscribe functions recursively added to every part of the object
 */
type SubscribableOrPrimitive<T> = T extends object
  ? { [K in keyof T]: SubscribableOrPrimitive<T[K]> } & SubscribeFn<T>
  // : (T & SubscribeFn<T>);
  : (T);

/**
 * A function supplied when subscribing to a state key, called when the target key updates
 */
type StateListenerFn = (value: any, updatedPath: string[]) => void;

/**
 * A combination of a listener function, and the state path it is listening to.
 * Used to store subscriptions.
 */
interface StateListener {
  path: string[],
  listenerFn: StateListenerFn,
}

/**
 * Configuration options for the client WebSocket connection.
 */
export interface ClientUiStateSocketConfig {
  /**
   * The full websocket address to connect to
   * @default "ws://localhost:3000/api/yuzu"
   * Ignored when externalTransport is true.
   */
  address: string,
  /**
   * Duration in milliseconds to wait before attempting to reconnect after connection loss
   * @default 3000
   * Ignored when externalTransport is true.
   */
  reconnectTimeout: number,
  /**
   * Optional authentication token.
   * Automatically appended to connection URL as query parameter: ?token=xyz
   * Use either `token` or `getToken`, not both.
   * Ignored when externalTransport is true.
   */
  token?: string,
  /**
   * Optional callback to get authentication token.
   * Called on each connection attempt, useful for token refresh/rotation.
   * Use either `token` or `getToken`, not both.
   * Ignored when externalTransport is true.
   * @example
   * ```typescript
   * getToken: async () => await myAuthService.getValidToken()
   * ```
   */
  getToken?: () => string | Promise<string>,
  /**
   * Enable external transport mode. When true:
   * - No WebSocket connection is created (address/reconnectTimeout/token/getToken are ignored)
   * - You must provide an onMessage callback to handle outgoing client messages
   * - Use handleServerMessage() to process incoming messages from the server
   * - Connection state management (connected$, isConnected) is disabled
   * 
   * This allows you to use your own transport layer (existing WebSocket, HTTP, WebRTC, etc.)
   * @default false
   * @example
   * ```typescript
   * const client = new ClientUiState(initialState, {
   *   externalTransport: true,
   *   onMessage: (message) => myWebSocket.send(message)
   * });
   * 
   * myWebSocket.on('message', (data) => {
   *   client.handleServerMessage(data);
   * });
   * ```
   */
  externalTransport?: boolean;
  /**
   * Callback invoked when the client needs to send a message to the server.
   * Required when externalTransport is true.
   * The message is a JSON string ready to be sent over any transport.
   * @param message - JSON-stringified message to send to server
   * @example
   * ```typescript
   * onMessage: (message) => {
   *   myCustomTransport.send(message);
   * }
   * ```
   */
  onMessage?: (message: string) => void;
}

export class ClientUiState<T extends object> {

  /** Internal state. Do not edit directly, use setState() or patchState() */
  private _state: T;
  /** The current state. Readonly, and cannot be subscribed to. */
  public get state() { return this._state; }

  /** Internal subscribable state. Do not edit directly, use setState() or patchState() */
  private _subscribableState: Omit<SubscribableOrPrimitive<T>, "subscribe">;
  /**
   * Subscribable version of the current state.
   * Any key can be subscribed to, and the listener function will be notified of any update
   * affecting the targeted value (or its children).
   *
   * Note: the `state$` property itself cnanot be subscribed to, use `onAny(...)` instead
   */
  public get state$() { return this._subscribableState; }

  /** The list of listeners each listening to some key in the state tree */
  private listeners: StateListener[] = [];

  private ws: WebSocket | undefined;
  private wsConfig: ClientUiStateSocketConfig = {
    address: SETTINGS.CLIENT_DEFAULT_TARGET_ADDRESS,
    reconnectTimeout: SETTINGS.CLIENT_DEFAULT_RECONNECT_TIMEOUT,
  };
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private isManualReconnect = false;
  private externalTransport: boolean = false;
  private onMessageCallback?: (message: string) => void;

  private _connected = new BehaviorSubject<boolean>(false);
  /** 
   * Observable emitting when the connection state of the client changes.
   * Always emits `false` in externalTransport mode.
   */
  public connected$ = this._connected.asObservable();
  /** 
   * Whether the client is currently connected to a Yuzu server.
   * Always returns `false` in externalTransport mode.
   */
  get isConnected() { return this._connected.value; }

  /**
   * Creates a new ClientUiState instance that connects to a Yuzu server.
   * The client will automatically connect to the server and synchronize state.
   * @param initial - The initial state object. This should match the server's initial state structure.
   * @param config - Optional configuration for the WebSocket connection or external transport
   * @throws Error if externalTransport is true but onMessage callback is not provided
   * @example
   * ```typescript
   * // WebSocket mode
   * const client = new ClientUiState(
   *   { count: 0, name: "default" },
   *   { address: "ws://localhost:3000/api/yuzu" }
   * );
   * 
   * // External transport mode
   * const client = new ClientUiState(
   *   { count: 0, name: "default" },
   *   { 
   *     externalTransport: true,
   *     onMessage: (msg) => myTransport.send(msg)
   *   }
   * );
   * ```
   */
  constructor(initial: T, config?: Partial<ClientUiStateSocketConfig>) {
    this._state = initial;
    this._subscribableState = this.setState(initial);

    this.wsConfig = Object.assign(this.wsConfig, config);
    this.externalTransport = this.wsConfig.externalTransport || false;
    
    if (this.externalTransport) {
      // External transport mode
      if (!this.wsConfig.onMessage) {
        throw new Error(`onMessage callback must be provided when using externalTransport mode`);
      }
      this.onMessageCallback = this.wsConfig.onMessage;
      console.log("ClientUiState initialized in external transport mode");
    } else {
      // WebSocket mode
      this.connect();
    }
  }

  /**
   * Establish WebSocket connection to the Yuzu server.
   * Sets up all event handlers (open, close, error, message) and implements auto-reconnection logic.
   * Authentication tokens are automatically appended as query parameters if configured.
   * Only used in WebSocket mode (not external transport).
   * @internal
   */
  private async connect() {
    if (this.externalTransport) return;
    
    console.log("Connecting...");

    // Build connection URL with authentication token if provided
    let connectionUrl = this.wsConfig.address;

    // Get token from either token or getToken
    let token: string | undefined;
    if (this.wsConfig.getToken) {
      token = await this.wsConfig.getToken();
    } else if (this.wsConfig.token) {
      token = this.wsConfig.token;
    }

    // Append token as query parameter if present
    if (token) {
      const separator = connectionUrl.includes("?") ? "&" : "?";
      connectionUrl = `${connectionUrl}${separator}token=${encodeURIComponent(token)}`;
    }

    this.ws = new WebSocket(connectionUrl);

    this.ws.addEventListener("open", (ev) => {
      console.log("socket open");
      this.reload();
      this._connected.next(true);
    });

    this.ws.addEventListener("close", (ev) => {
      this._connected.next(false);

      // Don't auto-reconnect if this was a manual reconnect
      if (this.isManualReconnect) {
        this.isManualReconnect = false;
        return;
      }

      console.log(`Socket closed, reconnecting in ${this.wsConfig.reconnectTimeout}ms...`);
      this.reconnectTimeoutId = setTimeout(() => {
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
   * Handle a socket message received from the server.
   * Processes complete state updates, single patches, or batched patches.
   * Updates local state and notifies relevant listeners.
   * @param msg - The message received from the server
   * @internal
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
   * Handle an incoming server message when using external transport mode.
   * Call this method when your custom transport receives a message from the server.
   * @param message - JSON-stringified message from the server
   * @example
   * ```typescript
   * myWebSocket.on('message', (data) => {
   *   client.handleServerMessage(data.toString());
   * });
   * ```
   */
  handleServerMessage(message: string) {
    if (!this.externalTransport) {
      console.warn("handleServerMessage() should only be used in externalTransport mode");
      return;
    }
    
    try {
      const msg = JSON.parse(message) as ServerUiMessage;
      this.handleMessage(msg);
    } catch (error) {
      console.error("Error parsing server message:", error);
    }
  }

  /**
   * Set the values of the private state and subscribable state members with the given new value.
   * The subscribable state member has proxy handlers set up to add subscribe methods recursively
   * when reading any value. This enables the state$.property.subscribe() pattern.
   * @param state - The new state object to set
   * @returns The subscribable state proxy to satisfy the compiler in the constructor
   * @internal
   */
  private setState(state: T) {
    this._state = state;

    const buildProxyHandler = (path: string[]) => {
      const proxyHandler: ProxyHandler<T> = {

        // Find the requested value, then
        // if the value is an object, wrap it with the proxy handler, then
        // add the subscribe method to the value before returning it
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);
          this.logRead(target, prop, value);

          // Ensure object values are recursively proxied
          if (typeof value === "object" && value !== null) {
            const objectValue = new Proxy(value, buildProxyHandler([...path, prop.toString()]) as any); // TODO: any is naughty, fix it

            // Add the subscribe method to whatever the value is
            if (!Object.prototype.hasOwnProperty.call(value, "subscribe")) {
              Object.defineProperty(objectValue, "subscribe", {
                value: (listener: StateListenerFn) => {
                  // Wire up subscription listener
                  const sub = this.subscribe(listener, [...path, prop.toString()]);
                  return sub;
                },
              });
            }

            return objectValue;
          } else {
            return value;
          }

          // // Add the subscribe method to whatever the value is
          // const valueWithSub: SubscribableOrPrimitive<typeof value> = (!value.hasOwnProperty("subscribe"))
          //   ? Object.defineProperty(value, "subscribe", {
          //     value: (listener: StateListenerFn) => {
          //       // Wire up subscription listener
          //       const sub = this.subscribe(listener, [...path, prop.toString()]);
          //       return sub;
          //     },
          //   })
          //   : value;
          // return valueWithSub;
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

    const proxiedState = new Proxy(state, buildProxyHandler([])) as SubscribableOrPrimitive<T>;

    // // The `subscribe()` function doesn't get added to the root, so add it now
    // if (!proxiedState.hasOwnProperty("subscribe")) {
    //   Object.defineProperty(proxiedState, "subscribe", {
    //     value: (listener: StateListenerFn) => {
    //       // Wire up subscription listener for the root
    //       const sub = this.subscribe(listener, []);
    //       return sub;
    //     },
    //   });
    // }

    this._subscribableState = proxiedState;
    return this._subscribableState;
  }

  /**
   * Patch the state and subscribable state members at the specified path.
   * Traverses the state tree to the target location and updates the value.
   * Used when receiving patch messages from the server.
   * @param path - Array of keys representing the path in the state tree
   * @param value - The new value to set at the specified path
   * @internal
   */
  private patchState(path: string[], value: any) {

    let s: any = this._state;
    let ss: any = this._subscribableState;
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
   * Add the given listener function to the list of listeners, returning a subscription.
   * Internal method used by state$ subscription handlers.
   * @param listenerFn - The callback function to invoke when the state at the given path changes
   * @param path - Array of keys representing the path in the state tree to monitor
   * @returns A YuzuSubscription that can be used to unsubscribe
   * @internal
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
   * Notify all listeners of a change, usually in response to a complete reload.
   * Triggers all registered listeners with their respective current state values.
   * Used when the entire state is refreshed from the server.
   * @internal
   */
  private notifyAllListeners() {
    this.listeners.forEach(listener => {
      try {
        listener.listenerFn(this.readPathExisting(listener.path), []);
      } catch (error) {
        // noop
      }
    });
  }

  /**
   * Notify all listeners triggered by an update to the specified path.
   * Only listeners monitoring this path or its ancestors are notified.
   * Each listener receives the current value at their registered path.
   * @param path - Array of keys representing the path that was modified
   * @internal
   */
  private notifyListeners(path: string[]) {

    // Each listener must have its path to which it is listening entirely met by the patched path,
    // any additional keys patching a greater depth do not matter
    this.listeners.forEach(listener => {
      // Abandon loop if path not met
      for (let i = 0; i < listener.path.length; i++) {
        if (path[i] !== listener.path[i]) return;
      }

      // Call the listener function with the latest value at the specified path
      listener.listenerFn(this.readPathExisting(listener.path), path);
    });

  }

  /**
   * Notify listeners for multiple path updates in a single batch.
   * Deduplicates triggered listeners to ensure each is called only once,
   * even if multiple paths affect the same listener.
   * @param paths - Array of paths that were modified in the batch update
   * @internal
   */
  private notifyListenersOnce(paths: string[][]) {

    // Find deduplicated listeners

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
      try {
        listenerFn(this.readPathExisting(path), path);
      } catch (error) {
        // noop
      }
    }

  }

  /**
   * Remove the state listener from the list by matching the given listener function.
   * Used to unsubscribe from subscriptions when a YuzuSubscription.unsubscribe() is called.
   * @param listener - The listener function to remove from the internal listeners array
   * @internal
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
   * Completely reload the state from the server.
   * Requests the full state object from the server and updates the local state.
   * All listeners will be notified of the update.
   * In externalTransport mode, sends the request via the onMessage callback.
   * @example
   * ```typescript
   * client.reload(); // Force a full state refresh from the server
   * ```
   */
  reload() {
    const msg: MsgReqComplete = {
      type: "complete",
    };
    const msgString = JSON.stringify(msg);
    
    if (this.externalTransport) {
      this.onMessageCallback?.(msgString);
    } else {
      this.ws?.send(msgString);
    }
  }

  /**
   * Manually trigger a reconnection to the server.
   * Closes the current WebSocket connection (if any) and immediately establishes a new one.
   * This is useful when authentication status changes or connection parameters need to be refreshed.
   * Does nothing in externalTransport mode.
   *
   * Note: The connection will use the latest token from `getToken()` if configured.
   * @example
   * ```typescript
   * // Reconnect after user logs in
   * await userLogin();
   * client.reconnect();
   * ```
   */
  reconnect() {
    if (this.externalTransport) {
      console.warn("reconnect() does nothing in externalTransport mode");
      return;
    }
    
    // Clear any pending automatic reconnection
    if (this.reconnectTimeoutId !== undefined) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }

    // Close existing connection if present
    if (this.ws) {
      this.isManualReconnect = true;
      this.ws.close();
      this.ws = undefined;
    }

    this._connected.next(false);
    this.connect();
  }

  /**
   * Disconnect from the server and stop automatic reconnection.
   * This permanently closes the WebSocket connection without attempting to reconnect.
   * Use this when you want to cleanly shut down the client connection.
   * Does nothing in externalTransport mode.
   * @example
   * ```typescript
   * // Clean up before unmounting/destroying
   * client.disconnect();
   * ```
   */
  disconnect() {
    if (this.externalTransport) {
      console.warn("disconnect() does nothing in externalTransport mode");
      return;
    }
    
    // Clear any pending automatic reconnection
    if (this.reconnectTimeoutId !== undefined) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = undefined;
    }

    // Close WebSocket connection if present
    if (this.ws) {
      this.isManualReconnect = true; // Prevent auto-reconnect
      this.ws.close();
      this.ws = undefined;
    }

    this._connected.next(false);
  }

  /**
   * Read the value at the specified path in the state tree.
   * Throws an error if the path does not exist.
   * @param path - Array of string keys representing the path to the value
   * @returns The value at the specified path
   * @throws Error if the path does not exist in the state tree
   * @example
   * ```typescript
   * const userName = client.readPathExisting(["user", "name"]);
   * // Throws error if user.name doesn't exist
   * ```
   */
  readPathExisting(path: string[]) {

    // Current location while traversing the state tree
    let curr: SubscribableOrPrimitive<any> = this.state;

    for (const p of path) {
      if (!(p in curr)) {
        throw new Error(`The path "${path.join(".")}" does not exist in the state tree (key "${p}" was not found)`);
      }
      curr = curr[p as keyof typeof curr];
    }

    return curr;
  }

  /**
   * Read the value at the specified path in the state tree.
   * Returns undefined if the path does not exist instead of throwing an error.
   * @param path - Array of string keys representing the path to the value
   * @returns The value at the specified path, or undefined if the path doesn't exist
   * @example
   * ```typescript
   * const userName = client.readPathOptional(["user", "name"]);
   * // Returns undefined if user.name doesn't exist
   * ```
   */
  readPathOptional(path: string[]) {
    try {
      return this.readPathExisting(path);
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Listen to changes at the given path in the state tree.
   * The path must exist at the time of subscription, or an error will be thrown.
   * The listener will be called whenever the value at this path (or any nested value) changes.
   * @param path - Array of string keys representing the path to listen to
   * @param listener - Function called when the value at the path changes. Receives (value, path).
   * @returns A YuzuSubscription that can be unsubscribed
   * @throws Error if the path does not exist in the state tree
   * @example
   * ```typescript
   * const sub = client.onChangeExisting(["user", "name"], (value, path) => {
   *   console.log("User name changed to:", value);
   * });
   * sub.unsubscribe(); // Stop listening
   * ```
   */
  onChangeExisting(path: string[], listener: StateListenerFn): YuzuSubscription {

    // Attempt to read the specified location in the tree to check if it exists
    this.readPathExisting(path);

    // Specified path exists, wire up subscription
    const sub = this.subscribe(listener, path);

    return sub;
  }

  /**
   * Listen to changes at the given path in the state tree.
   * Unlike onChangeExisting, this does not require the path to exist at subscription time.
   * Useful for subscribing to optional or dynamically created state keys.
   * @param path - Array of string keys representing the path to listen to
   * @param listener - Function called when the value at the path changes. Receives (value, path).
   * @returns A YuzuSubscription that can be unsubscribed
   * @example
   * ```typescript
   * // Listen to a path that might not exist yet
   * const sub = client.onChangeOptional(["devices", "device1"], (value, path) => {
   *   if (value) console.log("Device 1 state:", value);
   * });
   * ```
   */
  onChangeOptional(path: string[], listener: StateListenerFn): YuzuSubscription {

    // Specified path may or may not exist, listen for updates anyway
    const sub = this.subscribe(listener, path);

    return sub;
  }

  /**
   * Subscribe to all state changes regardless of which path is modified.
   * The listener receives the updated value and the path that was changed.
   * Useful for debugging or implementing global state change handlers.
   * @param listener - Callback function invoked on any state change. Receives (value, path).
   * @returns A YuzuSubscription that can be used to unsubscribe
   * @example
   * ```typescript
   * const sub = client.onAny((value, path) => {
   *   console.log(`State changed at ${path.join('.')}: `, value);
   * });
   * ```
   */
  onAny(listener: StateListenerFn): YuzuSubscription {
    return this.onChangeExisting([], listener);
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

// const sub2 = client.state$.aNumber.subscribe(num => {
//   console.log("num now", num);
// });

// client.state$.aNestedObject.subscribe(v => { v.one });
// client.state$.aNestedObject.one.subscribe(v => { v.two });
// client.state$.aNestedObject.one.two.subscribe(v => { v.three });
// client.state$.aNestedObject.one.two.three.subscribe(v => { v.map(elem => elem) });

// client.state$.keyedObject.subscribe(val => {
//   const id = "id";
//   if (id in val) {
//     console.log(val[id]?.name);
//     console.log(val[id]?.status);
//   }
// });
