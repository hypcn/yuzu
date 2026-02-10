import { Server } from "http";
import { inspect } from "util";
import WebSocket from "ws";
import { ClientUiMessage, MsgSendComplete, MsgSendPatch, MsgSendPatchBatch, PatchableValueType, StatePatch, YUZU_SETTINGS as SETTINGS } from "./shared";

// let LOG_GET = false;
// let LOG_GET_FULL = false;
// let LOG_SET = true;

const DEFAULT_SERVER_PATH = "/api/yuzu";

export interface ServerUiStateConfig {
  /** Reference to existing HTTP server */
  serverRef: Server | undefined,
  /** Config options to create new server */
  serverConfig: {
    port: number,
  } | undefined,
  /**
   * Path at which to listen for incoming connections
   * @default "/api/yuzu"
   */
  path?: string,
  /**
   *
   * @default 0
   */
  batchDelay?: number,
  /** Optionally specify the logging levels for the default logger */
  logLevels?: YuzuLoggerLevel[],
  /** Optionally replace the default logger */
  logger?: YuzuLogger,
}

export interface YuzuLogger {
  debug: (...msgs: any[]) => any,
  log: (...msgs: any[]) => any,
  warn: (...msgs: any[]) => any,
  error: (...msgs: any[]) => any,
}

export type YuzuLoggerLevel = "debug" | "log" | "warn" | "error";

class DefaultLogger implements YuzuLogger {
  constructor(
    private logLevels: YuzuLoggerLevel[] = ["error", "debug", "log"],
  ) {}
  debug(...msgs: any[]) {
    if (this.logLevels.includes("debug")) console.debug(msgs);
  }
  log(...msgs: any[]) {
    if (this.logLevels.includes("log")) console.log(msgs);
  }
  warn(...msgs: any[]) {
    if (this.logLevels.includes("warn")) console.warn(msgs);
  }
  error(...msgs: any[]) {
    if (this.logLevels.includes("error")) console.error(msgs);
  }
}

export class ServerUiState<T extends object> {

  private _state: T;
  public get state() { return this._state; }

  private wss: WebSocket.Server;

  private patchBatch: StatePatch[] = [];
  private batchDelay: number = 0;
  private batchTimeout: NodeJS.Timeout | undefined = undefined;

  private logger: YuzuLogger;

  constructor(initial: T, config: ServerUiStateConfig) {

    if (config.logger !== undefined) {
      this.logger = config.logger;
    } else {
      this.logger = new DefaultLogger(config.logLevels);
    }

    // Appease the compiler and actually wire up the state
    this._state = initial;
    this.setState(initial);

    if (!config.serverRef && !config.serverConfig) {
      throw new Error(`Either an existing HTTP server or new server config must be supplied`);
    }

    const existingServer = Boolean(config.serverRef);
    const path = config.path || DEFAULT_SERVER_PATH;
    this.wss = new WebSocket.Server({
      server: existingServer ? config.serverRef : undefined,
      port: existingServer ? undefined : config.serverConfig?.port,
      path: path.startsWith("/") ? path : `/${path}`,
    });
    this.listen();

    if (config.batchDelay && config.batchDelay > 0) this.batchDelay = config.batchDelay;

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
          if (typeof value === "object" && value !== null) {
            const proxyHandler = buildProxyHandler([...path, prop.toString()]);
            return new Proxy(value as object, proxyHandler);
          }
          return value;
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
    this.logger.debug(`state read: ${targ}.${String(prop)} => ${val}`);
  }

  /** For testing */
  private logChange(path: (string | number)[], change: any) {
    if (!SETTINGS.SERVER_LOG_WRITE) return;
    this.logger.debug("state changed:", path, change);
  }

  // private log(...msgs: any[]) {
  //   console.log(...msgs);
  // }

  private listen() {
    this.wss.on("connection", (ws, req) => {
      this.logger.log(`New connection from ${req.headers.origin}`);

      ws.on("message", message => {
        this.logger.log(`Message from ${req.headers.origin}: ${message}`);
        const msg = JSON.parse(message.toString()) as ClientUiMessage;
        this.handleMessage(msg, ws);
      });

      ws.on("close", code => {
        this.logger.log(`Connection closed: ${req.headers.origin} code: ${code}`);
      });

      ws.on("error", err => {
        this.logger.error(`Websocket error:`, err);
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(complete));
      }
    }

  }

  private sendPatch(path: string[], value: PatchableValueType) {
    if (this.batchDelay <= 0) {
      const msg: MsgSendPatch = {
        type: "patch",
        patch: { path, value },
      };
      this.logger.debug(`Sending patch to: ${msg.patch.path}`);
      this.send(JSON.stringify(msg));
    } else {
      this.patchBatch.push({ path, value });
      if (this.batchTimeout === undefined) {
        this.batchTimeout = setTimeout(() => {
          this.sendBatch();
        }, this.batchDelay);
      }
    }
  }

  private sendBatch() {
    if (this.patchBatch.length < 1) return;

    const msg: MsgSendPatchBatch = {
      type: "patch-batch",
      patches: this.patchBatch,
    };
    const messageString = JSON.stringify(msg);

    this.patchBatch = [];
    this.batchTimeout = undefined;

    this.logger.debug(`Sending batch of ${msg.patches.length} patches`);
    this.send(messageString);
  }

  /**
   * Send a stringified message to all connected clients
   */
  private send(message: string) {

    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message, err => {
          if (err) {
            this.logger.error("Error sending message:", err?.message);
          }
        });
      }
    });

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

// const svr = new ServerUiState<State>(initialState, {
//   serverConfig: { port: 3412 },
//   serverRef: undefined,
// });
// SETTINGS.SERVER_LOG_WRITE = true;

// console.log("Edit primitives:");
// svr.state.aBool = false;
// svr.state.aString = "howdy doody neighbourino";
// svr.state.aNumber = 27;
// svr.state.aNullableNumber = null;
// svr.state.aNullableNumber = 27;

// console.log("Edit list:");
// svr.state.aList.push(1);
// svr.state.aList.push(2, 3);
// svr.state.aList = [5, 4, 3, 2, 1];
// svr.state.aList = [5, 4, 3, 2, 12];
// svr.state.aList.splice(3);

// console.log("Edit object:");
// svr.state.anObject.c = 6;
// svr.state.anObject.a = -1;

// console.log("Edit nested object:");
// svr.state.aNestedObject.name = "jerry";
// svr.state.aNestedObject.one.name = "something";
// svr.state.aNestedObject.one.two.name = "else";
// svr.state.aNestedObject.one.two.three[5] = 12;

// console.log("Edit keyed object:");
// svr.state.keyedObject.brian = {
//   name: "brian",
//   status: "fine, thank you",
// };
// svr.state.keyedObject.jeremy = {
//   name: "jeremy",
//   status: "not bad, yourself?",
// };
// svr.state.keyedObject.brian.status = "actually I had better go";
// svr.state.keyedObject.brian = undefined;
