import { Subscription } from "rxjs";
import { BaseUiStateType, MsgReqLoadAll, ServerUiMessage } from "./shared";

const DEFAULT_TARGET_ADDRESS = "ws://localhost:3000/api/yuzu";
const DEFAULT_RECONNECT_TIMEOUT = 3_000;

export interface ClientUiStateSocketConfig {
  address: string,
  reconnectTimeout: number,
}

// TODO: add loading property that's true until an initial payload
// has been received over the websocket?

/**
 * "Bag of Observables"
 * 
 * See example web app in Kiwi repo for example usage
 */
export class ClientUiState<T extends BaseUiStateType> {

  /**
   * T is a map of:
   * [key: string] -> BehaviorSubject<SomeType>
   */
  private _state: T;

  private ws: WebSocket | undefined;
  private wsConfig: ClientUiStateSocketConfig = {
    address: DEFAULT_TARGET_ADDRESS,
    reconnectTimeout: DEFAULT_RECONNECT_TIMEOUT,
  };

  constructor(initial: T, config?: Partial<ClientUiStateSocketConfig>) {
    this._state = initial;

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

    if (msg.type === "send_all") {
      for (const { key, value } of msg.state) {
        this.update(key as keyof T, value);
      }
    }

    if (msg.type === "send_update") {
      const { key, value } = msg.state;
      this.update(key as keyof T, value);
    }

  }

  /**
   * Completely reload the UI state from the server
   */
  reload() {
    const msg: MsgReqLoadAll = {
      type: "request_load_all",
    };
    this.ws?.send(JSON.stringify(msg));
  }

  /**
   * Update the value of a state key, notifying any listeners
   */
  private update<TKey extends keyof T>(key: TKey, value: T[TKey]["value"]) {
    this._state[key].next(value);
  }

  /**
   * Overwrite the 
   */
  private overwrite(newState: { [key in keyof T]: T[keyof T]["value"] }) {
    for (const key of Object.keys(newState)) {
      const value = newState[key];
      this.update(key, value);
    }
  }

  /**
   * Listen to the state with the specified key, and call the listener function whenever it updates
   */
  listen<TKey extends keyof T>(key: TKey, listener: (value: T[TKey]["value"]) => any): Subscription {

    const stateSub = this._state[key].subscribe(value => {
      const v = value as T[TKey]["value"];
      listener(v);
    });

    return stateSub;
  }

  /**
   * Listen to all keys in the state, and call the listener function whenever any of them update
   */
  listenAll(listener: (key: keyof T, value: T[keyof T]["value"]) => any): Subscription {
    const subscription = new Subscription();

    for (const key of Object.keys(this._state)) {
      const k = key as keyof T;
      const s = this.listen(k, (value) => listener(k, value));
      subscription.add(s);
    }

    return subscription;
  }

  /**
   * Read a snapshot of the current state value of the given key
   */
  get<TKey extends keyof T>(key: TKey) {
    // More info: this value type accessor is an instance of
    // "indexed access types" also called "lookup types".
    return this._state[key].value as T[TKey]["value"];
  }
  // /**
  //  * Alias for get method
  //  */
  // read<TKey extends keyof T>(key: TKey) { return this.get(key); }

}
