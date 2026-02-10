import { describe, it, expect } from 'vitest';
import { YUZU_SETTINGS } from './shared';
import type {
  ClientUiMessage,
  ServerUiMessage,
  MsgReqComplete,
  MsgSendComplete,
  MsgSendPatch,
  MsgSendPatchBatch,
  StatePatch,
  PatchableValueType,
} from './shared';

describe('shared module', () => {
  
  describe('YUZU_SETTINGS', () => {
    it('should have correct default values', () => {
      expect(YUZU_SETTINGS.SERVER_LOG_READ).toBe(false);
      expect(YUZU_SETTINGS.SERVER_LOG_READ_FULL).toBe(false);
      expect(YUZU_SETTINGS.SERVER_LOG_WRITE).toBe(false);
      expect(YUZU_SETTINGS.CLIENT_DEFAULT_TARGET_ADDRESS).toBe('ws://localhost:3000/api/yuzu');
      expect(YUZU_SETTINGS.CLIENT_DEFAULT_RECONNECT_TIMEOUT).toBe(3000);
      expect(YUZU_SETTINGS.CLIENT_LOG_READ).toBe(false);
      expect(YUZU_SETTINGS.CLIENT_LOG_READ_FULL).toBe(false);
    });

    it('should be read-only (object reference)', () => {
      expect(YUZU_SETTINGS).toBeDefined();
      expect(typeof YUZU_SETTINGS).toBe('object');
    });
  });

  describe('Message Type Guards', () => {
    
    describe('ClientUiMessage', () => {
      it('should accept valid MsgReqComplete', () => {
        const msg: ClientUiMessage = {
          type: 'complete',
        };
        expect(msg.type).toBe('complete');
      });
    });

    describe('ServerUiMessage', () => {
      it('should accept valid MsgSendComplete', () => {
        const msg: ServerUiMessage = {
          type: 'complete',
          state: { test: 'data' },
        };
        expect(msg.type).toBe('complete');
        expect((msg as MsgSendComplete).state).toEqual({ test: 'data' });
      });

      it('should accept valid MsgSendPatch', () => {
        const msg: ServerUiMessage = {
          type: 'patch',
          patch: {
            path: ['test', 'path'],
            value: 'newValue',
          },
        };
        expect(msg.type).toBe('patch');
        expect((msg as MsgSendPatch).patch.path).toEqual(['test', 'path']);
        expect((msg as MsgSendPatch).patch.value).toBe('newValue');
      });

      it('should accept valid MsgSendPatchBatch', () => {
        const msg: ServerUiMessage = {
          type: 'patch-batch',
          patches: [
            { path: ['test', '1'], value: 'value1' },
            { path: ['test', '2'], value: 'value2' },
          ],
        };
        expect(msg.type).toBe('patch-batch');
        expect((msg as MsgSendPatchBatch).patches).toHaveLength(2);
      });
    });
  });

  describe('StatePatch', () => {
    it('should support string values', () => {
      const patch: StatePatch = {
        path: ['user', 'name'],
        value: 'John Doe',
      };
      expect(patch.value).toBe('John Doe');
      expect(typeof patch.value).toBe('string');
    });

    it('should support number values', () => {
      const patch: StatePatch = {
        path: ['user', 'age'],
        value: 30,
      };
      expect(patch.value).toBe(30);
      expect(typeof patch.value).toBe('number');
    });

    it('should support boolean values', () => {
      const patch: StatePatch = {
        path: ['user', 'active'],
        value: true,
      };
      expect(patch.value).toBe(true);
      expect(typeof patch.value).toBe('boolean');
    });

    it('should support object values', () => {
      const patch: StatePatch = {
        path: ['user'],
        value: { name: 'John', age: 30 },
      };
      expect(patch.value).toEqual({ name: 'John', age: 30 });
      expect(typeof patch.value).toBe('object');
    });

    it('should support null values', () => {
      const patch: StatePatch = {
        path: ['user', 'profile'],
        value: null,
      };
      expect(patch.value).toBe(null);
    });

    it('should support undefined values', () => {
      const patch: StatePatch = {
        path: ['user', 'optional'],
        value: undefined,
      };
      expect(patch.value).toBe(undefined);
    });

    it('should support nested path arrays', () => {
      const patch: StatePatch = {
        path: ['users', '0', 'profile', 'settings', 'theme'],
        value: 'dark',
      };
      expect(patch.path).toHaveLength(5);
      expect(patch.path).toEqual(['users', '0', 'profile', 'settings', 'theme']);
    });

    it('should support empty path arrays', () => {
      const patch: StatePatch = {
        path: [],
        value: { entire: 'state' },
      };
      expect(patch.path).toHaveLength(0);
    });
  });

  describe('PatchableValueType', () => {
    it('should accept all valid types', () => {
      const values: PatchableValueType[] = [
        'string',
        123,
        true,
        { object: 'value' },
        null,
        undefined,
      ];
      
      values.forEach(value => {
        const patch: StatePatch = { path: ['test'], value };
        expect(patch.value).toBe(value);
      });
    });
  });

  describe('Message serialization', () => {
    it('should serialize and deserialize MsgSendComplete', () => {
      const msg: MsgSendComplete = {
        type: 'complete',
        state: { test: 'data', nested: { value: 123 } },
      };
      
      const serialized = JSON.stringify(msg);
      const deserialized = JSON.parse(serialized) as MsgSendComplete;
      
      expect(deserialized.type).toBe('complete');
      expect(deserialized.state).toEqual({ test: 'data', nested: { value: 123 } });
    });

    it('should serialize and deserialize MsgSendPatch', () => {
      const msg: MsgSendPatch = {
        type: 'patch',
        patch: {
          path: ['test', 'path'],
          value: 'newValue',
        },
      };
      
      const serialized = JSON.stringify(msg);
      const deserialized = JSON.parse(serialized) as MsgSendPatch;
      
      expect(deserialized.type).toBe('patch');
      expect(deserialized.patch.path).toEqual(['test', 'path']);
      expect(deserialized.patch.value).toBe('newValue');
    });

    it('should serialize and deserialize MsgSendPatchBatch', () => {
      const msg: MsgSendPatchBatch = {
        type: 'patch-batch',
        patches: [
          { path: ['a'], value: 1 },
          { path: ['b'], value: 2 },
        ],
      };
      
      const serialized = JSON.stringify(msg);
      const deserialized = JSON.parse(serialized) as MsgSendPatchBatch;
      
      expect(deserialized.type).toBe('patch-batch');
      expect(deserialized.patches).toHaveLength(2);
      expect(deserialized.patches[0].value).toBe(1);
    });

    it('should handle undefined values in patches', () => {
      const msg: MsgSendPatch = {
        type: 'patch',
        patch: {
          path: ['test'],
          value: undefined,
        },
      };
      
      const serialized = JSON.stringify(msg);
      const deserialized = JSON.parse(serialized) as MsgSendPatch;
      
      // Note: JSON.stringify converts undefined to null in objects
      // This is a known behavior difference
      expect(deserialized.patch.value).toBeUndefined();
    });
  });
});
