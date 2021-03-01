import { Server } from "http";
import { inspect } from "util";
import WebSocket from "ws";
import { ClientUiMessage, MsgSendComplete, MsgSendPatch, PatchableValueType, YUZU_SETTINGS as SETTINGS } from "./shared";

// let LOG_GET = false;
// let LOG_GET_FULL = false;
// let LOG_SET = true;

const DEFAULT_SERVER_PATH = "/api/yuzu";

export interface ServerUiStateSocketConfig {
  /** Reference to existing HTTP server */
  serverRef: Server | undefined,
  /** Config options to create new server */
  serverConfig: {
    port: number,
  } | undefined,
  /** Path at which to listen for incoming connections */
  path?: string,
}

export class ServerUiState<T extends object> {

  private _state: T;
  public get state() { return this._state; }

  private wss: WebSocket.Server;

  constructor(initial: T, config: ServerUiStateSocketConfig) {
    // ppease the compiler and actually wire up the state
    this._state = initial;
    this.setState(initial);

    if (!config.serverRef && !config.serverConfig) {
      throw new Error(`Either an existing HTTP server or new server config must be supplied`);
    }

    const existingServer = Boolean(config.serverRef);
    this.wss = new WebSocket.Server({
      server: existingServer ? config.serverRef : undefined,
      port: existingServer ? undefined : config.serverConfig?.port,
      path: config.path || DEFAULT_SERVER_PATH,
    });
    this.listen();
  }

  /**
   * Set the value of the internal state object, wrapping it in a proxy handler
   * to capture reads and writes to and from any nested depth within the state
   */
  protected setState(state: T) {

    /**
     * Funtion that returns the proxy handler wrapping the state object, or object nested within that object.
     * Returning the proxy handler from a function enables the passing of the current "path" of keys
     * to the current depth, so handler methods can emit the complete path to the targeted value.
     */
    const buildProxyHandler = (path: string[]) => {

      const proxyHandler: ProxyHandler<T> = {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);
          this.logRead(target, prop, value);
          return (typeof value === "object" && value !== null)
            ? new Proxy(value, buildProxyHandler([...path, prop.toString()]))
            : value;
        },
        set: (target, prop, value, receiver) => {
          const currVal = Reflect.get(target, prop, receiver);
          const success = Reflect.set(target, prop, value, receiver);
          this.logChange([...path, prop.toString()], `${currVal} => ${value}`);
          // this._updated.next(this.doc);
          this.sendPatch([...path, prop.toString()], value);
          return success;
        },
      };
      return proxyHandler;
    };

    const proxyState = new Proxy(state, buildProxyHandler([]));
    this._state = proxyState;
  }

  /** For testing */
  private logRead(target: object, prop: string | number | symbol, value: any) {
    if (!SETTINGS.SERVER_LOG_READ) return;
    const targ = SETTINGS.SERVER_LOG_READ_FULL ? inspect(target, { breakLength: undefined }) : target;
    const val = SETTINGS.SERVER_LOG_READ_FULL ? inspect(value, { breakLength: undefined }) : value;
    this.log(`state read: ${targ}.${String(prop)} => ${val}`);
  }

  /** For testing */
  private logChange(path: (string | number)[], change: any) {
    if (!SETTINGS.SERVER_LOG_WRITE) return;
    this.log("state changed:", path, change);
  }

  private log(...msgs: any[]) {
    console.log(...msgs);
  }

  private listen() {
    this.wss.on("connection", (ws, req) => {
      this.log(`New connection from ${req.headers.origin}`);

      ws.on("message", message => {
        this.log(`Message from ${req.headers.origin}: ${message}`);
        const msg = JSON.parse(message.toString()) as ClientUiMessage;
        this.handleMessage(msg, ws);
      });

      ws.on("close", code => { });

      ws.on("error", err => {
        this.log(`Websocket error: ${err}`);
      });
    });
  }

  private handleMessage(msg: ClientUiMessage, ws: WebSocket) {

    if (msg.type === "complete") {
      // The proxied state object gets stringified into a POJO, so no cleanup is required
      const complete: MsgSendComplete = {
        type: "complete",
        state: this._state,
      };
      ws.send(JSON.stringify(complete));
    }

  }

  private sendPatch(path: string[], value: PatchableValueType, /* type: PatchableValueTypeName */) {
    const msg: MsgSendPatch = {
      type: "patch",
      patch: { path, value },
    };
    this.send(JSON.stringify(msg));
  }

  /**
   * Send a stringified message to all connected clients
   */
  private send(message: string) {

    this.wss.clients.forEach(client => {
      client.send(message, err => {
        if (err !== undefined) this.log("UI State Error:", err?.message);
      });
    });

  }

}

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

const svr = new ServerUiState<State>(initialState, {
  serverConfig: { port: 3412 },
  serverRef: undefined,
});
SETTINGS.SERVER_LOG_WRITE = true;

console.log("Edit primitives:");
svr.state.aBool = false;
svr.state.aString = "howdy doody neighbourino";
svr.state.aNumber = 27;
svr.state.aNullableNumber = null;
svr.state.aNullableNumber = 27;

console.log("Edit list:");
svr.state.aList.push(1);
svr.state.aList.push(2, 3);
svr.state.aList = [5, 4, 3, 2, 1];
svr.state.aList = [5, 4, 3, 2, 12];
svr.state.aList.splice(3);

console.log("Edit object:");
svr.state.anObject.c = 6;
svr.state.anObject.a = -1;

console.log("Edit nested object:");
svr.state.aNestedObject.name = "jerry";
svr.state.aNestedObject.one.name = "something";
svr.state.aNestedObject.one.two.name = "else";
svr.state.aNestedObject.one.two.three[5] = 12;

console.log("Edit keyed object:");
svr.state.keyedObject.brian = {
  name: "brian",
  status: "fine, thank you",
};
svr.state.keyedObject.jeremy = {
  name: "jeremy",
  status: "not bad, yourself?",
};
svr.state.keyedObject.brian.status = "actually I had better go";
svr.state.keyedObject.brian = undefined;
