import { Server } from "http";
import { YuzuServer } from "../../dist";
import { FixtureStatus, INITIAL_UI_STATE, ShadeStatus } from "../shared/ui-state-definition";

export class YuzuService {

  private yuzu: YuzuServer<typeof INITIAL_UI_STATE>;

  constructor(opts: {
    server: Server | undefined,
    port: number | undefined,
  }) {
    this.yuzu = new YuzuServer(INITIAL_UI_STATE, {
      serverRef: opts.server,
      serverConfig: opts.port ? {
        port: opts.port,
      } : undefined,
    });
  }

  // State could be updated by listening to other parts of the application,
  // or receiving method calls from other parts of the application.

  updateShadeStatus(id: string, status: ShadeStatus) {
    const shadeIndex = this.yuzu.state.shades.findIndex(s => s.id === id);
    if (shadeIndex > -1) {
      this.yuzu.state.shades[shadeIndex] = status;
    } else {
      this.yuzu.state.shades.push(status);
    }
  }

  updateFixture(id: string, status: FixtureStatus) {
    const fixIndex = this.yuzu.state.fixtures.findIndex(f => f.id === id);
    if (fixIndex > -1) {
      this.yuzu.state.fixtures[fixIndex] = status;
    } else {
      this.yuzu.state.fixtures.push(status);
    }
  }

}
