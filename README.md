
# Yuzu

UI State Updates -> UISU -> Yuzu

CI UIs are required to display the status of devices connected to the system in real time. This may be light levels, shade positions, monitoring alerts, etc.

Yuzu provides a mechanism for Hypericon Controller Gateways to push small amounts of realtime state to all connected clients.

![](./docs/diagrams/overview.drawio.svg)

## Quickstart

Install the library:

`npm i @hypericon/yuzu`

Typescript type definitions are included.

### Shared Definition

Create the shared initial state definition object. This specifies the type of the state objects maintained in both the client and server and provides default values.

Example:

```ts
// shared/ui-state.ts

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

/**
 * UI state object used to initialise both client and server.
 * EITHER explicitly define key types and initial values in a constant...
 */
export const INITIAL_UI_STATE = {
  shades: [] as ShadeStatus[],
  fixtures: [] as FixtureStatus[],
} as const;

/** ... OR define a separate interface... */
export interface UiState = {
  shades: ShadeStatus[],
  fixtures: FixtureStatus[],
};
/** ... and constant. */
export const INITIAL_UI_STATE: UiState = {
  shades: [],
  fixtures: [],
};
```

### Server Implementation

Implement the UI state server.

Either provide an existing HTTP server, or define a port on which to listen with a new server.

Example:

```ts
// server/ui-state/ui-state.service.ts

import { ServerUiState } from "@hypericon/yuzu";
import { Server } from "http";
import { INITIAL_UI_STATE, UiState, ShadeStatus } from "../../ui-state";

export class UiStateService {

  private uiState: ServerUiState;

  constructor(opts: { server: Server | undefined, port: number | undefined }) {
    this.uiState = new ServerUiState(INITIAL_UI_STATE, {
      serverRef: opts.server,
      serverConfig: opts.port ? { port: opts.port } : undefined,
    });

    // Example random position every 1,000 ms
    setTimeout(() => {
      const status: ShadeStatus = {
        id: "shadeID",
        statusName: "moving",
        position: Math.round(Math.random() * 100),
        alerts: [],
      };
      this.updateShadeStatus("shadeID", status);
    }, 1_000);
  }

  // State could be updated by listening to other parts of the application,
  // or receiving method calls from other parts of the application.

  updateShadeStatus(id: string, status: ShadeStatus) {
    const shadeIndex = this.uiState.state.shades.findIndex(s => s.id === id);

    // Simply interact with the state property of the ServerUiState object,
    // and all updates will be sent to all connected clients.
    if (shadeIndex > -1) {
      this.uiState.state.shades[shadeIndex] = status;
    } else {
      this.uiState.state.shades.push(status);
    }
  }
}
```

### Client Implementation

Implement the UI state client. The instance of the client UI state class should be a singleton. This is not strictly necessary, but more instances will increase network traffic for no gain.

Example Mithril page component:

```ts
// client/pages/ExampleStatePage.ts

import { ClientUiState, Subscription } from "@hypericon/yuzu";
import m from "mithril";
import { UI_STATE, INITIAL_UI_STATE } from "../../ui-state";

// Client UI state singleton reference
const uiState = new ClientUiState(INITIAL_UI_STATE);

// Example Mithril page component
export const ExampleStatePage: m.Component<{}, {
  sub: Subscription,
}> = {

  oninit() {
    this.sub = new Subscription();

    // Listen to changes on the subscribable state property
    // Every object and primitive has a .subscribe() method added for precise listening
    this.sub.add(uiState.subbableState.shades.subscribe((shades) => console.log("shades updated")));

    // Listen to changes on ALL state keys
    this.sub.add(uiState.onAny((value, path) => {
      console.log(`State path "${path.join(".")}" updated, redrawing...`);
      m.redraw();
    }));
  },

  onremove() {
    // Clean up listeners when they are finished with
    this.sub.unsubscribe();
  },

  view() {
    return m("", [
      m("h1", "UI State Example Page"),

      // Read state using the .state property
      // The .subbableState property has the same values, but reading the property ensures that .subscribe()
      // functions are set up, so can slightly decrease performance if subscribing is not immediately needed
      m("h2", "Shade Status:"),
      uiState.state.shades.map(s => {
        const alertMsg = s.alerts.length > 0 ? s.alerts.join(", ") : "no alerts";
        return m("p", `Shade ${s.id}: ${s.statusName} @${s.position}% (${alertMsg})`);
      }),

      // Read state using the .state property
      m("p", `Fixture ABC123 alerts: ${uiState.state.fixtures
                                        .filter(f => f.id === "abc123")
                                        .map(f => `${f.alerts}`)}`),
    ]);
  }

};
```

## Considerations



## Development

```sh
git clone https://github.com/hypcn/yuzu
cd yuzu
npm i
npm run dev
```

This starts a hot-reloading example of both client and server usage, and opens the client in the default browser.

## Dev Notes

Subscriptions:

say the state object is:

```ts
interface State: {
  shadeControllers: {
    [id: string]: {
      status: string,
      errors: string[],
      shades: {
        status: string,
        position: number,
        errors: string[],
      }[],
    },
  }
}

const initialState: State = {
  shadeControllers: {
    id1: {
      status: "fine",
      errors: [],
      shades: [
        { status: "fine", position: 50, errors: [] },
        { status: "fine", position: 50, errors: [] },
        { status: "error", position: 50, errors: ["overtemp"] },
      ],
    },
    id2: {
      ...
    },
    ...
  }
}
```

How do you:
- listen to all controllers
- listen to one controller
- listen to a controller's shades
- listen to one of a controller's shades

const client = new ClientState<...>(...);

const sub1 = client.state.shadeControllers.subscribe(v => { ... });
const sub2 = client.state.shadeControllers["id1"].subscribe(v => { ... });
const sub3 = client.state.shadeControllers["id1"].shades.subscribe(v => { ... });
const sub4 = client.state.shadeControllers["id1"].shades[5].subscribe(v => { ... });

[ "shadeControllers" ]
[ "shadeControllers", "id1" ]
[ "shadeControllers", "id1", "shades" ]
[ "shadeControllers", "id1", "shades", "5" ]

Modifying lighting status - [ "lighting", "status" ]
- sub1 = not triggered
- sub2 = not triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 2 status - [ "shadeControllers", "id2", "status" ]
- sub1 = triggered
- sub2 = not triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 1 status - [ "shadeControllers", "id1", "status" ]
- sub1 = triggered
- sub2 = triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 1 shade 4 status - [ "shadeControllers", "id1", "shades", "4", "status" ]
- sub1 = triggered
- sub2 = triggered
- sub3 = triggered
- sub4 = not triggered

Modifying controller 1 shade 5 status - [ "shadeControllers", "id1", "shades", "5", "status" ]
- sub1 = triggered
- sub2 = triggered
- sub3 = triggered
- sub4 = triggered

Does patch path meet all listener segments? (path path may have extra, that doesn't matter)
