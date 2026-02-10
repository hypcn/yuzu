import { ClientUiState } from "../../dist";
import { INITIAL_UI_STATE } from "../shared/ui-state-definition";

/**
 * Client UI state singleton
 */
export const state = new ClientUiState(INITIAL_UI_STATE);
