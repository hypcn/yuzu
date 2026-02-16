
# Yuzu

[![npm version](https://img.shields.io/npm/v/@hypericon/yuzu.svg)](https://www.npmjs.com/package/@hypericon/yuzu)
[![npm downloads](https://img.shields.io/npm/dm/@hypericon/yuzu.svg)](https://www.npmjs.com/package/@hypericon/yuzu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-84.45%25-yellowgreen.svg)](https://github.com/hypcn/yuzu)
[![Tests](https://img.shields.io/badge/tests-126%20passing-brightgreen.svg)](https://github.com/hypcn/yuzu)

UI State Updates -> UISU -> Yuzu

CI UIs are required to display the status of devices connected to the system in real time. This may be light levels, shade positions, monitoring alerts, etc.

Yuzu provides a mechanism for Hypericon Controller Gateways to push small amounts of realtime state to all connected clients.

<!-- ![](./docs/diagrams/overview.drawio.svg) -->

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
      // Optional: Enable WebSocket compression (can reduce bandwidth by 60-80%)
      perMessageDeflate: true,
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

## Authentication

Yuzu supports optional authentication for WebSocket connections using query parameters. This allows you to secure your WebSocket endpoints while maintaining compatibility with both browser and Node.js environments.

### Server-Side Authentication

Implement authentication by providing an `authenticate` callback in the `ServerUiState` configuration. The callback receives connection information and returns `true` to accept or `false` to reject the connection. The callback can be synchronous or asynchronous (return a `Promise`).

```ts
import { ServerUiState, AuthenticationInfo } from "@hypericon/yuzu";
import { INITIAL_UI_STATE } from "./shared/ui-state";

const validTokens = new Set(["secret-token-123", "another-valid-token"]);

const uiState = new ServerUiState(INITIAL_UI_STATE, {
  serverConfig: { port: 3000 },
  
  // Synchronous authentication
  authenticate: (info: AuthenticationInfo) => {
    const token = info.queryParams.get("token");
    return validTokens.has(token || "");
  }
});
```

The `AuthenticationInfo` object provides:

- `request`: The incoming HTTP request (`IncomingMessage`)
- `queryParams`: Parsed query parameters (`URLSearchParams`)
- `origin`: The `Origin` header value (if present)

### Client-Side Authentication

Clients can provide authentication tokens in two ways:

#### Static Token

Provide a token string that will be appended to all connection attempts:

```ts
import { ClientUiState } from "@hypericon/yuzu";
import { INITIAL_UI_STATE } from "./shared/ui-state";

const uiState = new ClientUiState(INITIAL_UI_STATE, {
  address: "ws://localhost:3000",
  token: "secret-token-123"
});

await uiState.connect();
// Connects to: ws://localhost:3000?token=secret-token-123
```

#### Dynamic Token via Callback

Provide a `getToken` callback for dynamic token retrieval (e.g., refreshing expired tokens). The callback can be synchronous or asynchronous:

```ts
const uiState = new ClientUiState(INITIAL_UI_STATE, {
  address: "ws://localhost:3000",
  getToken: async () => {
    // Fetch fresh token from your auth service
    const response = await fetch("/api/auth/token");
    const data = await response.json();
    return data.token;
  }
});

await uiState.connect();
```

### Real-World Examples

#### JWT Authentication

```ts
// Server
import jwt from 'jsonwebtoken';

const uiState = new ServerUiState(INITIAL_UI_STATE, {
  serverConfig: { port: 3000 },
  authenticate: async (info: AuthenticationInfo) => {
    try {
      const token = info.queryParams.get("token");
      if (!token) return false;
      
      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      console.log(`Authenticated user: ${decoded.userId}`);
      return true;
    } catch (err) {
      console.error("JWT verification failed:", err);
      return false;
    }
  }
});

// Client
const uiState = new ClientUiState(INITIAL_UI_STATE, {
  address: "ws://localhost:3000",
  getToken: async () => {
    // Get JWT from localStorage or auth service
    return localStorage.getItem("jwtToken") || "";
  }
});
```

#### Token Refresh on Reconnection

The `getToken` callback is called on every connection attempt, making it ideal for token refresh scenarios:

```ts
const uiState = new ClientUiState(INITIAL_UI_STATE, {
  address: "ws://localhost:3000",
  getToken: async () => {
    // Check if token is expired
    const token = localStorage.getItem("token");
    const expiry = localStorage.getItem("tokenExpiry");
    
    if (!token || Date.now() > parseInt(expiry || "0")) {
      // Refresh token if expired
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include"
      });
      const data = await response.json();
      
      localStorage.setItem("token", data.token);
      localStorage.setItem("tokenExpiry", data.expiry);
      return data.token;
    }
    
    return token;
  }
});
```

### Security Best Practices

1. **Use WSS (WebSocket Secure)** in production: `wss://your-domain.com`
2. **Short-lived tokens**: Use tokens with expiration times (e.g., JWT with exp claim)
3. **Token rotation**: Implement token refresh mechanisms for long-running connections
4. **Rate limiting**: Consider rate-limiting authentication attempts to prevent brute-force attacks
5. **HTTPS for token retrieval**: Always fetch tokens over HTTPS to prevent interception
6. **Origin validation**: Use `info.origin` to validate the request origin when applicable
7. **Error handling**: The `authenticate` callback should handle errors gracefully; if it throws, the connection will be rejected

### Backward Compatibility

Authentication is completely optional. Existing code without authentication continues to work unchanged:

```ts
// No authentication - works as before
const uiState = new ServerUiState(INITIAL_UI_STATE, {
  serverConfig: { port: 3000 }
});
```

## External Transport Mode

Yuzu's external transport mode allows you to use your own communication layer (WebSocket, HTTP polling, Server-Sent Events, WebRTC, etc.) instead of the built-in WebSocket server. This is useful when:

- You already have a WebSocket connection and don't want to create a second one
- You want to integrate Yuzu into an existing communication infrastructure
- You need full control over the transport layer (authentication, compression, routing, etc.)
- You want to use a different transport mechanism entirely

### How It Works

In external transport mode, Yuzu focuses solely on state synchronization. You're responsible for:

1. Managing the connection/transport
2. Sending Yuzu's messages to clients/server
3. Forwarding received messages back to Yuzu

Yuzu continues to handle:

- State change detection
- Message serialization
- Patch generation and batching
- Subscription management
- State synchronization logic

### Server-Side External Transport

Configure the server with `externalTransport: true` and provide an `onMessage` callback:

```ts
import { ServerUiState } from "@hypericon/yuzu";
import WebSocket, { WebSocketServer } from "ws";
import { INITIAL_UI_STATE } from "./shared/ui-state";

// Create your own WebSocket server
const wss = new WebSocketServer({ port: 3000, path: "/ws" });

// Map to track clients by ID
const clients = new Map<string, WebSocket>();
let nextClientId = 1;

// Create Yuzu server in external transport mode
const yuzuServer = new ServerUiState(INITIAL_UI_STATE, {
  externalTransport: true,
  onMessage: (message, clientId) => {
    if (clientId) {
      // Send to specific client (e.g., for full state reload)
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    } else {
      // Broadcast to all clients (e.g., for state patches)
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  },
});

// Forward incoming messages to Yuzu
wss.on("connection", (ws) => {
  const clientId = `client-${nextClientId++}`;
  clients.set(clientId, ws);

  ws.on("message", (data) => {
    // Pass clientId so Yuzu can send targeted responses
    yuzuServer.handleClientMessage(data.toString(), clientId);
  });

  ws.on("close", () => {
    clients.delete(clientId);
  });
});

// Use state as normal - updates are sent via your onMessage callback
yuzuServer.state.counter++;
```

**Server Configuration:**

- `externalTransport: true` - Disables built-in WebSocket server
- `onMessage: (message: string, clientId?: string) => void` - **Required** callback for sending messages to clients
  - `message` - JSON-stringified message to send
  - `clientId` - When provided, send only to this specific client (e.g., full state reload). When undefined, broadcast to all clients (e.g., state patches).
- `serverRef`, `serverConfig`, `path`, `authenticate` - Ignored in external transport mode

**Methods:**

- `handleClientMessage(message: string, clientId?: string)` - Call this with incoming messages from clients
  - `message` - JSON-stringified message from the client
  - `clientId` - Optional identifier for the client. Used for targeted responses like full state reloads.
- All other methods and properties work as normal

**Targeted Messaging:** The optional `clientId` parameter enables bandwidth optimization. When a single client requests the full state (via `reload()`), only that client receives the response instead of broadcasting to all clients. State patches are still broadcast to all clients (no `clientId`).

### Client-Side External Transport

Configure the client with `externalTransport: true` and provide an `onMessage` callback:

```ts
import { ClientUiState } from "@hypericon/yuzu";
import { INITIAL_UI_STATE } from "./shared/ui-state";

// Create your own WebSocket connection
const ws = new WebSocket("ws://localhost:3000/ws");

// Create Yuzu client in external transport mode
const yuzuClient = new ClientUiState(INITIAL_UI_STATE, {
  externalTransport: true,
  onMessage: (message) => {
    // Send Yuzu messages through your WebSocket
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  },
});

// Forward incoming messages to Yuzu
ws.addEventListener("open", () => {
  // Request initial state from server
  yuzuClient.reload();
});

ws.addEventListener("message", (event) => {
  yuzuClient.handleServerMessage(event.data);
});

// Use state and subscriptions as normal
yuzuClient.state$.counter.subscribe((value) => {
  console.log("Counter:", value);
});
```

**Client Configuration:**

- `externalTransport: true` - Disables built-in WebSocket connection
- `onMessage: (message: string) => void` - **Required** callback for sending messages to server
- `address`, `reconnectTimeout`, `token`, `getToken` - Ignored in external transport mode

**Methods:**

- `handleServerMessage(message: string)` - Call this with incoming messages from the server
- `reload()` - Request full state from server (sends message via your `onMessage` callback)
- `reconnect()`, `disconnect()` - Do nothing in external transport mode (your responsibility)
- All subscription and state reading methods work as normal

**Properties:**

- `connected$` and `isConnected` - Always return `false` in external transport mode (manage your own connection state)

### Complete Example

See the [external-transport example](./example/external-transport) for a working demonstration of using Yuzu with your own WebSocket connection.

### Alternative Transport Examples

**HTTP Polling (Server):**

```ts
import express from "express";
import { ServerUiState } from "@hypericon/yuzu";

const app = express();
app.use(express.json());

const pendingMessages = new Map<string, string[]>();

const yuzuServer = new ServerUiState(INITIAL_UI_STATE, {
  externalTransport: true,
  onMessage: (message, clientId) => {
    if (clientId) {
      // Store message for specific client
      if (!pendingMessages.has(clientId)) {
        pendingMessages.set(clientId, []);
      }
      pendingMessages.get(clientId)!.push(message);
    } else {
      // Broadcast to all clients
      for (const [id, messages] of pendingMessages.entries()) {
        messages.push(message);
      }
    }
  },
});

// Client polls this endpoint
app.get("/poll/:clientId", (req, res) => {
  const clientId = req.params.clientId;
  const messages = pendingMessages.get(clientId) || [];
  pendingMessages.set(clientId, []); // Clear after sending
  res.json({ messages });
});

// Client sends messages to this endpoint
app.post("/message/:clientId", (req, res) => {
  const clientId = req.params.clientId;
  yuzuServer.handleClientMessage(JSON.stringify(req.body), clientId);
  res.sendStatus(200);
});
```

**Server-Sent Events (Server):**

```ts
import express from "express";
import { ServerUiState } from "@hypericon/yuzu";

const app = express();
const clients = new Map<string, express.Response>();

const yuzuServer = new ServerUiState(INITIAL_UI_STATE, {
  externalTransport: true,
  onMessage: (message, clientId) => {
    if (clientId) {
      // Send to specific client
      const client = clients.get(clientId);
      if (client) {
        client.write(`data: ${message}\n\n`);
      }
    } else {
      // Broadcast to all connected SSE clients
      clients.forEach((client) => {
        client.write(`data: ${message}\n\n`);
      });
    }
  },
});

app.get("/events/:clientId", (req, res) => {
  const clientId = req.params.clientId;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  
  clients.set(clientId, res);
  
  req.on("close", () => {
    clients.delete(clientId);
  });
});

// Endpoint for client messages
app.post("/message/:clientId", (req, res) => {
  const clientId = req.params.clientId;
  yuzuServer.handleClientMessage(JSON.stringify(req.body), clientId);
  res.sendStatus(200);
});
```

### Migration Guide

Switching from standard mode to external transport mode is straightforward:

**Before (Standard Mode):**

```ts
// Server
const yuzu = new ServerUiState(initialState, {
  serverConfig: { port: 3000 }
});

// Client
const yuzu = new ClientUiState(initialState, {
  address: "ws://localhost:3000/api/yuzu"
});
```

**After (External Transport Mode):**

```ts
// Server
const myWss = new WebSocketServer({ port: 3000 });
const clients = new Map<string, WebSocket>();
let nextId = 1;

const yuzu = new ServerUiState(initialState, {
  externalTransport: true,
  onMessage: (msg, clientId) => {
    if (clientId) {
      // Send to specific client
      clients.get(clientId)?.send(msg);
    } else {
      // Broadcast to all
      myWss.clients.forEach(c => c.send(msg));
    }
  }
});

myWss.on("connection", ws => {
  const clientId = `c${nextId++}`;
  clients.set(clientId, ws);
  ws.on("message", data => yuzu.handleClientMessage(data.toString(), clientId));
  ws.on("close", () => clients.delete(clientId));
});

// Client
const myWs = new WebSocket("ws://localhost:3000");
const yuzu = new ClientUiState(initialState, {
  externalTransport: true,
  onMessage: (msg) => myWs.send(msg)
});
myWs.addEventListener("message", e => yuzu.handleServerMessage(e.data));
myWs.addEventListener("open", () => yuzu.reload());
```

All state access, subscriptions, and other Yuzu APIs remain identical!

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

- [ ] More docs?
- [ ] More error handling?
- [ ] Add performance benchmarks
- [ ] Add mutation testing
- [ ] Increase coverage > 90%
- [ ] Add E2E tests for real-world scenarios
- [ ] Consider optimisation for array operations
- [ ] ? Add CI/CD
