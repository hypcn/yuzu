
export const YUZU_SETTINGS = {
  SERVER_LOG_READ: false,
  SERVER_LOG_READ_FULL: false,
  SERVER_LOG_WRITE: false,

  CLIENT_DEFAULT_TARGET_ADDRESS: "ws://localhost:3000/api/yuzu",
  CLIENT_DEFAULT_RECONNECT_TIMEOUT: 3_000,
  CLIENT_LOG_READ: false,
  CLIENT_LOG_READ_FULL: false,
};

/**
 * Union type of all messages sent from the client to the server
 */
export type ClientUiMessage =
  | MsgReqComplete;

/**
 * Union type of all messages sent from the server to the client
 */
export type ServerUiMessage =
  | MsgSendComplete
  | MsgSendPatch
  | MsgSendPatchBatch;

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
export interface MsgSendComplete {
  type: "complete",
  state: object,
}

export type PatchableValueType = string | number | boolean | object | null | undefined;
// export type PatchableValueTypeName = "string" | "number" | "boolean" | "object" | "null" | "undefined";

export type StatePatch = {
  path: string[],
  value: PatchableValueType,
};

/**
 * A message from the server containing a patch to a certain path in the state object.
 * The patched value may be a value or an object
 */
export interface MsgSendPatch {
  type: "patch",
  patch: StatePatch,
}

export interface MsgSendPatchBatch {
  type: "patch-batch",
  patches: StatePatch[],
}
