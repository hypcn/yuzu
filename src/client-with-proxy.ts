import { MsgReqComplete, ServerUiMessage, YUZU_SETTINGS as SETTINGS } from "./shared";


export interface ClientUiStateSocketConfig {
  address: string,
  reconnectTimeout: number,
}


export class ClientUiState<T extends object> {

  private _state: WithSubscribe<T>;
  public get state() { return this._state; }

  private listeners: {
    path: string[],
    listener: (...args: any[]) => any,
  }[] = [];

  private ws: WebSocket | undefined;
  private wsConfig: ClientUiStateSocketConfig = {
    address: SETTINGS.CLIENT_DEFAULT_TARGET_ADDRESS,
    reconnectTimeout: SETTINGS.CLIENT_DEFAULT_RECONNECT_TIMEOUT,
  };

  constructor(initial: T, config?: Partial<ClientUiStateSocketConfig>) {
    this._state = this.setState(initial);

    this.wsConfig = Object.assign(this.wsConfig, config);

    this.connect();
  }

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
    }

    if (msg.type === "patch") {
      // TODO!!!
      // TODO!!!
      // TODO!!!
      // const { key, value } = msg.state;
      // this.update(key as keyof T, value);
    }

  }

  private setState(state: T) {

    const buildProxyHandler = (path: string[]) => {
      const proxyHandler: ProxyHandler<T> = {

        // Find the requested value, then
        // if the value is an object, wrap it with the proxy handler, then
        // add the subscribe method to the value before returning it
        get: (target, prop, receiver) => {
          let value = Reflect.get(target, prop, receiver);
          this.logRead(target, prop, value);

          if (typeof value === "object" && value !== null) {
            value = new Proxy(value, buildProxyHandler([...path, prop.toString()]));
          }

          // Add the subscribe method to whatever the value is
          const valueWithSub: WithSubscribe<typeof value> = Object.defineProperty(value, "subscribe", {
            value: (listener: (val: typeof value) => any) => {
              // Wire up subscription listener
              this.listeners.push({
                path: [...path, prop.toString()],
                listener: listener,
              });
            },
          });
          return valueWithSub;
        },

        set: (target, prop, value, receiver) => {
          const currVal = Reflect.get(target, prop, receiver);
          const success = Reflect.set(target, prop, value, receiver);
          this.logChange([...path, prop.toString()], `${currVal} => ${value}`);
          // this._updated.next(this.doc);
          // this.sendPatch([...path, prop.toString()], value);
          // TODO: notify listeners
          return success;
        },

      };
      return proxyHandler;
    };

    const proxiedState = new Proxy(state, buildProxyHandler([])) as WithSubscribe<T>;
    this._subbableState = proxiedState;
    return this._subbableState;
  }

  /** For testing */
  private logRead(target: object, prop: string | number | symbol, value: any) {
    if (!SETTINGS.SERVER_LOG_READ) return;
    console.log(`state read: ${target}.${String(prop)} => ${value}`);
  }

  /** For testing */
  private logChange(path: (string | number)[], change: any) {
    if (!SETTINGS.SERVER_LOG_WRITE) return;
    console.log("state changed:", path, change);
  }

  /**
   * Completely reload the UI state from the server
   */
  reload() {
    const msg: MsgReqComplete = {
      type: "complete",
    };
    this.ws?.send(JSON.stringify(msg));
  }

  // onChange<
  //   T1 extends Keys<T>
  // >(path: [T1], func: (value: T[T1]) => any): void;
  // onChange<
  //   T1 extends Keys<T>,
  //   T2 extends Keys<T[T1]>,
  // >(path: [T1, T2], func: (value: T[T1][T2]) => any): void;
  // onChange<
  //   T1 extends keyof T,
  //   T2 extends keyof T[T1],
  //   T3 extends keyof T[T1][T2],
  // >(path: [T1, T2, T3], func: (value: T[T1][T2][T3]) => any): void;
  onChange<
    T1 extends keyof T,
    T2 extends keyof T[T1],
    T3 extends keyof T[T1][T2],
    T4 extends keyof T[T1][T2][T3],
    T5 extends keyof T[T1][T2][T3][T4],
    T6 extends string[],
  >(
    path: [T1] | [T1, T2] | [T1, T2, T3] | [T1, T2, T3, T4] | [T1, T2, T3, T4, T5] | [T1, T2, T3, T4, T5, ...T6],
    func: (value: ListenerParam<T, T1, T2, T3, T4, T5, T6>) => any,
  ) {
    let curr: any = this.state;
    for (const k of path) {
      curr = curr[k];
    }
    func(curr);
  }

  stateWithSubscriptions() {
    const something = this.addSubscribe(this.state);
  }


  private addSubscribe<S>(value: S): WithSubscribe<S> {

    let withSub: WithSubscribe<S> = Object.defineProperty(value, "subscribe", {
      value: (listener: (value: S) => any) => {
        // Wire up subscription listener
      },
    }); // as WithSubscribe<S>;

    if (typeof value === "object" && value !== null) {
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          withSub[key] = this.addSubscribe(value[key]);
        }
      }
    }

    return withSub;
  }

}

const f: undefined | WithSubscribe<{
  a: number,
  b: string,
  c: { as: string, df: number }
}> = undefined;
let num: WithSubscribe<number> | undefined = undefined;
function ffff() {
  if (num) {
    const sub = num.subscribe(val => {});
    const d = num + 3;
    sub.unsubscribe();
  }
}

type Subscribable<T> = { subscribe: (listener: (value: T) => void) => Subscription };
type Subscription = { unsubscribe: () => void };

type WithSubscribe<T> = T extends object
  ? { [K in keyof T]: WithSubscribe<T[K]> } & Subscribable<T>
  : (T & Subscribable<T>);

type ListenerParam<
  T,
  T1 extends keyof T,
  T2 extends keyof T[T1],
  T3 extends keyof T[T1][T2],
  T4 extends keyof T[T1][T2][T3],
  T5 extends keyof T[T1][T2][T3][T4],
  T6 extends string[],
> = 
  // T1 extends never ? never :
  T2 extends never ? T[T1] :
  T3 extends never ? T[T1][T2] :
  T4 extends never ? T[T1][T2][T3] :
  T5 extends never ? T[T1][T2][T3][T4] :
  T6 extends never ? T[T1][T2][T3][T4][T5] : any;

// ===== EXAMPLE

interface State {
  aNumber: number;
  aBool: boolean;
  aString: string;
  aNullableNumber: number | null,
  aList: number[];
  anObject: {
    a: number;
    b: number;
    c: number;
  };
  aNestedObject: {
    name: string;
    one: {
      name: string,
      two: {
        name: string,
        three: number[],
      },
    },
  };
  keyedObject: {
    [key: string]: {
      name: string,
      status: string,
    } | undefined,
  };
}

const initialState: State = {
  aNumber: 4,
  aBool: true,
  aString: "howdy!",
  aNullableNumber: 44,
  aList: [1, 2, 3, 4, 5],
  anObject: {
    a: 1,
    b: 2,
    c: 3,
  },
  aNestedObject: {
    name: "nest",
    one: {
      name: "one",
      two: {
        name: "two",
        three: [1, 2, 3],
      },
    },
  },
  keyedObject: {},
};

const client = new ClientUiState(initialState);

client.onChange(["aNestedObject"], (v) => {});
