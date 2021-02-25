import { Server } from "http";
import WebSocket from "ws";
import { BaseUiStateType, ClientUiMessage, MsgSendAll, MsgSendUpdate } from "./shared";

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

/**
 * 
 */
export class ServerUiState<T extends BaseUiStateType> {

  private _state: T;

  private wss: WebSocket.Server;

  constructor(initial: T, config: ServerUiStateSocketConfig) {
    this._state = initial;
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

      ws.on("error", err => { });
    });
  }

  private handleMessage(msg: ClientUiMessage, ws: WebSocket) {

    if (msg.type === "request_load_all") {
      const all: MsgSendAll = {
        type: "send_all",
        state: Object.keys(this._state).map(key => ({ key, value: this._state[key].value })),
      };
      ws.send(JSON.stringify(all));
    }

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

  /**
   * Read a snapshot of the current state value of the given key
   */
  get<TKey extends keyof T>(key: TKey) {
    return this._state[key].value as T[TKey]["value"];
  }

  update<TKey extends keyof T>(key: TKey, value: T[TKey]["value"]) {
    this._state[key].next(value);

    const msg: MsgSendUpdate = {
      type: "send_update",
      state: {
        key: key as string,
        value,
      },
    };

    const msgString = JSON.stringify(msg);
    this.send(msgString);
  }

  /**
   * Apply a partial update of the value with the specified key using Object.assign().
   * @param key The key of the specified state to update
   * @param update The partial update object with which to patch the existing state
   */
  updateObjectPartial<TKey extends keyof T>(key: TKey, update: Partial<T[TKey]["value"]>) {

    const value = this.get(key);
    if ((value as object) instanceof Array) {
      throw new Error(`Cannot apply a partial object update to state with key "${key}", as the state value is an array`);
    }

    Object.assign(value, update);
    this.update(key, value);
  }

  /**
   * After finding the value for the specified key, the desired element is found using the specified function.
   * Ths element is then updated to be the given value, of if no matching element was found the new value is appended to the list.
   * @param key The key of th target state value
   * @param findFn Function to find the desired element to update
   * @param newValue The new value to which to set the element
   */
  updateArrayElement<TKey extends keyof T, TElem extends T[TKey]["value"][number]>(
    key: TKey,
    findFn: (item: TElem, index: number) => boolean,
    newValue: TElem
  ) {

    const keyValue = this.get(key);
    if (!((keyValue as object) instanceof Array)) {
      throw new Error(`Cannot update element in list for state key "${key}", as the state value is not a list`);
    }
    const stateList = keyValue as Array<TElem>;

    const targetState = stateList.find(findFn);
    if (targetState) {
      Object.assign(targetState, newValue);
    } else {
      stateList.push(newValue);
    }
    this.update(key, stateList);
  }

}
