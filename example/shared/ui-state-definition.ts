
export interface ShadeStatus {
  id: string,
  statusName: string,
  position: number,
  alerts: string[],
}
export interface FixtureStatus {
  id: string,
  brightness: number,
  alerts: string[],
}

/** Definition of the type of the shared UI state */
export interface UiState {
  shades: ShadeStatus[],
  fixtures: FixtureStatus[],
}

/** UI state object used to initialise both client and server */
export const INITIAL_UI_STATE: UiState = {
  shades: [],
  fixtures: [],
};
