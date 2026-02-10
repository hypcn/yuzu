import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Server } from "http";
import WebSocket from "ws";
import { ServerUiState, AuthenticationInfo } from "./server";
import { ClientUiState } from "./client";

describe("Authentication", () => {
  let server: Server;
  let serverUiState: ServerUiState<any>;
  const TEST_PORT = 9876;

  afterEach(async () => {
    // Clean up serverUiState if it exists
    if (serverUiState) {
      try {
        await serverUiState.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
      serverUiState = null as any;
    }

    // Clean up HTTP server if it exists and is separate
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      server = null as any;
    }

    // Wait a bit for ports to be released
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe("Server authentication", () => {
    it("should accept connections when no authenticate callback is provided", async () => {
      // Default behavior - no auth required
      serverUiState = new ServerUiState(
        { count: 0 },
        { serverConfig: { port: TEST_PORT } },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          expect(client.readyState).toBe(WebSocket.OPEN);
          client.close();
          resolve();
        });
        client.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });
    });

    it("should accept connections when authenticate callback returns true", async () => {
      const authenticate = vi.fn().mockReturnValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu?token=valid`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          expect(client.readyState).toBe(WebSocket.OPEN);
          expect(authenticate).toHaveBeenCalledTimes(1);

          const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
          expect(authInfo.queryParams.get("token")).toBe("valid");
          expect(authInfo.request).toBeDefined();

          client.close();
          resolve();
        });
        client.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });
    });

    it("should accept connections when authenticate callback returns Promise<true>", async () => {
      const authenticate = vi.fn().mockResolvedValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu?token=valid`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          expect(client.readyState).toBe(WebSocket.OPEN);
          expect(authenticate).toHaveBeenCalledTimes(1);
          client.close();
          resolve();
        });
        client.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });
    });

    it("should reject connections when authenticate callback returns false", async () => {
      const authenticate = vi.fn().mockReturnValue(false);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
          logLevels: [], // Suppress warning logs in test output
        },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu?token=invalid`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          reject(new Error("Connection should have been rejected"));
        });
        client.on("error", (error) => {
          expect(authenticate).toHaveBeenCalledTimes(1);
          const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
          expect(authInfo.queryParams.get("token")).toBe("invalid");
          resolve();
        });
        setTimeout(() => reject(new Error("Expected error event")), 1000);
      });
    });

    it("should reject connections when authenticate callback returns Promise<false>", async () => {
      const authenticate = vi.fn().mockResolvedValue(false);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
          logLevels: [],
        },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          reject(new Error("Connection should have been rejected"));
        });
        client.on("error", () => {
          expect(authenticate).toHaveBeenCalledTimes(1);
          resolve();
        });
        setTimeout(() => reject(new Error("Expected error event")), 1000);
      });
    });

    it("should reject connections when authenticate callback throws error", async () => {
      const authenticate = vi.fn().mockImplementation(() => {
        throw new Error("Auth service failed");
      });

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
          logLevels: [],
        },
      );

      const client = new WebSocket(`ws://localhost:${TEST_PORT}/api/yuzu`);

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          reject(new Error("Connection should have been rejected"));
        });
        client.on("error", () => {
          expect(authenticate).toHaveBeenCalledTimes(1);
          resolve();
        });
        setTimeout(() => reject(new Error("Expected error event")), 1000);
      });
    });

    it("should provide correct query parameters to authenticate callback", async () => {
      const authenticate = vi.fn().mockReturnValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new WebSocket(
        `ws://localhost:${TEST_PORT}/api/yuzu?token=abc123&user=john&flag=true`,
      );

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
          expect(authInfo.queryParams.get("token")).toBe("abc123");
          expect(authInfo.queryParams.get("user")).toBe("john");
          expect(authInfo.queryParams.get("flag")).toBe("true");
          client.close();
          resolve();
        });
        client.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });
    });

    it("should handle URL-encoded tokens correctly", async () => {
      const authenticate = vi.fn().mockReturnValue(true);
      const tokenWithSpecialChars = "abc+123/xyz=";

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new WebSocket(
        `ws://localhost:${TEST_PORT}/api/yuzu?token=${encodeURIComponent(tokenWithSpecialChars)}`,
      );

      await new Promise<void>((resolve, reject) => {
        client.on("open", () => {
          const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
          expect(authInfo.queryParams.get("token")).toBe(tokenWithSpecialChars);
          client.close();
          resolve();
        });
        client.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });
    });
  });

  describe("Client authentication", () => {
    it("should connect without token when not provided", async () => {
      serverUiState = new ServerUiState(
        { count: 0 },
        { serverConfig: { port: TEST_PORT } },
      );

      const client = new ClientUiState(
        { count: 0 },
        { address: `ws://localhost:${TEST_PORT}/api/yuzu` },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should append token as query parameter when provided", async () => {
      const authenticate = vi.fn().mockReturnValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          token: "mytoken123",
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe("mytoken123");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should use getToken callback when provided", async () => {
      const authenticate = vi.fn().mockReturnValue(true);
      const getToken = vi.fn().mockReturnValue("dynamictoken");

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          getToken,
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            expect(getToken).toHaveBeenCalled();
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe("dynamictoken");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should use async getToken callback when provided", async () => {
      const authenticate = vi.fn().mockReturnValue(true);
      const getToken = vi.fn().mockResolvedValue("asynctoken");

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          getToken,
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            expect(getToken).toHaveBeenCalled();
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe("asynctoken");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should URL-encode token with special characters", async () => {
      const authenticate = vi.fn().mockReturnValue(true);
      const specialToken = "token+with spaces&special=chars";

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          token: specialToken,
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe(specialToken);
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should handle existing query parameters in address", async () => {
      const authenticate = vi.fn().mockReturnValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu?existing=param`,
          token: "newtoken",
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe("newtoken");
            expect(authInfo.queryParams.get("existing")).toBe("param");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(client.isConnected).toBe(true);
    });

    it("should fail to connect when authentication is rejected", async () => {
      const authenticate = vi.fn().mockReturnValue(false);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
          logLevels: [],
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          token: "badtoken",
        },
      );

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(client.isConnected).toBe(false);
          resolve();
        }, 500);
      });
    });
  });

  describe("Real-world authentication scenarios", () => {
    it("should support JWT-style authentication", async () => {
      // Mock JWT verification
      const verifyJWT = vi.fn().mockImplementation((token: string) => {
        if (token === "valid.jwt.token") {
          return { userId: "user123", role: "admin" };
        }
        return null;
      });

      const authenticate = async (info: AuthenticationInfo) => {
        const token = info.queryParams.get("token");
        if (!token) return false;
        const user = verifyJWT(token);
        return user !== null;
      };

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      // Valid token
      const validClient = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          token: "valid.jwt.token",
        },
      );

      await new Promise<void>((resolve) => {
        const sub = validClient.connected$.subscribe((connected) => {
          if (connected) {
            expect(verifyJWT).toHaveBeenCalledWith("valid.jwt.token");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      expect(validClient.isConnected).toBe(true);
    });

    it("should support token refresh on reconnection", async () => {
      let tokenCounter = 0;
      const getToken = vi.fn().mockImplementation(() => {
        return `token-${++tokenCounter}`;
      });

      const authenticate = vi.fn().mockReturnValue(true);

      serverUiState = new ServerUiState(
        { count: 0 },
        {
          serverConfig: { port: TEST_PORT },
          authenticate,
        },
      );

      const client = new ClientUiState(
        { count: 0 },
        {
          address: `ws://localhost:${TEST_PORT}/api/yuzu`,
          getToken,
        },
      );

      await new Promise<void>((resolve) => {
        const sub = client.connected$.subscribe((connected) => {
          if (connected) {
            expect(getToken).toHaveBeenCalled();
            const authInfo: AuthenticationInfo = authenticate.mock.calls[0][0];
            expect(authInfo.queryParams.get("token")).toBe("token-1");
            sub.unsubscribe();
            resolve();
          }
        });
        setTimeout(() => resolve(), 1000);
      });

      // getToken should be called once for initial connection
      expect(getToken).toHaveBeenCalledTimes(1);
    });
  });
});
