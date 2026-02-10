
/**
 * Global configuration settings for Yuzu library behavior.
 * These settings control logging levels and default connection parameters.
 */
export const YUZU_SETTINGS = {
  /** Enable server-side logging of state reads */
  SERVER_LOG_READ: false,
  /** Enable detailed server-side logging of full state reads */
  SERVER_LOG_READ_FULL: false,
  /** Enable server-side logging of state writes */
  SERVER_LOG_WRITE: false,

  /** Default WebSocket address for client connections */
  CLIENT_DEFAULT_TARGET_ADDRESS: "ws://localhost:3000/api/yuzu",
  /** Default timeout in milliseconds before attempting reconnection */
  CLIENT_DEFAULT_RECONNECT_TIMEOUT: 3_000,
  /** Enable client-side logging of state reads */
  CLIENT_LOG_READ: false,
  /** Enable detailed client-side logging of full state reads */
  CLIENT_LOG_READ_FULL: false,
};

/**
 * Union type of all messages sent from the client to the server
 */
export type ClientUiMessage
  = | MsgReqComplete;

/**
 * Union type of all messages sent from the server to the client
 */
export type ServerUiMessage
  = | MsgSendComplete
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

/**
 * The types of values that can be patched in the state tree.
 * Includes all JSON-serializable primitives, objects, null, and undefined.
 */
export type PatchableValueType = string | number | boolean | object | null | undefined;
// export type PatchableValueTypeName = "string" | "number" | "boolean" | "object" | "null" | "undefined";

/**
 * Represents a single state modification at a specific path.
 * Used to send incremental updates from server to clients.
 */
export type StatePatch = {
  /** Array of keys representing the path to the value in the state tree */
  path: string[],
  /** The new value to set at the specified path */
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

/**
 * A message from the server containing multiple patches to be applied atomically.
 * Used when batching is enabled to reduce network overhead.
 */
export interface MsgSendPatchBatch {
  type: "patch-batch",
  /** Array of patches to apply to the state tree */
  patches: StatePatch[],
}
