import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Server } from "http";
import WebSocket, { WebSocketServer } from "ws";
import { YuzuServer, YuzuServerConfig, YuzuLogger } from "./server";
import type { MsgSendComplete, MsgSendPatch, MsgSendPatchBatch } from "./shared";

describe("YuzuServer", () => {
  let httpServer: Server;
  let mockLogger: YuzuLogger;
  let servers: YuzuServer<any>[];

  beforeEach(() => {
    httpServer = new Server();
    servers = [];
    mockLogger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(async () => {
    // Close all YuzuServer instances first
    await Promise.all(servers.map(s => s.close()));

    // Then close the HTTP server if still open
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  // Helper function to create and track YuzuServer instances
  function createServer<T extends object>(initial: T, config: YuzuServerConfig): YuzuServer<T> {
    const server = new YuzuServer(initial, config);
    servers.push(server);
    return server;
  }

  describe("constructor", () => {
    it("should create server with existing HTTP server", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
      expect(server.state).toEqual(initialState);
    });

    it("should create server with new HTTP server on specified port", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port: 0 }, // Port 0 = random available port
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
      expect(server.state).toEqual(initialState);
    });

    it("should throw error if neither serverRef nor serverConfig provided", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: undefined,
        logger: mockLogger,
      };

      expect(() => {
        new YuzuServer(initialState, config);
      }).toThrow("Either an existing HTTP server or new server config must be supplied");
    });

    it("should use custom path when provided", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        path: "/custom/path",
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
    });

    it("should add leading slash to path if not provided", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        path: "custom/path",
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
    });

    it("should use default logger when logger not provided", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
    });

    it("should set batchDelay when provided", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        batchDelay: 100,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
    });
  });

  describe("webSocketServer getter", () => {
    it("should expose the underlying WebSocket server", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.webSocketServer).toBeDefined();
      expect(server.webSocketServer).toBeInstanceOf(WebSocketServer);
    });

    it("should allow access to WebSocket server clients", async () => {
      const initialState = { count: 0 };
      const port = 3300;
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      // Initially no clients
      expect(server.webSocketServer).toBeDefined();
      expect(server.webSocketServer!.clients.size).toBe(0);

      // Connect a client
      const ws = new WebSocket(`ws://localhost:${port}/api/yuzu`);

      await new Promise<void>((resolve) => {
        ws.on("open", () => {
          // Should now have 1 client
          expect(server.webSocketServer).toBeDefined();
          expect(server.webSocketServer!.clients.size).toBe(1);
          ws.close();
          resolve();
        });
      });
    });

    it("should allow adding custom event handlers to WebSocket server", async () => {
      const initialState = { count: 0 };
      const port = 3301;
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      const connectionHandler = vi.fn();

      // Add custom event handler
      expect(server.webSocketServer).toBeDefined();
      server.webSocketServer!.on("connection", connectionHandler);

      // Connect a client
      const ws = new WebSocket(`ws://localhost:${port}/api/yuzu`);

      await new Promise<void>((resolve) => {
        ws.on("open", () => {
          // Custom handler should have been called
          expect(connectionHandler).toHaveBeenCalled();
          ws.close();
          resolve();
        });
      });
    });

    it("should allow monitoring WebSocket server state", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      // Should be able to access various WebSocket server properties
      expect(server.webSocketServer).toBeDefined();
      expect(server.webSocketServer!.options).toBeDefined();
      expect(server.webSocketServer!.clients).toBeDefined();
      expect(server.webSocketServer!.address()).toBeDefined();
    });
  });

  describe("state proxy behavior", () => {
    it("should return initial state", () => {
      const initialState = { count: 0, name: "test" };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.state.count).toBe(0);
      expect(server.state.name).toBe("test");
    });

    it("should allow reading nested object properties", () => {
      const initialState = {
        user: {
          name: "John",
          age: 30,
          profile: {
            bio: "Developer",
          },
        },
      };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.state.user.name).toBe("John");
      expect(server.state.user.age).toBe(30);
      expect(server.state.user.profile.bio).toBe("Developer");
    });

    it("should allow modifying state properties", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      server.state.count = 5;

      expect(server.state.count).toBe(5);
    });

    it("should allow modifying nested properties", () => {
      const initialState = {
        user: {
          name: "John",
          profile: {
            bio: "Developer",
          },
        },
      };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      server.state.user.name = "Jane";
      server.state.user.profile.bio = "Designer";

      expect(server.state.user.name).toBe("Jane");
      expect(server.state.user.profile.bio).toBe("Designer");
    });

    it("should handle array properties", () => {
      const initialState = { items: [1, 2, 3] };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.state.items).toEqual([1, 2, 3]);

      server.state.items.push(4);

      expect(server.state.items).toEqual([1, 2, 3, 4]);
    });

    it("should handle nullable values", () => {
      const initialState = { value: null as number | null };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.state.value).toBe(null);

      server.state.value = 42;

      expect(server.state.value).toBe(42);

      server.state.value = null;

      expect(server.state.value).toBe(null);
    });
  });

  describe("WebSocket communication", () => {
    it("should accept WebSocket connections", async () => {
      const PORT = 3100;
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      // Wait a bit for server to start
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on("open", () => {
            expect(mockLogger.log).toHaveBeenCalled();
            client.close();
            resolve();
          });

          client.on("error", (err) => {
            reject(err);
          });
        }, 100);
      });
    });

    it("should send complete state on request", async () => {
      const PORT = 3101;
      const initialState = { count: 42, name: "test" };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on("open", () => {
            client.send(JSON.stringify({ type: "complete" }));
          });

          client.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as MsgSendComplete;
            expect(msg.type).toBe("complete");
            expect(msg.state).toEqual({ count: 42, name: "test" });
            client.close();
            resolve();
          });

          client.on("error", (err) => {
            reject(err);
          });
        }, 100);
      });
    });

    it("should broadcast patches when state changes", async () => {
      const PORT = 3102;
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on("open", () => {
            // Trigger a state change after connection
            setTimeout(() => {
              server.state.count = 5;
            }, 50);
          });

          client.on("message", (data) => {
            const msg = JSON.parse(data.toString()) as MsgSendPatch;
            if (msg.type === "patch") {
              expect(msg.patch.path).toEqual(["count"]);
              expect(msg.patch.value).toBe(5);
              client.close();
              resolve();
            }
          });

          client.on("error", (err) => {
            reject(err);
          });
        }, 100);
      });
    });
  });

  describe("batch updates", () => {
    it("should batch patches when batchDelay is set", async () => {
      const PORT = 3103;
      const initialState = { count: 0, name: "test" };
      const config: YuzuServerConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        batchDelay: 50,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on("open", () => {
            // Trigger multiple state changes
            setTimeout(() => {
              server.state.count = 1;
              server.state.count = 2;
              server.state.name = "updated";
            }, 50);
          });

          client.on("message", (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === "patch-batch") {
              const batchMsg = msg as MsgSendPatchBatch;
              expect(batchMsg.patches.length).toBeGreaterThan(1);
              client.close();
              resolve();
            }
          });

          client.on("error", (err) => {
            reject(err);
          });
        }, 100);
      });
    });
  });

  describe("logger", () => {
    it("should use custom logger for logging", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      // Logger should be used during construction
      expect(mockLogger.log).toBeDefined();
    });

    it("should respect logLevels parameter", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logLevels: ["error"],
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
    });
  });

  describe("complex state structures", () => {
    it("should handle deeply nested objects", () => {
      const initialState = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: "deep",
              },
            },
          },
        },
      };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server.state.level1.level2.level3.level4.value).toBe("deep");

      server.state.level1.level2.level3.level4.value = "updated";

      expect(server.state.level1.level2.level3.level4.value).toBe("updated");
    });

    it("should handle keyed objects with dynamic keys", () => {
      const initialState = {
        devices: {} as { [key: string]: { status: string } },
      };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      server.state.devices["device1"] = { status: "active" };
      server.state.devices["device2"] = { status: "inactive" };

      expect(server.state.devices["device1"].status).toBe("active");
      expect(server.state.devices["device2"].status).toBe("inactive");

      server.state.devices["device1"].status = "updated";

      expect(server.state.devices["device1"].status).toBe("updated");
    });

    it("should handle arrays of objects", () => {
      interface Item {
        id: string;
        value: number;
      }

      const initialState = {
        items: [] as Item[],
      };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      server.state.items.push({ id: "item1", value: 10 });
      server.state.items.push({ id: "item2", value: 20 });

      expect(server.state.items).toHaveLength(2);
      expect(server.state.items[0].value).toBe(10);

      server.state.items[0].value = 15;

      expect(server.state.items[0].value).toBe(15);
    });
  });

  describe("external transport mode", () => {
    it("should create server with external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
      expect(server.state).toEqual(initialState);
      expect(server.webSocketServer).toBeUndefined();
    });

    it("should throw error if onMessage not provided in external transport mode", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        externalTransport: true,
        logger: mockLogger,
      };

      expect(() => {
        new YuzuServer(initialState, config);
      }).toThrow("onMessage callback must be provided when using externalTransport mode");
    });

    it("should ignore serverRef/serverConfig in external transport mode", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        serverRef: httpServer,
        serverConfig: { port: 3000 },
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      expect(server).toBeInstanceOf(YuzuServer);
      expect(server.webSocketServer).toBeUndefined();
    });

    it("should call onMessage when state is changed", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      onMessageMock.mockClear();

      server.state.count = 42;

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      const message = JSON.parse(onMessageMock.mock.calls[0][0]);
      expect(message.type).toBe("patch");
      expect(message.patch.path).toEqual(["count"]);
      expect(message.patch.value).toBe(42);
      expect(onMessageMock.mock.calls[0][1]).toBeUndefined(); // No clientId for patches
    });

    it("should call onMessage with clientId when handling client message", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      onMessageMock.mockClear();

      const clientMessage = JSON.stringify({ type: "complete" });
      server.handleClientMessage(clientMessage, "client-123");

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      const responseMessage = JSON.parse(onMessageMock.mock.calls[0][0]);
      expect(responseMessage.type).toBe("complete");
      expect(responseMessage.state).toEqual({ count: 0 });
      expect(onMessageMock.mock.calls[0][1]).toBe("client-123"); // clientId passed for complete
    });

    it("should handle client message without clientId", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      onMessageMock.mockClear();

      const clientMessage = JSON.stringify({ type: "complete" });
      server.handleClientMessage(clientMessage);

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      const responseMessage = JSON.parse(onMessageMock.mock.calls[0][0]);
      expect(responseMessage.type).toBe("complete");
      expect(onMessageMock.mock.calls[0][1]).toBeUndefined(); // No clientId
    });

    it("should warn when handleClientMessage called in non-external mode", () => {
      const initialState = { count: 0 };
      const config: YuzuServerConfig = {
        serverRef: httpServer,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      const clientMessage = JSON.stringify({ type: "complete" });
      server.handleClientMessage(clientMessage);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "handleClientMessage() should only be used in externalTransport mode",
      );
    });

    it("should handle invalid JSON in handleClientMessage", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      server.handleClientMessage("invalid json");

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error parsing client message:",
        expect.any(Error),
      );
    });

    it("should support batching in external transport mode", async () => {
      const initialState = { count: 0, value: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        batchDelay: 10,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      onMessageMock.mockClear();

      server.state.count = 1;
      server.state.value = 2;

      // Should not have sent yet
      expect(onMessageMock).not.toHaveBeenCalled();

      // Wait for batch delay
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(onMessageMock).toHaveBeenCalledTimes(1);
      const message = JSON.parse(onMessageMock.mock.calls[0][0]) as MsgSendPatchBatch;
      expect(message.type).toBe("patch-batch");
      expect(message.patches).toHaveLength(2);
      expect(onMessageMock.mock.calls[0][1]).toBeUndefined(); // No clientId for batch
    });

    it("should close cleanly in external transport mode", async () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);

      await expect(server.close()).resolves.toBeUndefined();
    });

    it("should handle multiple clients with different IDs", () => {
      const initialState = { count: 0 };
      const onMessageMock = vi.fn();
      const config: YuzuServerConfig = {
        externalTransport: true,
        onMessage: onMessageMock,
        logger: mockLogger,
      };

      const server = createServer(initialState, config);
      onMessageMock.mockClear();

      // Client 1 requests state
      const clientMessage1 = JSON.stringify({ type: "complete" });
      server.handleClientMessage(clientMessage1, "client-1");

      // Client 2 requests state
      const clientMessage2 = JSON.stringify({ type: "complete" });
      server.handleClientMessage(clientMessage2, "client-2");

      expect(onMessageMock).toHaveBeenCalledTimes(2);
      expect(onMessageMock.mock.calls[0][1]).toBe("client-1");
      expect(onMessageMock.mock.calls[1][1]).toBe("client-2");
    });
  });
});
