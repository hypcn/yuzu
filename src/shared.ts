import { BehaviorSubject } from "rxjs";


export const YUZU_SETTINGS = {
  SERVER_LOG_READ: false,
  SERVER_LOG_READ_FULL: false,
  SERVER_LOG_WRITE: false,

  CLIENT_DEFAULT_TARGET_ADDRESS: "ws://localhost:3000/api/yuzu",
  CLIENT_DEFAULT_RECONNECT_TIMEOUT: 3_000,
};


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
  | MsgReqLoadAll
  | MsgReqComplete;

/**
 * Union type of all messages sent from the server to the client
 */
export type ServerUiMessage =
  | MsgSendAll
  | MsgSendUpdate
  | MsgSendComplete
  | MsgSendPatch;

/**
 * A request from the client for the entire state object.
 * Used on startup and reconnection.
 */
export interface MsgReqLoadAll {
  type: "request_load_all",
}

/**
 * A request from the client for the entire state object.
 * Used on startup and reconnection.
 */
export interface MsgReqComplete {
  type: "complete",
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

/**
 * A message from the server containing the current complete UI state.
 */
export interface MsgSendComplete {
  type: "complete",
  state: object,
}

export type PatchableValueType = string | number | boolean | object | null | undefined;
// export type PatchableValueTypeName = "string" | "number" | "boolean" | "object" | "null" | "undefined";

/**
 * A message from the server containing a patch to a certain path in the state object.
 * The patched value may be a value or an object
 */
export interface MsgSendPatch {
  type: "patch",
  patch: {
    path: string[],
    value: PatchableValueType,
    // type: PatchableValueTypeName,
  },
}
