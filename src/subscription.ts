import { Unsubscribable } from "rxjs";

/**
 * An object returned for a call to a subscribe function, enabling cleanup of the subscription.
 * Implements the RxJS Unsubscribable interface for compatibility with the RxJS ecosystem.
 * Can be used interchangeably with RxJS Subscription objects.
 */
export class YuzuSubscription implements Unsubscribable {

  /**
   * The list of functions to call when unsubscribing this subscription object
   * @internal
   */
  _unsubFunctions: (() => void)[];

  /**
   * Whether this subscription has been unsubscribed.
   * Once true, calling unsubscribe() again will have no effect.
   */
  closed = false;

  /**
   * Creates a new subscription that can be unsubscribed later.
   * @param unsubscribe - Optional function to call when unsubscribing
   * @example
   * ```typescript
   * const sub = new YuzuSubscription(() => console.log("Unsubscribed"));
   * sub.unsubscribe(); // Logs: "Unsubscribed"
   * ```
   */
  constructor(unsubscribe?: () => void) {
    this._unsubFunctions = unsubscribe ? [unsubscribe] : [];
  }

  /**
   * Unsubscribes by calling all registered unsubscribe functions.
   * Once called, all listeners associated with this subscription will be cleaned up.
   * This method is idempotent - calling it multiple times will only execute cleanup once.
   * @example
   * ```typescript
   * const sub = client.state$.count.subscribe(value => console.log(value));
   * sub.unsubscribe(); // Stop listening to changes
   * sub.unsubscribe(); // Safe to call again, does nothing
   * ```
   */
  unsubscribe() {
    if (this.closed) return;

    for (const unsub of this._unsubFunctions) {
      unsub();
    }

    this.closed = true;
  }

  /**
   * Adds teardown logic to this subscription.
   * When this subscription is unsubscribed, all added teardown logic will also be executed.
   * Accepts YuzuSubscription instances, RxJS Subscription/Unsubscribable objects, or plain functions.
   * This is useful for managing multiple subscriptions as a group.
   * @param teardowns - One or more teardown functions or Unsubscribable objects
   * @example
   * ```typescript
   * const sub = new YuzuSubscription();
   *
   * // Add YuzuSubscription
   * const sub1 = client.state$.count.subscribe(...);
   * sub.add(sub1);
   *
   * // Add plain function
   * sub.add(() => console.log("Cleanup"));
   *
   * // Add RxJS Subscription
   * import { interval } from 'rxjs';
   * const rxjsSub = interval(1000).subscribe(...);
   * sub.add(rxjsSub);
   *
   * sub.unsubscribe(); // Unsubscribes all
   * ```
   */
  add(...teardowns: (Unsubscribable | (() => void))[]) {
    for (const teardown of teardowns) {
      if (typeof teardown === "function") {
        this._unsubFunctions.push(teardown);
      } else if (teardown && typeof teardown.unsubscribe === "function") {
        this._unsubFunctions.push(() => teardown.unsubscribe());
      }
    }
  }

}
