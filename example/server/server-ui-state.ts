import { Server } from "http";
import { ServerUiState } from "../../dist";
import { FixtureStatus, INITIAL_UI_STATE, ShadeStatus } from "../shared/ui-state-definition";

export class UiStateService {

  private uiState: ServerUiState<typeof INITIAL_UI_STATE>;

  constructor(opts: {
    server: Server | undefined,
    port: number | undefined,
  }) {
    this.uiState = new ServerUiState(INITIAL_UI_STATE, {
      serverRef: opts.server,
      serverConfig: opts.port ? {
        port: opts.port,
      } : undefined,
    });
  }

  // State could be updated by listening to other parts of the application,
  // or receiving method calls from other parts of the application.

  updateShadeStatus(id: string, status: ShadeStatus) {
    const shadeIndex = this.uiState.state.shades.findIndex(s => s.id === id);
    if (shadeIndex > -1) {
      this.uiState.state.shades[shadeIndex] = status;
    } else {
      this.uiState.state.shades.push(status);
    }
  }

  updateFixture(id: string, status: FixtureStatus) {
    const fixIndex = this.uiState.state.fixtures.findIndex(f => f.id === id);
    if (fixIndex > -1) {
      this.uiState.state.fixtures[fixIndex] = status;
    } else {
      this.uiState.state.fixtures.push(status);
    }
  }

}
