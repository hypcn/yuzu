import { Server } from "http";
import WebSocket from "ws";
import { BaseUiStateType, ClientUiMessage, MsgSendAll, MsgSendUpdate } from "./shared";

// export interface ServerUiStateSocketConfig {
//   // 
// }

/**
 * 
 */
export class ServerUiState<T extends BaseUiStateType> {

  private _state: T;

  private wss: WebSocket.Server;

  constructor(initial: T, config: {
    httpServer: Server,
  }) {
    this._state = initial;

    this.wss = new WebSocket.Server({ server: config.httpServer });
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
   * Read a snapshot of the current state value of the given key
   */
  get<TKey extends keyof T>(key: TKey) {
    return this._state[key].value as T[TKey]["value"];
  }

}
