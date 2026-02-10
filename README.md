
# Yuzu

UI State Updates -> UISU -> Yuzu

CI UIs are required to display the status of devices connected to the system in real time. This may be light levels, shade positions, monitoring alerts, etc.

Yuzu provides a mechanism for Hypericon Controller Gateways to push small amounts of realtime state to all connected clients.

![](./docs/diagrams/overview.drawio.svg)

## Quickstart

Install the library:

`npm i @hypericon/yuzu`

Typescript type definitions are included.

## Testing

Yuzu includes a comprehensive test suite with 90+ tests covering all core functionality.

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
npm run test:ui       # Run tests with UI
npm run test:coverage # Generate coverage report
```

### Breaking Changes

0.4.0

- `readPath` renamed to `readPathExisting` (`readPathOptional` added)
- `onChange` renamed to `onChangeExisting` (`onChangeOptional` added)
- `Subscription` renamed to `YuzuSubscription`

### Shared Definition

Create the shared initial state definition object. This specifies the type of the state objects maintained in both the client and server and provides default values.

> Important: The state definition object must be serialisable as JSON.

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
export interface UiState {
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

import { ClientUiState, YuzuSubscription } from "@hypericon/yuzu";
import m from "mithril";
import { UI_STATE, INITIAL_UI_STATE } from "../../ui-state";

// Client UI state singleton reference
const uiState = new ClientUiState(INITIAL_UI_STATE);

// Example Mithril page component
export const ExampleStatePage: m.Component<{}, {
  sub: YuzuSubscription,
}> = {

  oninit() {
    this.sub = new YuzuSubscription();

    // Listen to changes on the subscribable state property
    // Every object and primitive has a .subscribe() method added for precise listening
    this.sub.add(uiState.state$.shades.subscribe((shades) => console.log("shades updated")));

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
      // The .state$ property has the same values, but reading the property ensures that .subscribe()
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

## RxJS Compatibility

`YuzuSubscription` implements the RxJS `Unsubscribable` interface, making it fully compatible with the RxJS ecosystem. You can:

- Use `YuzuSubscription` anywhere an RxJS `Subscription` is expected
- Add RxJS `Subscription` objects to a `YuzuSubscription` using `.add()`
- Add plain functions as teardown logic
- Mix and match `YuzuSubscription` and RxJS `Subscription` objects

```ts
import { interval } from 'rxjs';
import { YuzuSubscription } from '@hypericon/yuzu';

const sub = new YuzuSubscription();

// Add Yuzu subscription
sub.add(uiState.state$.count.subscribe(value => console.log(value)));

// Add RxJS subscription
const rxjsSub = interval(1000).subscribe(n => console.log(n));
sub.add(rxjsSub);

// Add plain function
sub.add(() => console.log('Cleanup'));

// Unsubscribe all at once
sub.unsubscribe();
```

The `closed` property indicates whether the subscription has been unsubscribed, and calling `unsubscribe()` multiple times is safe (idempotent).

## Considerations

### Subscription Paths

In the client, any object at any depth in the state stree can be subscribed to. This includes all objects and arrays, but not primitives.

- When the entire state tree is reloaded (for example, on network reconnection) all listeners are notified.

- When the state tree is patched, only the listeners whose "path" is completely satisfied by the updated "path" are notified. Any "extra" segments in the updated path do not matter.

Simple example:

```ts
const sub = clientUi.state$.shades.controllers["id1"].subscribe(val => { ... });
```

This is a subscription to the controller with id `id1` on the `controllers` object in the `shades` object in the state tree. The "path" for this listener is:

`[ "shades", "controllers", "id1" ]`

Server Update | Updated Path | Subscription Notified
--- | --- | ---
`server.state.lighting.fixtures.push({ ... });` | [ "lighting", "fixtures" ] | No
`server.state.shades.controllers.push({ ... });` | [ "shades", "controllers" ] | No
`server.state.shades.controllers["id5"] = { ... };` | [ "shades", "controllers", "id5" ] | No
`server.state.shades.controllers["id5"].status = "Error";` | [ "shades", "controllers", "id5", "status" ] | No
`server.state.shades.controllers["id1"] = { ... };` | [ "shades", "controllers", "id1" ] | Yes ✓
`server.state.shades.controllers["id1"].status = "Error";` | [ "shades", "controllers", "id1", "status" ] | Yes ✓
`server.state.shades.controllers["id1"].shades[5].status = "Error";` | [ "shades", "controllers", "id1", "shades", "status", "5" ] | Yes ✓
`server.state.shades.controllers["id1"] = undefined;` | [ "shades", "controllers", "id1" ] | Yes ✓ (caution)
`delete server.state.shades.controllers["id1"];` | (None, no message sent) | No (no patch message sent)

**Worked Example:**

Given the following state interface definition:

```ts
interface State {
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
  },
  ...
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
  },
  ...
};
```

And the client subscriptions:

```ts
const client = new ClientUiState<...>(...);

