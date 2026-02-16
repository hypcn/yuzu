/**
 * Example demonstrating external transport mode on the server.
 * In this example, we manage our own WebSocket server and use Yuzu
 * to handle state synchronization without creating a second WebSocket server.
 */

import { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { ServerUiState } from "../../src/server";

interface AppState {
  counter: number;
  users: string[];
  status: "idle" | "active" | "busy";
}

const initialState: AppState = {
  counter: 0,
  users: [],
  status: "idle",
};

// Create our own HTTP and WebSocket server
const httpServer = new Server((req, res) => {
  res.writeHead(200);
  res.end("External Transport Example Server");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

// Map to track clients by ID
const clients = new Map<string, WebSocket>();
let nextClientId = 1;

// Create Yuzu server in external transport mode
const yuzuServer = new ServerUiState(initialState, {
  externalTransport: true,
  onMessage: (message, clientId) => {
    if (clientId) {
      // Send to specific client (e.g., for full state reload)
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(message);
        console.log(`Sent targeted message to client ${clientId}`);
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

// Handle incoming WebSocket connections
wss.on("connection", (ws) => {
  const clientId = `client-${nextClientId++}`;
  clients.set(clientId, ws);
  console.log(`New client connected: ${clientId}`);

  // Handle messages from the client
  ws.on("message", (data) => {
    // Forward client messages to Yuzu with client ID
    yuzuServer.handleClientMessage(data.toString(), clientId);
  });

  ws.on("close", () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

// Start the server
const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});

// Simulate state changes
setInterval(() => {
  yuzuServer.state.counter++;
  yuzuServer.state.status = ["idle", "active", "busy"][
    Math.floor(Math.random() * 3)
  ] as "idle" | "active" | "busy";
}, 2000);

// Add user after 3 seconds
setTimeout(() => {
  yuzuServer.state.users.push("Alice");
  console.log("Added Alice to users");
}, 3000);

setTimeout(() => {
  yuzuServer.state.users.push("Bob");
  console.log("Added Bob to users");
}, 6000);
