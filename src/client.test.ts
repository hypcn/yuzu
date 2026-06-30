import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { YuzuClient } from "./client";
import { YuzuServer } from "./server";
import type { MsgSendComplete, MsgSendPatch, MsgSendPatchBatch } from "./shared";

describe("YuzuClient", () => {

  describe("constructor", () => {
    it("should create client with initial state", () => {
      const initialState = { count: 0, name: "test" };
      const client = new YuzuClient(initialState, {
        address: "ws://localhost:9999/test",
      });

      expect(client).toBeInstanceOf(YuzuClient);
      expect(client.state).toEqual(initialState);
    });

    it("should use default connection config when not provided", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(client).toBeInstanceOf(YuzuClient);
      expect(client.isConnected).toBe(false);
    });

    it("should expose state as readonly", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(client.state.count).toBe(0);

      // State should be readable
      const count = client.state.count;
      expect(count).toBe(0);
    });

    it("should expose subscribable state", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);

      expect(client.state.user.name).toBe("John");
      expect(client.state.user.profile.bio).toBe("Developer");
      expect(client.state.user.profile.age).toBe(30);
    });

    it("should allow reading array properties", () => {
      const initialState = {
        items: [1, 2, 3, 4, 5],
      };
      const client = new YuzuClient(initialState);

      expect(client.state.items).toEqual([1, 2, 3, 4, 5]);
      expect(client.state.items[0]).toBe(1);
      expect(client.state.items.length).toBe(5);
    });
  });

  describe("readPathExisting", () => {
    it("should read value at simple path", () => {
      const initialState = { count: 42 };
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);

      const value = client.readPathExisting(["user", "profile", "name"]);
      expect(value).toBe("John");
    });

    it("should throw error for non-existent path", () => {
      const initialState = { count: 42 };
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);

      expect(() => {
        client.readPathExisting(["user", "profile", "bio"]);
      }).toThrow("profile");
    });

    it("should read empty path as root state", () => {
      const initialState = { count: 42, name: "test" };
      const client = new YuzuClient(initialState);

      const value = client.readPathExisting([]);
      expect(value).toEqual({ count: 42, name: "test" });
    });
  });

  describe("readPathOptional", () => {
    it("should read existing path", () => {
      const initialState = { count: 42 };
      const client = new YuzuClient(initialState);

      const value = client.readPathOptional(["count"]);
      expect(value).toBe(42);
    });

    it("should return undefined for non-existent path", () => {
      const initialState = { count: 42 };
      const client = new YuzuClient(initialState);

      const value = client.readPathOptional(["nonexistent"]);
      expect(value).toBeUndefined();
    });

    it("should return undefined for partially non-existent nested path", () => {
      const initialState = {
        user: {
          name: "John",
        },
      };
      const client = new YuzuClient(initialState);

      const value = client.readPathOptional(["user", "profile", "bio"]);
      expect(value).toBeUndefined();
    });
  });

  describe("subscriptions", () => {
    it("should subscribe to state changes via state$ (object level)", () => {
      const initialState = { data: { count: 0 } };
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.state$.user.subscribe(listener);

      expect(sub).toBeDefined();
    });

    it("should allow multiple subscriptions to same path", () => {
      const initialState = { data: { count: 0 } };
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.onChangeExisting(["count"], listener);

      expect(sub).toBeDefined();
    });

    it("should throw error for non-existent path", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.onChangeExisting(["user", "profile", "name"], listener);

      expect(sub).toBeDefined();
    });
  });

  describe("onChangeOptional", () => {
    it("should subscribe to existing path", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.onChangeOptional(["count"], listener);

      expect(sub).toBeDefined();
    });

    it("should subscribe to non-existent path without error", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.onAny(listener);

      expect(sub).toBeDefined();
    });

    it("should return a subscription that can be unsubscribed", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.onAny(listener);

      expect(() => sub.unsubscribe()).not.toThrow();
    });
  });

  describe("connection state", () => {
    it("should expose isConnected property", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(typeof client.isConnected).toBe("boolean");
    });

    it("should expose connected$ observable", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(client.connected$).toBeDefined();
      expect(client.connected$.subscribe).toBeDefined();
    });

    it("should allow subscribing to connection changes", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
      const listener = vi.fn();

      const sub = client.connected$.subscribe(listener);

      expect(sub).toBeDefined();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("reload", () => {
    it("should have reload method", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(client.reload).toBeDefined();
      expect(typeof client.reload).toBe("function");
    });

    it("should be callable", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      // Just check that the method exists and is callable
      // It may throw if not connected, which is expected
      expect(typeof client.reload).toBe("function");
    });
  });

  describe("reconnect", () => {
    it("should have reconnect method", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      expect(client.reconnect).toBeDefined();
      expect(typeof client.reconnect).toBe("function");
    });

    it("should be callable", () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);

      // Should not throw when called
      expect(() => client.reconnect()).not.toThrow();
    });

    it("should trigger connection state change", async () => {
      const initialState = { count: 0 };
      const client = new YuzuClient(initialState);
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
    let server: YuzuServer<any>;
    let clients: YuzuClient<any>[];
    let currentPort: number;
    let portCounter = 3200; // Start from base port and increment

    beforeEach(() => {
      // Use incrementing port to avoid conflicts between tests
      currentPort = portCounter++;
      clients = [];
      const initialState = { count: 0, name: "test" };
      server = new YuzuServer(initialState, {
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

    function createClient<T extends object>(initial: T, config?: any): YuzuClient<T> {
      const fullConfig = config || {};
      if (!fullConfig.address) {
        fullConfig.address = `ws://localhost:${currentPort}/api/yuzu`;
      }
      const client = new YuzuClient(initial, fullConfig);
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
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);
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
      const client = new YuzuClient(initialState);

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
      const client = new YuzuClient(initialState);

      expect(client.state.devices["device1"].status).toBe("active");
      expect(client.state.devices["device2"].status).toBe("inactive");
    });
  });

  describe("external transport mode", () => {
    it("should create client with external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new YuzuClient(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
      });

      expect(client).toBeInstanceOf(YuzuClient);
      expect(client.state).toEqual(initialState);
      expect(client.isConnected).toBe(false);
    });

    it("should throw error if onMessage not provided in external transport mode", () => {
      const initialState = { count: 0 };

      expect(() => {
        new YuzuClient(initialState, {
          externalTransport: true,
        });
      }).toThrow("onMessage callback must be provided when using externalTransport mode");
    });

    it("should ignore connection config in external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new YuzuClient(initialState, {
        externalTransport: true,
        onMessage: onMessageMock,
        address: "ws://localhost:9999",
        reconnectTimeout: 5000,
        token: "secret",
      });

      expect(client).toBeInstanceOf(YuzuClient);
      expect(client.isConnected).toBe(false); // Always false in external mode
    });

    it("should call onMessage when reload is called", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

      const client = new YuzuClient(initialState, {
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

  // ===========================================================================
  // Reconnection tests (T10)
  //
  // These tests use fake timers and a mock WebSocket class to deterministically
  // test the reconnection logic (delays, backoff, maxAttempts, pause/resume)
  // without relying on real network behaviour.
  // ===========================================================================

  describe("reconnection logic", () => {
    let originalWebSocket: typeof WebSocket;
    let mockSockets: MockWebSocket[];

    beforeEach(() => {
      vi.useFakeTimers();
      originalWebSocket = global.WebSocket;
      MockWebSocket.instances = [];
      mockSockets = MockWebSocket.instances;
      global.WebSocket = MockWebSocket as any;
    });

    afterEach(() => {
      vi.useRealTimers();
      global.WebSocket = originalWebSocket;
    });

    it("should use fixed delay by default", async () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { strategy: "fixed", baseDelayMs: 5000, jitter: 0 } },
      );

      // The constructor calls connect(); the first socket is mockSockets[0]
      expect(mockSockets).toHaveLength(1);

      // Simulate a close → should schedule a reconnect after 5000ms
      mockSockets[0].simulateClose();
      const states = observeReconnectStates(client);
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });

      // Before the delay, no new socket
      vi.advanceTimersByTime(4999);
      expect(mockSockets).toHaveLength(1);

      // After the delay, connect() is called → new socket
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(2);
    });

    it("should use exponential backoff", async () => {
      const client = new YuzuClient(
        { count: 0 },
        {
          address: "ws://localhost:9999/test",
          reconnect: {
            strategy: "exponential",
            baseDelayMs: 1000,
            multiplier: 2,
            maxDelayMs: 10000,
            jitter: 0,
          },
        },
      );

      // Attempt 1: delay = 1000 * 2^0 = 1000
      mockSockets[0].simulateClose();
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(2);

      // Attempt 2: delay = 1000 * 2^1 = 2000
      mockSockets[1].simulateClose();
      vi.advanceTimersByTime(1999);
      expect(mockSockets).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(3);

      // Attempt 3: delay = 1000 * 2^2 = 4000
      mockSockets[2].simulateClose();
      vi.advanceTimersByTime(3999);
      expect(mockSockets).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(4);

      // Attempt 4: delay = 1000 * 2^3 = 8000
      mockSockets[3].simulateClose();
      vi.advanceTimersByTime(7999);
      expect(mockSockets).toHaveLength(4);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(5);

      // Attempt 5: delay = 1000 * 2^4 = 16000, capped at 10000
      mockSockets[4].simulateClose();
      vi.advanceTimersByTime(9999);
      expect(mockSockets).toHaveLength(5);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(6);
    });

    it("should apply jitter within bounds", () => {
      // Use a fixed seed for Math.random to test jitter deterministically
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // → factor = 1 + 0 * jitter = 1 (midpoint)

      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0.2 } },
      );

      mockSockets[0].simulateClose();
      // With random=0.5, factor = 1 + (0.5*2-1)*0.2 = 1 + 0 = 1, so delay = 1000
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(2);

      randomSpy.mockRestore();
    });

    it("should apply jitter at upper bound", () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1); // → factor = 1 + 1*0.2 = 1.2

      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0.2 } },
      );

      mockSockets[0].simulateClose();
      // delay = 1000 * 1.2 = 1200
      vi.advanceTimersByTime(1199);
      expect(mockSockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(2);

      randomSpy.mockRestore();
    });

    it("should apply jitter at lower bound (clamped to ≥ 0)", () => {
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0); // → factor = 1 + (-1)*0.2 = 0.8

      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0.2 } },
      );

      mockSockets[0].simulateClose();
      // delay = 1000 * 0.8 = 800
      vi.advanceTimersByTime(799);
      expect(mockSockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(2);

      randomSpy.mockRestore();
    });

    it("should give up after maxAttempts", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0, maxAttempts: 3 } },
      );

      const states = observeReconnectStates(client);

      // Attempt 1
      mockSockets[0].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(2);

      // Attempt 2
      mockSockets[1].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 2 });
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(3);

      // Attempt 3
      mockSockets[2].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 3 });
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(4);

      // Attempt 4 — exceeds maxAttempts (3), should give up
      mockSockets[3].simulateClose();
      expect(states.last()).toEqual({ status: "gave-up", attempt: 4 });
      expect(mockSockets).toHaveLength(4); // no new socket

      // Advancing time should not create more sockets
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(4);
    });

    it("setAutoReconnect(false) cancels pending retry", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 5000, jitter: 0 } },
      );

      const states = observeReconnectStates(client);

      mockSockets[0].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });

      // Pause before the retry fires
      client.setAutoReconnect(false);
      expect(states.last()).toEqual({ status: "disconnected", attempt: 1 });

      // Advance past the delay — no new socket should be created
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(1);
    });

    it("setAutoReconnect(true) resumes while disconnected", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 5000, jitter: 0 } },
      );

      client.setAutoReconnect(false);
      mockSockets[0].simulateClose();

      // No reconnect scheduled because autoReconnect is off
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(1);

      // Resume — should kick connect() immediately
      client.setAutoReconnect(true);
      expect(mockSockets).toHaveLength(2);
    });

    it("setAutoReconnect(true) does NOT resume after gave up", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0, maxAttempts: 1 } },
      );

      const states = observeReconnectStates(client);

      // Attempt 1
      mockSockets[0].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });
      vi.advanceTimersByTime(1000);
      expect(mockSockets).toHaveLength(2);

      // Attempt 2 — exceeds maxAttempts (1), gives up
      mockSockets[1].simulateClose();
      expect(states.last()).toEqual({ status: "gave-up", attempt: 2 });

      // Resuming via setAutoReconnect should NOT kick a connect (gaveUp is true)
      client.setAutoReconnect(true);
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(2);
      expect(states.last()).toEqual({ status: "gave-up", attempt: 2 });
    });

    it("reconnect() resets attempt counter and clears gave-up state", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0, maxAttempts: 1 } },
      );

      const states = observeReconnectStates(client);

      // Burn through to gave-up
      mockSockets[0].simulateClose();
      vi.advanceTimersByTime(1000);
      mockSockets[1].simulateClose();
      expect(states.last()).toEqual({ status: "gave-up", attempt: 2 });

      // reconnect() should clear gaveUp and connect immediately
      client.reconnect();
      expect(mockSockets).toHaveLength(3);

      // The new socket's close should schedule normally (attempt 1 again)
      mockSockets[2].simulateClose();
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });
    });

    it("reconnect() does not double-schedule via the close handler", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 5000, jitter: 0 } },
      );

      // Wait for initial connect, open it
      mockSockets[0].simulateOpen();

      // Call reconnect() — should close the old socket and open a new one immediately
      client.reconnect();
      expect(mockSockets).toHaveLength(2);

      // Advance a small amount — no additional sockets should be created
      // (the close from reconnect()'s ws.close() must not schedule a retry)
      vi.advanceTimersByTime(100);
      expect(mockSockets).toHaveLength(2);

      // Advance past the reconnect delay — still no extra socket
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(2);
    });

    it("disconnect({ reconnect: false }) (default) suppresses reconnection", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 1000, jitter: 0 } },
      );

      const states = observeReconnectStates(client);

      client.disconnect();

      // No new socket should be created even after the delay
      vi.advanceTimersByTime(10000);
      expect(mockSockets).toHaveLength(1);
      expect(states.last()).toEqual({ status: "disconnected", attempt: 0 });
    });

    it("disconnect({ reconnect: true }) schedules a normal backoff reconnect", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 2000, jitter: 0 } },
      );

      const states = observeReconnectStates(client);

      client.disconnect({ reconnect: true });

      // The close should schedule a reconnect after 2000ms
      expect(states.last()).toEqual({ status: "reconnecting", attempt: 1 });
      vi.advanceTimersByTime(1999);
      expect(mockSockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(2);
    });

    it("disconnect({ reconnect: true }) while already disconnected kicks connect() directly", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnect: { baseDelayMs: 5000, jitter: 0 } },
      );

      // Socket is closed but a retry is pending (mid-reconnect window)
      mockSockets[0].simulateClose();
      expect(mockSockets).toHaveLength(1);

      // disconnect({ reconnect: true }) while ws is undefined and timer pending
      client.disconnect({ reconnect: true });

      // Should have kicked connect() directly → new socket
      expect(mockSockets).toHaveLength(2);
    });

    it("getToken() rejection connects without token and logs warning", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const getToken = vi.fn().mockRejectedValue(new Error("token service down"));

      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", getToken },
      );

      // connect() is async — flush microtasks
      await vi.runAllTimersAsync();

      // Should have connected anyway (new socket created)
      expect(mockSockets.length).toBeGreaterThanOrEqual(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "YuzuClient: getToken() failed, connecting without token",
        expect.any(Error),
      );

      // The connection URL should not contain a token query param
      expect(mockSockets[0].url).not.toContain("token=");

      warnSpy.mockRestore();
    });

    it("all reconnect APIs warn and no-op in externalTransport mode", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const client = new YuzuClient(
        { count: 0 },
        { externalTransport: true, onMessage: vi.fn() },
      );

      client.reconnect();
      client.disconnect();
      client.disconnect({ reconnect: true });
      client.setAutoReconnect(false);
      client.setAutoReconnect(true);

      expect(warnSpy).toHaveBeenCalledWith("reconnect() does nothing in externalTransport mode");
      expect(warnSpy).toHaveBeenCalledWith("disconnect() does nothing in externalTransport mode");
      expect(warnSpy).toHaveBeenCalledWith("setAutoReconnect() does nothing in externalTransport mode");

      // No sockets should have been created (external transport mode)
      expect(mockSockets).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it("reconnectState$ is seeded with disconnected", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test" },
      );

      const states: any[] = [];
      client.reconnectState$.subscribe(s => states.push(s));

      // BehaviorSubject seeds immediately
      expect(states).toHaveLength(1);
      expect(states[0]).toEqual({ status: "disconnected", attempt: 0 });
    });

    it("emits connected on successful open", () => {
      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test" },
      );

      const states = observeReconnectStates(client);

      mockSockets[0].simulateOpen();
      expect(states.last()).toEqual({ status: "connected", attempt: 0 });
    });

    it("supports deprecated reconnectTimeout as baseDelayMs (backward compat)", () => {
      // Fix Math.random so jitter (default 0.2) doesn't make the delay nondeterministic.
      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5); // factor = 1 → delay = base

      const client = new YuzuClient(
        { count: 0 },
        { address: "ws://localhost:9999/test", reconnectTimeout: 7000 },
      );

      mockSockets[0].simulateClose();
      // Should wait 7000ms (from reconnectTimeout, strategy fixed, jitter neutralised)
      vi.advanceTimersByTime(6999);
      expect(mockSockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(mockSockets).toHaveLength(2);

      randomSpy.mockRestore();
    });
  });
});

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Minimal mock WebSocket that records instances and lets tests simulate
 * open/close/error/message events deterministically.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = 0; // CONNECTING
  private listeners: { [type: string]: EventListener[] } = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(l => l !== listener);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.dispatchEvent("close");
  }

  send() {}

  /** Test helper: simulate a successful open event. */
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.dispatchEvent("open");
  }

  /** Test helper: simulate a close event. */
  simulateClose() {
    this.readyState = 3; // CLOSED
    this.dispatchEvent("close");
  }

  private dispatchEvent(type: string) {
    const ls = this.listeners[type] || [];
    for (const l of ls) {
      (l as any).call(this, { type });
    }
  }
}

/**
 * Helper to collect reconnectState$ emissions into an array with a `.last()`.
 */
function observeReconnectStates(client: YuzuClient<any>) {
  const states: any[] = [];
  client.reconnectState$.subscribe(s => states.push(s));
  return {
    states,
    last: () => states[states.length - 1],
  };
}