const sub1 = client.state$.shadeControllers.subscribe(v => { ... });
const sub2 = client.state$.shadeControllers["id1"].subscribe(v => { ... });
const sub3 = client.state$.shadeControllers["id1"].shades.subscribe(v => { ... });
const sub4 = client.state$.shadeControllers["id1"].shades[5].subscribe(v => { ... });

// path1 - [ "shadeControllers" ]
// path2 - [ "shadeControllers", "id1" ]
// path3 - [ "shadeControllers", "id1", "shades" ]
// path4 - [ "shadeControllers", "id1", "shades", "5" ]
```

Here are the results of modifying the values at the given paths:

Modifying lighting status - updated path: `[ "lighting", "status" ]`
- sub1 = not triggered
- sub2 = not triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 2 status - updated path: `[ "shadeControllers", "id2", "status" ]`
- sub1 = triggered
- sub2 = not triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 1 status - updated path: `[ "shadeControllers", "id1", "status" ]`
- sub1 = triggered
- sub2 = triggered
- sub3 = not triggered
- sub4 = not triggered

Modifying controller 1 shade 4 status - updated path: `[ "shadeControllers", "id1", "shades", "4", "status" ]`
- sub1 = triggered
- sub2 = triggered
- sub3 = triggered
- sub4 = not triggered

Modifying controller 1 shade 5 status - updated path: `[ "shadeControllers", "id1", "shades", "5", "status" ]`
- sub1 = triggered
- sub2 = triggered
- sub3 = triggered
- sub4 = triggered

### Nullable State Keys

It may be the case that state keys be dynamically created/destroyed, for example for transient pieces of equipment or pieces of state. It may be desireable to access the state regarding these by some key or ID.

As shown above, the state object can be defined as such to support this case:

```ts
export interface UiState {
  ...
  transientDevices: {
    [id: string]: DeviceState | undefined,
  },
  ...
}
export interface DeviceState {
  status: string,
  ...
}
```

Note the union type.

This can be written to from the server like so:

```ts
uiState.state.transientDevices["device1"] = { ... }; // Set device to initial value
uiState.state.transientDevices["device1"] = { ... }; // Overwrite device value
uiState.state.transientDevices["device1"].status = " ... "; // Update single key in device
uiState.state.transientDevices["device1"] = undefined; // Remove device
```

And listened to from the client like so:

```ts
// Receives all updates
uiState.state$.transientDevices.subscribe(
  (allDevicesObj: { [id: string]: DeviceState | undefined }) => { ... },
);
// Receives all updates, on the last update the parameter is undefined
uiState.state$.transientDevices["device1"].subscribe((device: DeviceState | undefined) => { ... });
// Receives one update, when the status is explicitly updated
uiState.state$.transientDevices["device1"].status.subscribe((status: string) => { ... });
```

### Arrays in State Tree

Arrays are fully supported, as are all the mutation methods (e.g. `push`, `splice`, etc.).

However, due to the way they are updated internally, updates can end up being relatively "chatty" compared to objects.

For example, the push operation below:

```ts
server.state.myArray = [1, 2, 3, 4, 5];
server.state.myArray.push(10, 11);
```

results in three patches:

```
[ "myArray", "5" ]: undefined => 10
[ "myArray", "6" ]: undefined => 11
[ "myArray", "length" ]: 5 => 7
```

## Development

```sh
git clone https://github.com/hypcn/yuzu
cd yuzu
npm i
npm run dev
```

This starts a hot-reloading example of both client and server usage, and opens the client in the default browser.

### TODO

- [ ] Add performance benchmarks
- [ ] Add mutation testing
- [ ] Increase coverage to 100%
- [ ] Add E2E tests for real-world scenarios
- [ ] Consider optimisation for array operations
- [ ] ? Add CI/CD
