
/**
 * An object returned for a call to a subscribe function, enabling cleanup of the subscription.
 * Named to avoid collision with rxjs Subscription, but the functionality is very similar
 */
export class Subscription {

  /**
   * The list of functions to call when unsubscribing this subscription object
   * @internal
   */
  _unsubFunctions: (() => void)[];

  constructor(unsubscribe?: () => void) {
    this._unsubFunctions = unsubscribe ? [unsubscribe] : [];
  }

  unsubscribe() {
    for (const unsub of this._unsubFunctions) {
      unsub();
    }
  }

  add(...subscriptions: Subscription[]) {
    for (const sub of subscriptions) {
      this._unsubFunctions.push(...sub._unsubFunctions);
    }
  }

}
