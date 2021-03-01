import { ClientUiState_old } from "../../src";
import { INITIAL_UI_STATE } from "../shared/ui-state-definition";

/**
 * Client UI state singleton
 */
export const state = new ClientUiState_old(INITIAL_UI_STATE);
