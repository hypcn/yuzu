/**
 * Example demonstrating external transport mode on the client.
 * In this example, we manage our own WebSocket connection and use Yuzu
 * to handle state synchronization without creating a second WebSocket.
 */

import { ClientUiState } from "../../src/client";

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

// Create our own WebSocket connection
const ws = new WebSocket("ws://localhost:3000/ws");

// Create Yuzu client in external transport mode
const yuzuClient = new ClientUiState(initialState, {
  externalTransport: true,
  onMessage: (message) => {
    // Send Yuzu messages through our WebSocket
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  },
});

// Handle incoming WebSocket messages
ws.addEventListener("open", () => {
  console.log("Connected to server");
  // Request the full state from the server
  yuzuClient.reload();
});

ws.addEventListener("message", (event) => {
  // Forward server messages to Yuzu
  yuzuClient.handleServerMessage(event.data);
});

ws.addEventListener("close", () => {
  console.log("Disconnected from server");
});

ws.addEventListener("error", (error) => {
  console.error("WebSocket error:", error);
});

// Subscribe to state changes
yuzuClient.state$.counter.subscribe((value) => {
  console.log("Counter updated:", value);
  updateUI();
});

yuzuClient.state$.users.subscribe((value) => {
  console.log("Users updated:", value);
  updateUI();
});

yuzuClient.state$.status.subscribe((value) => {
  console.log("Status updated:", value);
  updateUI();
});

// Update UI elements
function updateUI() {
  const counterEl = document.getElementById("counter");
  const usersEl = document.getElementById("users");
  const statusEl = document.getElementById("status");

  if (counterEl) counterEl.textContent = String(yuzuClient.state.counter);
  if (usersEl)
    usersEl.textContent =
      yuzuClient.state.users.join(", ") || "No users yet";
  if (statusEl) statusEl.textContent = yuzuClient.state.status;
}
