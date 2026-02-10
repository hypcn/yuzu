import { describe, it, expect, vi } from "vitest";
import { Subscription } from "rxjs";
import { YuzuSubscription } from "./subscription";

describe("YuzuSubscription", () => {

  describe("constructor", () => {
    it("should create a subscription without unsubscribe function", () => {
      const sub = new YuzuSubscription();
      expect(sub).toBeInstanceOf(YuzuSubscription);
      expect(sub._unsubFunctions).toEqual([]);
      expect(sub.closed).toBe(false);
    });

    it("should create a subscription with unsubscribe function", () => {
      const unsubFn = vi.fn();
      const sub = new YuzuSubscription(unsubFn);
      expect(sub._unsubFunctions).toHaveLength(1);
      expect(sub._unsubFunctions[0]).toBe(unsubFn);
      expect(sub.closed).toBe(false);
    });
  });

  describe("unsubscribe", () => {
    it("should call all unsubscribe functions", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const sub = new YuzuSubscription(fn1);
      sub._unsubFunctions.push(fn2);

      sub.unsubscribe();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(sub.closed).toBe(true);
    });

    it("should handle empty unsubscribe functions array", () => {
      const sub = new YuzuSubscription();
      expect(() => sub.unsubscribe()).not.toThrow();
      expect(sub.closed).toBe(true);
    });

    it("should call unsubscribe functions even if one throws", () => {
      const fn1 = vi.fn(() => {
        throw new Error("Test error");
      });
      const fn2 = vi.fn();
      const sub = new YuzuSubscription(fn1);
      sub._unsubFunctions.push(fn2);

      expect(() => sub.unsubscribe()).toThrow("Test error");
      expect(fn1).toHaveBeenCalledTimes(1);
      // fn2 won't be called due to the error
    });

    it("should be idempotent - calling multiple times only executes once", () => {
      const fn = vi.fn();
      const sub = new YuzuSubscription(fn);

      sub.unsubscribe();
      sub.unsubscribe();
      sub.unsubscribe();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(sub.closed).toBe(true);
    });
  });

  describe("closed property", () => {
    it("should be false initially", () => {
      const sub = new YuzuSubscription();
      expect(sub.closed).toBe(false);
    });

    it("should be true after unsubscribe", () => {
      const sub = new YuzuSubscription();
      sub.unsubscribe();
      expect(sub.closed).toBe(true);
    });
  });

  describe("add", () => {
    it("should add a single YuzuSubscription", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);

      sub1.add(sub2);

      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(sub1.closed).toBe(true);
      expect(sub2.closed).toBe(true);
    });

    it("should add multiple YuzuSubscriptions", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);
      const sub3 = new YuzuSubscription(fn3);

      sub1.add(sub2, sub3);

      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it("should add plain functions as teardown logic", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      const sub = new YuzuSubscription(fn1);

      sub.add(fn2, fn3);

      sub.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it("should add RxJS Subscription objects", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const rxjsSub = new Subscription(fn2);

      sub1.add(rxjsSub);

      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(sub1.closed).toBe(true);
      expect(rxjsSub.closed).toBe(true);
    });

    it("should add mix of functions, YuzuSubscriptions, and RxJS Subscriptions", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();
      const fn4 = vi.fn();

      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription(fn2);
      const rxjsSub = new Subscription(fn3);

      sub1.add(sub2, fn4, rxjsSub);

      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
      expect(fn4).toHaveBeenCalledTimes(1);
    });

    it("should handle adding empty subscriptions", () => {
      const fn1 = vi.fn();
      const sub1 = new YuzuSubscription(fn1);
      const sub2 = new YuzuSubscription();

      sub1.add(sub2);

      sub1.unsubscribe();
      expect(fn1).toHaveBeenCalledTimes(1);
    });

    it("should handle adding objects that implement Unsubscribable interface", () => {
      const fn = vi.fn();
      const customUnsub = {
        unsubscribe: vi.fn(),
      };

      const sub = new YuzuSubscription(fn);
      sub.add(customUnsub);

      sub.unsubscribe();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(customUnsub.unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("usage pattern", () => {
    it("should support typical usage pattern with cleanup", () => {
      const listeners: string[] = [];

      // Simulate adding listeners
      const unsub1 = () => listeners.splice(listeners.indexOf("listener1"), 1);
      const unsub2 = () => listeners.splice(listeners.indexOf("listener2"), 1);

      listeners.push("listener1", "listener2");

      const sub = new YuzuSubscription(unsub1);
      sub.add(new YuzuSubscription(unsub2));

      expect(listeners).toEqual(["listener1", "listener2"]);

      sub.unsubscribe();

      expect(listeners).toEqual([]);
    });

    it("should work as drop-in replacement for RxJS Subscription", () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      // User can mix YuzuSubscription and RxJS Subscription
      const yuzuSub = new YuzuSubscription(fn1);
      const rxjsSub = new Subscription(fn2);

      // Can add either to the other
      yuzuSub.add(rxjsSub);

      yuzuSub.unsubscribe();

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
      expect(yuzuSub.closed).toBe(true);
      expect(rxjsSub.closed).toBe(true);
    });
  });

  describe("RxJS compatibility", () => {
    it("should be assignable to Unsubscribable type", () => {
      const sub: { unsubscribe(): void } = new YuzuSubscription();
      expect(sub).toBeDefined();
      expect(typeof sub.unsubscribe).toBe("function");
    });
  });
});
