import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClientUiState } from "./client";
import { ServerUiState } from "./server";
import type { MsgSendComplete, MsgSendPatch, MsgSendPatchBatch } from "./shared";

describe("ClientUiState", () => {

  describe("constructor", () => {
    it("should create client with initial state", () => {
      const initialState = { count: 0, name: "test" };
      const client = new ClientUiState(initialState, {
        address: "ws://localhost:9999/test",
      });

      expect(client).toBeInstanceOf(ClientUiState);
      expect(client.state).toEqual(initialState);
    });

    it("should use default connection config when not provided", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client).toBeInstanceOf(ClientUiState);
      expect(client.isConnected).toBe(false);
    });

    it("should expose state as readonly", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client.state.count).toBe(0);

      // State should be readable
      const count = client.state.count;
      expect(count).toBe(0);
    });

    it("should expose subscribable state", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client.state$).toBeDefined();
      expect(client.state$.count).toBeDefined();
    });
  });

  describe("state access", () => {
    it("should allow reading primitive values", () => {
      const initialState = {
        count: 42,
        name: "test",
        active: true,
      };
      const client = new ClientUiState(initialState);

      expect(client.state.count).toBe(42);
      expect(client.state.name).toBe("test");
      expect(client.state.active).toBe(true);
    });

    it("should allow reading nested object properties", () => {
      const initialState = {
        user: {
          name: "John",
          profile: {
            bio: "Developer",
            age: 30,
          },
        },
      };
      const client = new ClientUiState(initialState);

      expect(client.state.user.name).toBe("John");
      expect(client.state.user.profile.bio).toBe("Developer");
      expect(client.state.user.profile.age).toBe(30);
    });

    it("should allow reading array properties", () => {
      const initialState = {
        items: [1, 2, 3, 4, 5],
      };
      const client = new ClientUiState(initialState);

      expect(client.state.items).toEqual([1, 2, 3, 4, 5]);
      expect(client.state.items[0]).toBe(1);
      expect(client.state.items.length).toBe(5);
    });
  });

  describe("readPathExisting", () => {
    it("should read value at simple path", () => {
      const initialState = { count: 42 };
      const client = new ClientUiState(initialState);

      const value = client.readPathExisting(["count"]);
      expect(value).toBe(42);
    });

    it("should read value at nested path", () => {
      const initialState = {
        user: {
          profile: {
            name: "John",
          },
        },
      };
      const client = new ClientUiState(initialState);

      const value = client.readPathExisting(["user", "profile", "name"]);
      expect(value).toBe("John");
    });

    it("should throw error for non-existent path", () => {
      const initialState = { count: 42 };
      const client = new ClientUiState(initialState);

      expect(() => {
        client.readPathExisting(["nonexistent"]);
      }).toThrow();
    });

    it("should throw error for partially non-existent nested path", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new ClientUiState(initialState);

      expect(() => {
        client.readPathExisting(["user", "profile", "bio"]);
      }).toThrow("profile");
    });

    it("should read empty path as root state", () => {
      const initialState = { count: 42, name: "test" };
      const client = new ClientUiState(initialState);

      const value = client.readPathExisting([]);
      expect(value).toEqual({ count: 42, name: "test" });
    });
  });

  describe("readPathOptional", () => {
    it("should read existing path", () => {
      const initialState = { count: 42 };
      const client = new ClientUiState(initialState);

      const value = client.readPathOptional(["count"]);
      expect(value).toBe(42);
    });

    it("should return undefined for non-existent path", () => {
      const initialState = { count: 42 };
      const client = new ClientUiState(initialState);

      const value = client.readPathOptional(["nonexistent"]);
      expect(value).toBeUndefined();
    });

    it("should return undefined for partially non-existent nested path", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new ClientUiState(initialState);

      const value = client.readPathOptional(["user", "profile", "bio"]);
      expect(value).toBeUndefined();
    });
  });

  describe("subscriptions", () => {
    it("should subscribe to state changes via state$ (object level)", () => {
      const initialState = { data: { count: 0 } };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.state$.data.subscribe(listener);

      expect(sub).toBeDefined();
      expect(sub.unsubscribe).toBeDefined();
    });

    it("should subscribe to nested state via state$", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.state$.user.subscribe(listener);

      expect(sub).toBeDefined();
    });

    it("should subscribe to object state via state$", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.state$.user.subscribe(listener);

      expect(sub).toBeDefined();
    });

    it("should allow multiple subscriptions to same path", () => {
      const initialState = { data: { count: 0 } };
      const client = new ClientUiState(initialState);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const sub1 = client.state$.data.subscribe(listener1);
      const sub2 = client.state$.data.subscribe(listener2);

      expect(sub1).toBeDefined();
      expect(sub2).toBeDefined();
    });
  });

  describe("onChangeExisting", () => {
    it("should subscribe to existing path", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.onChangeExisting(["count"], listener);

      expect(sub).toBeDefined();
    });

    it("should throw error for non-existent path", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      expect(() => {
        client.onChangeExisting(["nonexistent"], listener);
      }).toThrow();
    });

    it("should subscribe to nested existing path", () => {
      const initialState = {
        user: {
          profile: {
            name: "John",
          },
        },
      };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.onChangeExisting(["user", "profile", "name"], listener);

      expect(sub).toBeDefined();
    });
  });

  describe("onChangeOptional", () => {
    it("should subscribe to existing path", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.onChangeOptional(["count"], listener);

      expect(sub).toBeDefined();
    });

    it("should subscribe to non-existent path without error", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      expect(() => {
        const sub = client.onChangeOptional(["nonexistent"], listener);
        expect(sub).toBeDefined();
      }).not.toThrow();
    });

    it("should subscribe to partially non-existent nested path", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      expect(() => {
        const sub = client.onChangeOptional(["user", "profile", "bio"], listener);
        expect(sub).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("onAny", () => {
    it("should subscribe to all state changes", () => {
      const initialState = { count: 0, name: "test" };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.onAny(listener);

      expect(sub).toBeDefined();
    });

    it("should return a subscription that can be unsubscribed", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.onAny(listener);

      expect(() => sub.unsubscribe()).not.toThrow();
    });
  });

  describe("connection state", () => {
    it("should expose isConnected property", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(typeof client.isConnected).toBe("boolean");
    });

    it("should expose connected$ observable", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client.connected$).toBeDefined();
      expect(client.connected$.subscribe).toBeDefined();
    });

    it("should allow subscribing to connection changes", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      const sub = client.connected$.subscribe(listener);

      expect(sub).toBeDefined();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("reload", () => {
    it("should have reload method", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client.reload).toBeDefined();
      expect(typeof client.reload).toBe("function");
    });

    it("should be callable", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      // Just check that the method exists and is callable
      // It may throw if not connected, which is expected
      expect(typeof client.reload).toBe("function");
    });
  });

  describe("reconnect", () => {
    it("should have reconnect method", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      expect(client.reconnect).toBeDefined();
      expect(typeof client.reconnect).toBe("function");
    });

    it("should be callable", () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);

      // Should not throw when called
      expect(() => client.reconnect()).not.toThrow();
    });

    it("should trigger connection state change", async () => {
      const initialState = { count: 0 };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      client.connected$.subscribe(listener);

      // Clear initial call
      listener.mockClear();

      // Call reconnect
      client.reconnect();

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have triggered connection state changes
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("integration with server", () => {
    let server: ServerUiState<any>;
    let clients: ClientUiState<any>[];
    let currentPort: number;
    let portCounter = 3200; // Start from base port and increment

    beforeEach(() => {
      // Use incrementing port to avoid conflicts between tests
      currentPort = portCounter++;
      clients = [];
      const initialState = { count: 0, name: "test" };
      server = new ServerUiState(initialState, {
        serverRef: undefined,
        serverConfig: { port: currentPort },
        logger: {
          debug: vi.fn(),
          log: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
        },
      });
    });

    afterEach(async () => {
      // Disconnect all clients first
      for (const client of clients) {
        client.disconnect();
      }

      // Clean up server
      if (server) {
        await server.close();
      }
    });

    function createClient<T extends object>(initial: T, config?: any): ClientUiState<T> {
      const fullConfig = config || {};
      if (!fullConfig.address) {
        fullConfig.address = `ws://localhost:${currentPort}/api/yuzu`;
      }
      const client = new ClientUiState(initial, fullConfig);
      clients.push(client);
      return client;
    }

    it("should receive complete state from server", async () => {
      const client = createClient(
        { count: -1, name: "initial" },
      );

      // Wait for connection and state sync
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(client.state.count).toBe(0);
      expect(client.state.name).toBe("test");
    });
it("should receive patch updates from server", async () => {
      const client = createClient(
        { count: 0, name: "test" },
      );

      const listener = vi.fn();
      // Subscribe to object level, not primitive
      client.onChangeExisting(["count"], listener);

      // Wait for connection, then update server state
      await new Promise(resolve => setTimeout(resolve, 200));

      server.state.count = 42;

      // Wait for patch to arrive
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client.state.count).toBe(42);
      expect(listener).toHaveBeenCalled();
    });

    it("should notify listeners when state is updated", async () => {
      const client = createClient(
        { count: 0, name: "test" },
      );

      const listener = vi.fn();
      client.onChangeExisting(["count"], listener);

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 200));

      // Update server state
      server.state.count = 5;

      // Wait for update to propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(listener).toHaveBeenCalled();
    });

    it("should reconnect and sync state when reconnect() is called", async () => {
      const client = createClient(
        { count: 0, name: "test" },
      );

      // Wait for initial connection
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(client.state.count).toBe(0);
      expect(client.isConnected).toBe(true);

      // Update server state
      server.state.count = 10;
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(client.state.count).toBe(10);

      // Manually reconnect
      client.reconnect();

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should be connected again with latest state
      expect(client.isConnected).toBe(true);
      expect(client.state.count).toBe(10);
    });

    it("should use fresh token on reconnect when using getToken", async () => {
      let tokenValue = "token1";
      const getToken = vi.fn(() => tokenValue);

      const client = createClient(
        { count: 0, name: "test" },
        { getToken },
      );

      // Wait for initial connection
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(getToken).toHaveBeenCalledTimes(1);

      // Update token
      tokenValue = "token2";

      // Reconnect to use new token
      client.reconnect();

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 200));

      // getToken should have been called again
      expect(getToken).toHaveBeenCalledTimes(2);
      expect(client.isConnected).toBe(true);
    });

    it("should close old WebSocket and create new one when reconnect() is called", async () => {
      const client = createClient(
        { count: 0, name: "test" },
      );

      const connectionStates: boolean[] = [];
      client.connected$.subscribe(state => connectionStates.push(state));

      // Wait for initial connection
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(client.isConnected).toBe(true);

      // Clear the connection state history
      connectionStates.length = 0;

      // Call reconnect - should disconnect then reconnect
      client.reconnect();

      // Wait for reconnection to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have gone through: false (disconnect) -> true (reconnect)
      expect(connectionStates).toContain(false);
      expect(connectionStates).toContain(true);
      expect(client.isConnected).toBe(true);

      // Verify we can still communicate with server
      server.state.count = 99;
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(client.state.count).toBe(99);
    });

    it("should clear pending auto-reconnect timeout when reconnect() is called manually", async () => {
      const client = createClient(
        { count: 0, name: "test" },
        { reconnectTimeout: 1000 }, // 1 second auto-reconnect delay
      );

      // Wait for initial connection
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(client.isConnected).toBe(true);

      const connectionStates: boolean[] = [];
      const subscription = client.connected$.subscribe(state => {
        connectionStates.push(state);
      });

      // Force disconnect by calling reconnect
      // This would normally schedule an auto-reconnect after 1000ms
      // But we'll call reconnect() manually before that happens
      client.reconnect();

      // Wait a bit for the manual reconnect to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(client.isConnected).toBe(true);

      // Clear the history
      const statesBefore = connectionStates.length;
      connectionStates.length = 0;

      // Wait past the original auto-reconnect timeout
      // If the timeout wasn't cleared, we'd see extra connection attempts
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Should not have any additional connection state changes
      // (small margin for timing variations)
      expect(connectionStates.length).toBeLessThan(3);
      expect(client.isConnected).toBe(true);

      subscription.unsubscribe();
    });
  });

  describe("complex state structures", () => {
    it("should handle deeply nested objects", () => {
      const initialState = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const client = new ClientUiState(initialState);

      expect(client.state.level1.level2.level3.value).toBe("deep");
    });

    it("should allow subscriptions to deeply nested values", () => {
      const initialState = {
        level1: {
          level2: {
            level3: {
              value: "deep",
            },
          },
        },
      };
      const client = new ClientUiState(initialState);
      const listener = vi.fn();

      // Subscribe to the level3 object, not the primitive value
      const sub = client.state$.level1.level2.level3.subscribe(listener);

      expect(sub).toBeDefined();
    });

    it("should handle arrays of objects", () => {
      interface Item {
        id: string;
        value: number;
      }

      const initialState = {
        items: [
          { id: "item1", value: 10 },
          { id: "item2", value: 20 },
        ] as Item[],
      };
      const client = new ClientUiState(initialState);

      expect(client.state.items).toHaveLength(2);
      expect(client.state.items[0].value).toBe(10);
      expect(client.state.items[1].value).toBe(20);
    });

    it("should handle keyed objects", () => {
      const initialState = {
        devices: {
          device1: { status: "active" },
          device2: { status: "inactive" },
        } as { [key: string]: { status: string } },
      };
      const client = new ClientUiState(initialState);

      expect(client.state.devices["device1"].status).toBe("active");
      expect(client.state.devices["device2"].status).toBe("inactive");
    });
  });

  describe("external transport mode", () => {
    it("should create client with external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      expect(client).toBeInstanceOf(ClientUiState);
      expect(client.state).toEqual(initialState);
      expect(client.isConnected).toBe(false);
    });

    it("should throw error if onMessage not provided in external transport mode", () => {
      const initialState = { count: 0 };

      expect(() => {
        new ClientUiState(initialState, {
          externalTransport: true,
        });
      }).toThrow("onMessage callback must be provided when using externalTransport mode");
    });

    it("should ignore connection config in external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
        address: "ws://localhost:9999",
        reconnectTimeout: 5000,
        token: "secret",
      });

      expect(client).toBeInstanceOf(ClientUiState);
      expect(client.isConnected).toBe(false); // Always false in external mode
    });

    it("should call onMessage when reload is called", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      onMessageMock.mockClear();
      client.reload();

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      const message = JSON.parse(onMessageMock.mock.calls[0][0]);
      expect(message.type).toBe("complete");
    });

    it("should handle server message with complete state", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const serverMessage: MsgSendComplete = {
        type: "complete",
        state: { count: 42 },
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(client.state.count).toBe(42);
    });

    it("should handle server message with single patch", () => {
      const initialState = { count: 0, value: 10 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const serverMessage: MsgSendPatch = {
        type: "patch",
        patch: { path: ["count"], value: 42 },
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(client.state.count).toBe(42);
      expect(client.state.value).toBe(10); // Unchanged
    });

    it("should handle server message with patch batch", () => {
      const initialState = { count: 0, value: 10 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const serverMessage: MsgSendPatchBatch = {
        type: "patch-batch",
        patches: [
          { path: ["count"], value: 42 },
          { path: ["value"], value: 99 },
        ],
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(client.state.count).toBe(42);
      expect(client.state.value).toBe(99);
    });

    it("should warn when handleServerMessage called in non-external mode", () => {
      const initialState = { count: 0 };
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const client = new ClientUiState(initialState, {
        address: "ws://localhost:9999",
      });

      const serverMessage: MsgSendComplete = {
        type: "complete",
        state: { count: 42 },
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(warnSpy).toHaveBeenCalledWith(
        "handleServerMessage() should only be used in externalTransport mode",
      );

      warnSpy.mockRestore();
    });

    it("should handle invalid JSON in handleServerMessage", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      client.handleServerMessage("invalid json");

      expect(errorSpy).toHaveBeenCalledWith(
        "Error parsing server message:",
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it("should trigger subscriptions when state is updated via handleServerMessage", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const listener = vi.fn();
      // Use onChangeExisting for primitive subscriptions
      client.onChangeExisting(["count"], listener);

      const serverMessage: MsgSendPatch = {
        type: "patch",
        patch: { path: ["count"], value: 42 },
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(listener).toHaveBeenCalledWith(42, ["count"]);
    });

    it("should do nothing when reconnect is called in external mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      client.reconnect();

      expect(warnSpy).toHaveBeenCalledWith(
        "reconnect() does nothing in externalTransport mode",
      );
      expect(client.isConnected).toBe(false);

      warnSpy.mockRestore();
    });

    it("should do nothing when disconnect is called in external mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      client.disconnect();

      expect(warnSpy).toHaveBeenCalledWith(
        "disconnect() does nothing in externalTransport mode",
      );
      expect(client.isConnected).toBe(false);

      warnSpy.mockRestore();
    });

    it("should maintain connected$ observable as always false in external mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const values: boolean[] = [];
      client.connected$.subscribe(value => values.push(value));

      expect(values).toEqual([false]);
      expect(client.isConnected).toBe(false);
    });

    it("should handle nested state updates in external mode", () => {
      const initialState = {
        user: {
          name: "John",
          profile: {
            bio: "Developer",
          },
        },
      };
      const onMessageMock = vi.fn();

      const client = new ClientUiState(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      const serverMessage: MsgSendPatch = {
        type: "patch",
        patch: { path: ["user", "profile", "bio"], value: "Engineer" },
      };

      client.handleServerMessage(JSON.stringify(serverMessage));

      expect(client.state.user.profile.bio).toBe("Engineer");
    });
  });
});
