import { BehaviorSubject } from "rxjs";

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

/** UI state object used to initialise both client and server */
export const INITIAL_UI_STATE = {
  shades: new BehaviorSubject<ShadeStatus[]>([]),
  fixtures: new BehaviorSubject<FixtureStatus[]>([]),
} as const;

/** Optional UI state keys for easy refactoring. */
export const UI_STATE = {
  shades: "shades",
  fixtures: "fixtures",
} as const;
