import { describe, it, expect, vi } from 'vitest';
import { YuzuSubscription } from './subscription';

describe('YuzuSubscription', () => {
  
  describe('constructor', () => {
    it('should create a subscription without unsubscribe function', () => {
      const sub = new YuzuSubscription();
      expect(sub).toBeInstanceOf(YuzuSubscription);
      expect(sub._unsubFunctions).toEqual([]);
    });

    it('should create a subscription with unsubscribe function', () => {
      const unsubFn = vi.fn();
      const sub = new YuzuSubscription(unsubFn);
      expect(sub._unsubFunctions).toHaveLength(1);
      expect(sub._unsubFunctions[0]).toBe(unsubFn);
    });
  });

  describe('unsubscribe', () => {
    it('should call all unsubscribe functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const sub = new YuzuSubscription(fn1);
      sub._unsubFunctions.push(fn2);

      sub.unsubscribe();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should handle empty unsubscribe functions array', () => {
      const sub = new YuzuSubscription();
      expect(() => sub.unsubscribe()).not.toThrow();
    });

    it('should call unsubscribe functions even if one throws', () => {
      const fn1 = vi.fn(() => { throw new Error('Test error'); });
      const fn2 = vi.fn();
      const sub = new YuzuSubscription(fn1);
      sub._unsubFunctions.push(fn2);

      expect(() => sub.unsubscribe()).toThrow('Test error');
      expect(fn1).toHaveBeenCalledTimes(1);
      // fn2 won't be called due to the error
    });
  });

  describe('add', () => {
    it('should add a single subscription', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);

      sub1.add(sub2);

      expect(sub1._unsubFunctions).toHaveLength(2);
      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should add multiple subscriptions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);
      const sub3 = new YuzuSubscription(fn3);

      sub1.add(sub2, sub3);

      expect(sub1._unsubFunctions).toHaveLength(3);
      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it('should handle adding subscriptions with multiple unsubscribe functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);
      sub2._unsubFunctions.push(fn3);

      sub1.add(sub2);

      expect(sub1._unsubFunctions).toHaveLength(3);
      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it('should handle adding empty subscriptions', () => {
      const fn1 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription();

      sub1.add(sub2);

      expect(sub1._unsubFunctions).toHaveLength(1);
      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
    });
  });

  describe('usage pattern', () => {
    it('should support typical usage pattern with cleanup', () => {
      const listeners: string[] = [];
      
      // Simulate adding listeners
      const unsub1 = () => listeners.splice(listeners.indexOf('listener1'), 1);
      const unsub2 = () => listeners.splice(listeners.indexOf('listener2'), 1);
      
      listeners.push('listener1', 'listener2');
      
      const sub = new YuzuSubscription(unsub1);
      sub.add(new YuzuSubscription(unsub2));
      
      expect(listeners).toEqual(['listener1', 'listener2']);
      
      sub.unsubscribe();
      
      expect(listeners).toEqual([]);
    });
  });
});
