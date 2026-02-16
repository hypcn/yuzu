
l# External Transport Example

This example demonstrates how to use Yuzu's external transport mode to manage state synchronization over your own WebSocket connection (or any other transport mechanism).

## Why Use External Transport?

External transport mode is useful when:

- You already have a WebSocket connection and don't want to create a second one
- You want to use a different transport mechanism (HTTP polling, Server-Sent Events, WebRTC, etc.)
- You need to integrate Yuzu into an existing communication infrastructure
- You want full control over authentication, compression, or other transport-level features

## How It Works

### Server Side

Instead of letting Yuzu create its own WebSocket server:

```typescript
const clients = new Map<string, WebSocket>();

const yuzuServer = new ServerUiState(initialState, {
  externalTransport: true,
  onMessage: (message, clientId) => {
    if (clientId) {
      // Send to specific client (e.g., full state reload)
      clients.get(clientId)?.send(message);
    } else {
      // Broadcast to all clients (e.g., state patches)
      myCustomTransport.broadcast(message);
    }
  },
});

// When you receive a message from a client:
myCustomTransport.on("message", (data, clientId) => {
  // Pass clientId for targeted responses
  yuzuServer.handleClientMessage(data, clientId);
});
```

**Bandwidth Optimization:** The optional `clientId` parameter enables efficient targeted messaging. When a client requests the full state (via `reload()`), only that specific client receives it instead of broadcasting to everyone. State patches are still broadcast to all clients.

### Client Side

Instead of letting Yuzu create its own WebSocket connection:

```typescript
const yuzuClient = new ClientUiState(initialState, {
  externalTransport: true,
  onMessage: (message) => {
    // Send this message to your server however you want
    myCustomTransport.send(message);
  },
});

// When you receive a message from the server:
myCustomTransport.on("message", (data) => {
  yuzuClient.handleServerMessage(data);
});
```

## Running This Example

1. **Start the server:**

   ```bash
   npm run dev:external-transport:server
   ```

2. **Start the client:**

   ```bash
   npm run dev:external-transport:client
   ```

3. Open your browser to the URL shown by the client dev server

## What's Different?

Compare this example to the standard example:

- **Standard mode**: Yuzu creates and manages WebSocket connections automatically
- **External transport mode**: You manage the transport layer, Yuzu just handles state synchronization

The state synchronization, subscriptions, and all other Yuzu features work exactly the same way in both modes!
