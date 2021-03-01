import { Server } from "http";
import { ServerUiState_old } from "../../src";
import { FixtureStatus, INITIAL_UI_STATE, ShadeStatus, UI_STATE } from "../shared/ui-state-definition";

export class UiStateService {

  private uiState: ServerUiState_old<typeof INITIAL_UI_STATE>;

  constructor(opts: {
    server: Server | undefined,
    port: number | undefined,
  }) {
    this.uiState = new ServerUiState_old(INITIAL_UI_STATE, {
      serverRef: opts.server,
      serverConfig: opts.port ? {
        port: opts.port,
      } : undefined,
    });
  }

  // State could be updated by listening to other parts of the application,
  // or receiving method calls from other parts of the application.

  updateShadeStatus(id: string, status: ShadeStatus) {
    const shades = this.uiState.get(UI_STATE.shades);
    const shade = shades.find(s => s.id === id);
    if (shade) {
      Object.assign(shade, status);
    } else {
      shades.push(status);
    }
    this.uiState.update(UI_STATE.shades, shades);
  }

  updateFixture(id: string, status: FixtureStatus) {
    const fixtures = this.uiState.get(UI_STATE.fixtures);
    const fix = fixtures.find(f => f.id === id);
    if (fix) {
      Object.assign(fix, status);
    } else {
      fixtures.push(status);
    }
    this.uiState.update(UI_STATE.fixtures, fixtures);
  }

}
