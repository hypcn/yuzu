import { BehaviorSubject } from "rxjs";


/**
 * The default type for the type parameter for both client and server UI state classes.
 * 
 * All shared state definitions MUST NOT implement this interface, as it will break intellisense.
 */
export interface BaseUiStateType { [key: string]: BehaviorSubject<any> }


/**
 * Union type of all messages sent from the client to the server
 */
export type ClientUiMessage =
  | MsgReqLoadAll;

/**
 * Union type of all messages sent from the server to the client
 */
export type ServerUiMessage =
  | MsgSendAll
  | MsgSendUpdate;

/**
 * A request from the client for the entire state object.
 * Used on startup and reconnection.
 */
export interface MsgReqLoadAll {
  type: "request_load_all",
}

/**
 * A message from the server containing the current complete UI state.
 */
export interface MsgSendAll {
  type: "send_all",
  state: {
    key: string,
    value: any,
  }[],
}

/**
 * A message from the server containing the latest value of a single UI state key.
 */
export interface MsgSendUpdate {
  type: "send_update",
  state: {
    key: string,
    value: any,
  },
}
