import { IncomingMessage, Server } from "http";
import { inspect } from "util";
import WebSocket, { WebSocketServer, PerMessageDeflateOptions } from "ws";
import { ClientUiMessage, MsgSendComplete, MsgSendPatch, MsgSendPatchBatch, PatchableValueType, StatePatch, YUZU_SETTINGS as SETTINGS } from "./shared";

// let LOG_GET = false;
// let LOG_GET_FULL = false;
// let LOG_SET = true;

const DEFAULT_SERVER_PATH = "/api/yuzu";

/**
 * Information provided to the authentication callback during WebSocket handshake.
 */
export interface AuthenticationInfo {
  /** The incoming HTTP request with headers, cookies, etc. */
  request: IncomingMessage;
  /** Parsed query parameters from the connection URL */
  queryParams: URLSearchParams;
  /** Client's origin header, if present */
  origin?: string;
}

/**
 * Configuration options for initializing a ServerUiState instance.
 * Must provide either serverRef (existing HTTP server) OR serverConfig (new server settings), but not both.
 */
export interface ServerUiStateConfig {
  /**
   * Reference to an existing HTTP server to attach WebSocket server to.
   * Provide either this OR serverConfig, not both.
   */
  serverRef?: Server,
  /**
   * Configuration options for creating a new HTTP server.
   * Provide either this OR serverRef, not both.
   */
  serverConfig?: {
    /** Port number on which to listen for incoming connections */
    port: number,
  },
  /**
   * URL path at which to listen for incoming WebSocket connections
   * @default "/api/yuzu"
   */
  path?: string,
  /**
   * Delay in milliseconds to batch multiple state changes before sending to clients.
   * Set to 0 to disable batching and send patches immediately.
   * @default 0
   */
  batchDelay?: number,
  /**
   * Enable or configure per-message deflate compression for WebSocket messages.
   * Can reduce bandwidth usage by 60-80% for text data.
   * Set to true for default compression, false to disable, or provide an object for fine-tuned configuration.
   * @default false
   * @example
   * ```typescript
   * // Enable with defaults
   * { perMessageDeflate: true }
   *
   * // Configure compression threshold (only compress messages larger than 1KB)
   * { perMessageDeflate: { threshold: 1024 } }
   * ```
   */
  perMessageDeflate?: boolean | PerMessageDeflateOptions,
  /** Logging levels to enable for the default logger (debug, log, warn, error) */
  logLevels?: YuzuLoggerLevel[],
  /** Custom logger implementation to replace the default console-based logger */
  logger?: YuzuLogger,
  /**
   * Optional authentication callback invoked during WebSocket handshake.
   * Return true/Promise<true> to accept connection, false/Promise<false> to reject.
   * Connection is rejected BEFORE it's fully established if auth fails.
   * If not provided, all connections are accepted.
   * @example
   * ```typescript
   * authenticate: async (info) => {
   *   const token = info.queryParams.get('token');
   *   if (!token) return false;
   *   return await myAuthService.verifyToken(token);
   * }
   * ```
   */
  authenticate?: (info: AuthenticationInfo) => boolean | Promise<boolean>;
}

/**
 * Interface for a custom logger implementation.
 * All methods accept variable arguments and can return any value.
 */
export interface YuzuLogger {
  /** Log debug-level messages */
  debug: (...msgs: any[]) => any,
  /** Log informational messages */
  log: (...msgs: any[]) => any,
  /** Log warning messages */
  warn: (...msgs: any[]) => any,
  /** Log error messages */
  error: (...msgs: any[]) => any,
}

