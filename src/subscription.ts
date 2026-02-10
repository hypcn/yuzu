
/**
 * An object returned for a call to a subscribe function, enabling cleanup of the subscription.
 * Named to avoid collision with rxjs Subscription, but the functionality is very similar
 */
export class YuzuSubscription {

  /**
   * The list of functions to call when unsubscribing this subscription object
   * @internal
   */
  _unsubFunctions: (() => void)[];

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
   * @example
   * ```typescript
   * const sub = client.state$.count.subscribe(value => console.log(value));
   * sub.unsubscribe(); // Stop listening to changes
   * ```
   */
  unsubscribe() {
    for (const unsub of this._unsubFunctions) {
      unsub();
    }
  }

  /**
   * Adds one or more subscriptions to this subscription.
   * When this subscription is unsubscribed, all added subscriptions will also be unsubscribed.
   * This is useful for managing multiple subscriptions as a group.
   * @param subscriptions - One or more YuzuSubscription instances to add
   * @example
   * ```typescript
   * const sub = new YuzuSubscription();
   * const sub1 = client.state$.count.subscribe(...);
   * const sub2 = client.state$.name.subscribe(...);
   * sub.add(sub1, sub2);
   * sub.unsubscribe(); // Unsubscribes both sub1 and sub2
   * ```
   */
  add(...subscriptions: YuzuSubscription[]) {
    for (const sub of subscriptions) {
      this._unsubFunctions.push(...sub._unsubFunctions);
    }
  }

}
