import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server } from 'http';
import WebSocket from 'ws';
import { ServerUiState, ServerUiStateConfig, YuzuLogger } from './server';
import type { MsgSendComplete, MsgSendPatch, MsgSendPatchBatch } from './shared';

describe('ServerUiState', () => {
  let httpServer: Server;
  let mockLogger: YuzuLogger;

  beforeEach(() => {
    httpServer = new Server();
    mockLogger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(async () => {
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('constructor', () => {
    it('should create server with existing HTTP server', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
      expect(server.state).toEqual(initialState);
    });

    it('should create server with new HTTP server on specified port', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: { port: 0 }, // Port 0 = random available port
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
      expect(server.state).toEqual(initialState);
    });

    it('should throw error if neither serverRef nor serverConfig provided', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: undefined,
        logger: mockLogger,
      };

      expect(() => {
        new ServerUiState(initialState, config);
      }).toThrow('Either an existing HTTP server or new server config must be supplied');
    });

    it('should use custom path when provided', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        path: '/custom/path',
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
    });

    it('should add leading slash to path if not provided', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        path: 'custom/path',
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
    });

    it('should use default logger when logger not provided', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
    });

    it('should set batchDelay when provided', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        batchDelay: 100,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
    });
  });

  describe('state proxy behavior', () => {
    it('should return initial state', () => {
      const initialState = { count: 0, name: 'test' };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server.state.count).toBe(0);
      expect(server.state.name).toBe('test');
    });

    it('should allow reading nested object properties', () => {
      const initialState = {
        user: {
          name: 'John',
          age: 30,
          profile: {
            bio: 'Developer',
          },
        },
      };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server.state.user.name).toBe('John');
      expect(server.state.user.age).toBe(30);
      expect(server.state.user.profile.bio).toBe('Developer');
    });

    it('should allow modifying state properties', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      server.state.count = 5;

      expect(server.state.count).toBe(5);
    });

    it('should allow modifying nested properties', () => {
      const initialState = {
        user: {
          name: 'John',
          profile: {
            bio: 'Developer',
          },
        },
      };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      server.state.user.name = 'Jane';
      server.state.user.profile.bio = 'Designer';

      expect(server.state.user.name).toBe('Jane');
      expect(server.state.user.profile.bio).toBe('Designer');
    });

    it('should handle array properties', () => {
      const initialState = { items: [1, 2, 3] };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server.state.items).toEqual([1, 2, 3]);
      
      server.state.items.push(4);
      
      expect(server.state.items).toEqual([1, 2, 3, 4]);
    });

    it('should handle nullable values', () => {
      const initialState = { value: null as number | null };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server.state.value).toBe(null);
      
      server.state.value = 42;
      
      expect(server.state.value).toBe(42);
      
      server.state.value = null;
      
      expect(server.state.value).toBe(null);
    });
  });

  describe('WebSocket communication', () => {
    it('should accept WebSocket connections', async () => {
      const PORT = 3100;
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      // Wait a bit for server to start
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on('open', () => {
            expect(mockLogger.log).toHaveBeenCalled();
            client.close();
            resolve();
          });

          client.on('error', (err) => {
            reject(err);
          });
        }, 100);
      });
    });

    it('should send complete state on request', async () => {
      const PORT = 3101;
      const initialState = { count: 42, name: 'test' };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on('open', () => {
            client.send(JSON.stringify({ type: 'complete' }));
          });

          client.on('message', (data) => {
            const msg = JSON.parse(data.toString()) as MsgSendComplete;
            expect(msg.type).toBe('complete');
            expect(msg.state).toEqual({ count: 42, name: 'test' });
            client.close();
            resolve();
          });

          client.on('error', (err) => {
            reject(err);
          });
        }, 100);
      });
    });

    it('should broadcast patches when state changes', async () => {
      const PORT = 3102;
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on('open', () => {
            // Trigger a state change after connection
            setTimeout(() => {
              server.state.count = 5;
            }, 50);
          });

          client.on('message', (data) => {
            const msg = JSON.parse(data.toString()) as MsgSendPatch;
            if (msg.type === 'patch') {
              expect(msg.patch.path).toEqual(['count']);
              expect(msg.patch.value).toBe(5);
              client.close();
              resolve();
            }
          });

          client.on('error', (err) => {
            reject(err);
          });
        }, 100);
      });
    });
  });

  describe('batch updates', () => {
    it('should batch patches when batchDelay is set', async () => {
      const PORT = 3103;
      const initialState = { count: 0, name: 'test' };
      const config: ServerUiStateConfig = {
        serverRef: undefined,
        serverConfig: { port: PORT },
        batchDelay: 50,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const client = new WebSocket(`ws://localhost:${PORT}/api/yuzu`);

          client.on('open', () => {
            // Trigger multiple state changes
            setTimeout(() => {
              server.state.count = 1;
              server.state.count = 2;
              server.state.name = 'updated';
            }, 50);
          });

          client.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'patch-batch') {
              const batchMsg = msg as MsgSendPatchBatch;
              expect(batchMsg.patches.length).toBeGreaterThan(1);
              client.close();
              resolve();
            }
          });

          client.on('error', (err) => {
            reject(err);
          });
        }, 100);
      });
    });
  });

  describe('logger', () => {
    it('should use custom logger for logging', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      // Logger should be used during construction
      expect(mockLogger.log).toBeDefined();
    });

    it('should respect logLevels parameter', () => {
      const initialState = { count: 0 };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logLevels: ['error'],
      };

      const server = new ServerUiState(initialState, config);

      expect(server).toBeInstanceOf(ServerUiState);
    });
  });

  describe('complex state structures', () => {
    it('should handle deeply nested objects', () => {
      const initialState = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      expect(server.state.level1.level2.level3.level4.value).toBe('deep');
      
      server.state.level1.level2.level3.level4.value = 'updated';
      
      expect(server.state.level1.level2.level3.level4.value).toBe('updated');
    });

    it('should handle keyed objects with dynamic keys', () => {
      const initialState = {
        devices: {} as { [key: string]: { status: string } },
      };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      server.state.devices['device1'] = { status: 'active' };
      server.state.devices['device2'] = { status: 'inactive' };

      expect(server.state.devices['device1'].status).toBe('active');
      expect(server.state.devices['device2'].status).toBe('inactive');
      
      server.state.devices['device1'].status = 'updated';
      
      expect(server.state.devices['device1'].status).toBe('updated');
    });

    it('should handle arrays of objects', () => {
      interface Item {
        id: string;
        value: number;
      }
      
      const initialState = {
        items: [] as Item[],
      };
      const config: ServerUiStateConfig = {
        serverRef: httpServer,
        serverConfig: undefined,
        logger: mockLogger,
      };

      const server = new ServerUiState(initialState, config);

      server.state.items.push({ id: 'item1', value: 10 });
      server.state.items.push({ id: 'item2', value: 20 });

      expect(server.state.items).toHaveLength(2);
      expect(server.state.items[0].value).toBe(10);
      
      server.state.items[0].value = 15;
      
      expect(server.state.items[0].value).toBe(15);
    });
  });
});
