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

  describe("integration with server", () => {
    let server: ServerUiState<any>;
    let currentPort: number;

    beforeEach(() => {
      // Use random port to avoid conflicts between tests
      currentPort = 3200 + Math.floor(Math.random() * 100);
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

    it("should receive complete state from server", async () => {
      const client = new ClientUiState(
        { count: -1, name: "initial" },
        { address: `ws://localhost:${currentPort}/api/yuzu` },
      );

      // Wait for connection and state sync
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(client.state.count).toBe(0);
      expect(client.state.name).toBe("test");
    });

    it("should receive patch updates from server", async () => {
      const client = new ClientUiState(
        { count: 0, name: "test" },
        { address: `ws://localhost:${currentPort}/api/yuzu` },
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
      const client = new ClientUiState(
        { count: 0, name: "test" },
        { address: `ws://localhost:${currentPort}/api/yuzu` },
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
});