/**
 * Log level identifiers for controlling which messages are logged.
 * Used in ServerUiStateConfig.logLevels to filter console output.
 */
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
  /**
   * The current state object. This is a proxied object that automatically
   * broadcasts changes to all connected clients when modified.
   * @example
   * ```typescript
   * server.state.count = 5; // Automatically broadcasts to all clients
   * server.state.items.push({ id: "item1" }); // Also broadcasts
   * ```
   */
  public get state() { return this._state; }

  private wss: WebSocketServer;
  /**
   * The underlying WebSocket server instance.
   * Provides access to the raw WebSocketServer for advanced usage, debugging, and monitoring.
   * @example
   * ```typescript
   * // Monitor connected clients
   * console.log(`Connected clients: ${server.webSocketServer.clients.size}`);
   *
   * // Add custom event handlers
   * server.webSocketServer.on('connection', (ws) => {
   *   console.log('New client connected');
   * });
   * ```
   */
  public get webSocketServer() { return this.wss; }

  private httpServer: Server | undefined;

  private patchBatch: StatePatch[] = [];
  private batchDelay: number = 0;
  private batchTimeout: NodeJS.Timeout | undefined = undefined;

  private logger: YuzuLogger;

  /**
   * Creates a new ServerUiState instance that manages state and broadcasts changes to clients.
   * @param initial - The initial state object. All properties will be watched for changes.
   * @param config - Configuration for the WebSocket server and logging
   * @throws Error if neither serverRef nor serverConfig is provided
   * @example
   * ```typescript
   * // Using an existing HTTP server
   * const server = new ServerUiState(
   *   { count: 0 },
   *   { serverRef: httpServer }
   * );
   *
   * // Creating a new server on a specific port
   * const server = new ServerUiState(
   *   { count: 0 },
   *   { serverConfig: { port: 3000 } }
   * );
   * ```
   */
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

    // Set up authentication if provided
    const verifyClient = config.authenticate
      ? (info: { origin: string; req: IncomingMessage }, callback: (verified: boolean, code?: number, message?: string) => void) => {
        // Parse query parameters from the request URL
        const url = new URL(info.req.url || "", `http://${info.req.headers.host}`);
        const queryParams = url.searchParams;

        const authInfo: AuthenticationInfo = {
          request: info.req,
          queryParams,
          origin: info.origin,
        };

        // Handle both sync and async authenticate functions
        try {
          const resultOrPromise = config.authenticate!(authInfo);

          if (resultOrPromise instanceof Promise) {
            // Async authentication
            resultOrPromise
              .then((result) => {
                if (result) {
                  callback(true);
                } else {
                  this.logger.warn("Authentication failed for incoming connection");
                  callback(false, 401, "Unauthorized");
                }
              })
              .catch((error) => {
                this.logger.error("Error during authentication:", error);
                callback(false, 500, "Internal Server Error");
              });
          } else {
            // Sync authentication
            if (resultOrPromise) {
              callback(true);
            } else {
              this.logger.warn("Authentication failed for incoming connection");
              callback(false, 401, "Unauthorized");
            }
          }
        } catch (error) {
          // Handle synchronous errors
          this.logger.error("Error during authentication:", error);
          callback(false, 500, "Internal Server Error");
        }
      }
      : undefined;

    this.wss = new WebSocketServer({
      server: existingServer ? config.serverRef : undefined,
      port: existingServer ? undefined : config.serverConfig?.port,
      path: path.startsWith("/") ? path : `/${path}`,
      verifyClient,
      perMessageDeflate: config.perMessageDeflate,
    });

    // Store HTTP server reference if we created one (for cleanup)
    if (!existingServer && config.serverConfig) {
      this.httpServer = this.wss.options.server as Server | undefined;
    }

    this.listen();

    if (config.batchDelay && config.batchDelay > 0) this.batchDelay = config.batchDelay;

  }

  /**
   * Closes the WebSocket server and cleans up resources.
   * If an HTTP server was created by ServerUiState, it will also be closed.
   * If an external HTTP server was provided, it will NOT be closed.
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clear any pending batch timeout
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = undefined;
      }

      // Close WebSocket server
      this.wss.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        // Close HTTP server if we created it
        if (this.httpServer) {
          this.httpServer.close((httpErr) => {
            if (httpErr) {
              reject(httpErr);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Set the value of the internal state object, wrapping it in a proxy handler.
   * The proxy captures reads and writes at any nested depth within the state,
   * automatically broadcasting changes to all connected clients via WebSocket.
   * @param state - The initial state object to wrap with change detection
   * @internal
   */
  protected setState(state: T) {

    /**
     * Function that returns the proxy handler wrapping the state object, or object nested within that object.
     * Returning the proxy handler from a function enables the passing of the current "path" of keys
     * to the current depth, so handler methods can emit the complete path to the targeted value.
     * @param path - Current path in the state tree
     * @internal
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

  /**
   * Set up WebSocket connection listeners.
   * Handles new connections, incoming messages, disconnections, and errors.
   * Each new client automatically receives the complete state upon connection.
   * @internal
   */
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

  /**
   * Handle an incoming message from a connected client.
   * Currently supports "complete" message type for full state requests.
   * @param msg - The parsed message from the client
   * @param ws - The WebSocket connection that sent the message
   * @internal
   */
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

  /**
   * Send a state patch to all connected clients.
   * If batching is disabled (batchDelay <= 0), sends immediately as a single patch.
   * If batching is enabled, adds the patch to the current batch for later transmission.
   * @param path - Array of keys representing the path in the state tree that changed
   * @param value - The new value at the specified path
   * @internal
   */
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

  /**
   * Send the accumulated batch of patches to all connected clients.
   * Clears the batch and resets the timeout after sending.
   * Called automatically after the configured batchDelay elapses.
   * @internal
   */
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
   * Send a stringified message to all connected clients via WebSocket.
   * Only sends to clients whose connections are in OPEN state.
   * Logs errors if message delivery fails.
   * @param message - JSON-stringified message to broadcast
   * @internal
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
