# Plan: Robust Reconnection for `YuzuClient`

## Goals

1. Fix the rough edges identified in the current auto-reconnect implementation.
2. Add a configurable **reconnection strategy** (fixed delay vs. exponential backoff).
3. Make the reconnection delay configurable.
4. Allow the consuming application to **enable/disable automatic reconnection** at runtime (e.g. pause while the user is logged out, resume on login).

All changes are additive and backward-compatible: existing callers using `reconnectTimeout` keep working with the current fixed-delay behaviour.

---

## Background: current behaviour

The reconnect loop lives entirely in `connect()`'s `close` handler:

```
close fires → wait reconnectTimeout ms → connect() → new socket → close → …
```

- `reconnectTimeoutId` holds the pending timer so `reconnect()`/`disconnect()` can cancel it.
- `isManualReconnect` is a one-shot flag set before a deliberate `close()` so the `close` handler doesn't immediately reschedule.
- `error` handler just calls `close()`, so error recovery rides on the same path.
- `connected$`/`isConnected` are status only; they don't drive the loop.

### Known rough edges to fix

1. **No backoff** — fixed 3 s retry forever.
2. **No jitter** — thundering herd on server restart.
3. **`getToken()` failure kills the loop silently** — `connect()` is `async`; if the awaited `getToken()` rejects, `connect()` returns without opening a socket or scheduling a retry.
4. **No max retry count / no "give up" signal** — retries continue indefinitely with no way for the app to know reconnection has been abandoned.
5. **`isManualReconnect` lifecycle is fragile** — only read in the `close` handler; a stray `true` would suppress the next auto-reconnect.
6. **No public way to pause/resume auto-reconnect** — the only controls are `reconnect()` (one-shot) and `disconnect()` (permanent).
7. **`reconnect()` while already disconnected** works but only by accident (skips the manual-close block).

---

## Design

### New config shape

Extend `YuzuClientConfig` with a `reconnect` section. Keep the existing top-level `reconnectTimeout` as a deprecated shorthand that maps onto the new structure for backward compatibility.

```typescript
export interface ReconnectConfig {
  /** Master switch. Default true. When false, the client never auto-reconnects. */
  enabled?: boolean;
  /** Strategy. Default "fixed". */
  strategy?: "fixed" | "exponential";
  /** Base delay in ms. Default 3000. For exponential, this is delay for attempt #1. */
  baseDelayMs?: number;
  /** Multiplier applied each exponential step. Default 2. (strategy="exponential" only) */
  multiplier?: number;
  /** Cap on delay between attempts in ms. Default 30000. (strategy="exponential" only) */
  maxDelayMs?: number;
  /** Random jitter fraction in [0,1]. Default 0.2 (±20%). 0 disables jitter. */
  jitter?: number;
  /** Max consecutive attempts before giving up. Default 0 = unlimited. */
  maxAttempts?: number;
}

export interface YuzuClientConfig {
  address: string;
  /** @deprecated use reconnect.baseDelayMs */
  reconnectTimeout?: number;
  token?: string;
  getToken?: () => string | Promise<string>;
  externalTransport?: boolean;
  onMessage?: (message: string) => void;
  /** Reconnection behaviour. Omit for defaults (fixed 3 s, enabled). */
  reconnect?: ReconnectConfig;
}
```

### New public API on `YuzuClient`

| Method | Purpose |
|---|---|
| `setAutoReconnect(enabled: boolean)` | Pause/resume auto-reconnect at runtime. When set to `false`, cancels any pending retry and prevents future auto-reconnects until set back to `true`. Does **not** close the current socket. |
| `reconnect()` | Unchanged signature, but now: cancels pending timer, resets attempt counter, connects immediately (no delay). Always performs this one connect regardless of `autoReconnectEnabled`; subsequent closes respect the flag. |
| `disconnect(options?: { reconnect?: boolean })` | Closes the socket. `reconnect` defaults to `false`. See semantics table below. |
| New observable `reconnectState$` | Separate from `connected$`. Emits `{ status: "connected" | "reconnecting" | "disconnected" | "gave-up", attempt: number }` so the app can show UI ("Reconnecting in 4s…", "Connection lost — please log in"). |

#### `disconnect()` semantics

`disconnect` now takes an explicit options object so the post-close behaviour is declared at the call site rather than implied by prior state:

```typescript
disconnect(options?: { reconnect?: boolean }): void
```

- `disconnect()` / `disconnect({ reconnect: false })` (default) — close socket, suppress this close's auto-reconnect, and set `autoReconnectEnabled = false`. Permanent until `reconnect()` or `setAutoReconnect(true)` is called. This replaces the old `isManualReconnect` one-shot trick with an explicit, durable flag.
- `disconnect({ reconnect: true })` — close socket, but let the `close` handler schedule a normal reconnect (with backoff). Useful for "I want to drop this connection and let Yuzu reconnect on its own schedule."

**Edge case — called while already disconnected (socket `undefined`, timer pending):** there is no socket to close and therefore no `close` event to drive the schedule. Handle by clearing the pending timer and calling `connect()` directly, so the call is never a silent no-op. (Only relevant when `reconnect: true`; with `reconnect: false` we just clear the timer and stay disconnected.)

#### Three-way comparison of close-and-maybe-reconnect methods

| Method | Closes socket? | Reconnects? | Delay before reconnect | Resets attempt counter? | Sets `autoReconnectEnabled`? |
|---|---|---|---|---|---|
| `disconnect()` | yes | no | — | no | → `false` |
| `disconnect({ reconnect: true })` | yes | yes (scheduled) | normal backoff | no | unchanged |
| `reconnect()` | yes | yes (immediate) | none | yes | unchanged (but always connects this once) |

### Internal state additions

- `private autoReconnectEnabled: boolean` — runtime override, initialised from config.
- `private reconnectAttempt: number` — 0 when connected/idle, increments on each scheduled retry, resets to 0 on successful `open`.
- `private gaveUp: boolean` — set when `maxAttempts` is reached; cleared by `reconnect()`.
- `private _suppressNextCloseSchedule: boolean` — transient one-shot, set only inside `reconnect()` before its deliberate `ws.close()`, cleared unconditionally at the top of the close handler. Prevents the close triggered by `reconnect()` from scheduling a second reconnect on top of the immediate one. (This is the *only* remaining one-shot flag; the old `isManualReconnect` is removed.)
- `private computeDelay(): number` — pure function of `reconnectAttempt` + config (strategy, base, multiplier, max, jitter).

### Retry scheduling logic (replaces the current `setTimeout` block)

```
on close:
  _connected.next(false)
  if _suppressNextCloseSchedule:                         // set by reconnect()'s deliberate close
    _suppressNextCloseSchedule = false
    return
  if !autoReconnectEnabled: return                       // covers disconnect() & setAutoReconnect(false)
  if gaveUp: return
  reconnectAttempt += 1
  if maxAttempts > 0 && reconnectAttempt > maxAttempts:
    gaveUp = true
    reconnectState$.next({ status: "gave-up", attempt: reconnectAttempt })
    return
  delay = computeDelay(reconnectAttempt)
  reconnectState$.next({ status: "reconnecting", attempt: reconnectAttempt })
  reconnectTimeoutId = setTimeout(() => connect(), delay)
```

Note: `isManualReconnect` is removed entirely. The `disconnect({ reconnect: false })` path sets `autoReconnectEnabled = false`, which the close handler checks — no one-shot flag needed for that case. The only remaining one-shot is `_suppressNextCloseSchedule`, used exclusively by `reconnect()` (see Internal state additions).

`computeDelay`:
- `fixed`: `baseDelayMs` (± jitter)
- `exponential`: `min(baseDelayMs * multiplier^(attempt-1), maxDelayMs)` (± jitter)
- jitter: `delay * (1 + (random*2-1) * jitterFraction)`, clamped to ≥ 0

### `connect()` hardening

Wrap the token acquisition in try/catch so a failing `getToken()` doesn't silently kill the loop. **Decision (Q1): connect anyway without a token**, and log a warning. Rationale: the consuming app may have a fallback auth path, and a token-less connect that gets rejected by the server will simply close and re-enter the normal backoff loop — no worse than refusing to connect, and simpler than special-casing a retry.

```
let token: string | undefined
try {
  token = config.getToken ? await config.getToken() : config.token
} catch (e) {
  console.warn("YuzuClient: getToken() failed, connecting without token", e)
  // token remains undefined; connect proceeds
}
```

### `open` handler

On successful open:
```
reconnectAttempt = 0
gaveUp = false
reconnectState$.next({ status: "connected", attempt: 0 })
```

### `reconnect()`

```typescript
reconnect(): void
```

```
if (externalTransport):
  console.warn("reconnect() does nothing in externalTransport mode")
  return

// Clear any pending automatic reconnection
if (reconnectTimeoutId !== undefined):
  clearTimeout(reconnectTimeoutId); reconnectTimeoutId = undefined

// Reset attempt counter and gave-up state (Q3: explicit user action clears these)
reconnectAttempt = 0
gaveUp = false

// Close existing connection if present.
// IMPORTANT: closing fires the close handler, which (if autoReconnectEnabled
// is still true) would schedule ANOTHER reconnect on top of our immediate one.
// To avoid the double-schedule, set a transient guard before closing:
if (this.ws):
  this._suppressNextCloseSchedule = true   // transient, cleared in the close handler
  this.ws.close()
  this.ws = undefined

this._connected.next(false)
this.connect()                              // immediate, no delay
```

The `_suppressNextCloseSchedule` flag is a **transient** one-shot (distinct from the removed `isManualReconnect`): it is only ever set inside `reconnect()` immediately before a deliberate close, and is unconditionally cleared at the top of the close handler. This is the one place we still need a one-shot, because `autoReconnectEnabled` must remain `true` for *future* closes — we only want to suppress the close triggered by our own `ws.close()` here.

The close handler becomes:

```
on close:
  _connected.next(false)
  if (_suppressNextCloseSchedule):
    _suppressNextCloseSchedule = false
    return
  if !autoReconnectEnabled: return
  ... (rest unchanged)
```

### `setAutoReconnect(enabled)`

```typescript
setAutoReconnect(enabled: boolean): void
```

```
if (externalTransport):
  console.warn("setAutoReconnect() does nothing in externalTransport mode")
  return

autoReconnectEnabled = enabled
if (!enabled && reconnectTimeoutId !== undefined):
  clearTimeout(reconnectTimeoutId); reconnectTimeoutId = undefined
  reconnectState$.next({ status: "disconnected", attempt: reconnectAttempt })
if (enabled && !isConnected && !gaveUp && ws === undefined):
  // resume: connect now rather than waiting for a close that won't come
  connect()
```

**Note on `gaveUp`:** if the client has given up (`gaveUp === true`), calling `setAutoReconnect(true)` does **not** resume — the resume condition explicitly checks `!gaveUp`. To retry after a give-up, the app must call `reconnect()`, which clears `gaveUp` and resets the attempt counter. This is intentional: a give-up is a terminal state that requires an explicit user action to escape, not a flag toggle.

### `disconnect(options?: { reconnect?: boolean })`

```typescript
disconnect(options?: { reconnect?: boolean }): void
```

```
if (externalTransport):
  console.warn("disconnect() does nothing in externalTransport mode")
  return

const reconnect = options?.reconnect ?? false

// Always clear any pending retry — we're about to close, and the close
// handler (if reconnect:true) will schedule a fresh one.
if (reconnectTimeoutId !== undefined):
  clearTimeout(reconnectTimeoutId); reconnectTimeoutId = undefined

if (reconnect) {
  // Let the close handler schedule a normal backoff reconnect.
  // Do NOT set autoReconnectEnabled = false.
  if (this.ws) {
    this.ws.close()           // close handler will schedule
  } else {
    // Already disconnected (mid-reconnect window): no close event will fire,
    // so kick a connect directly to avoid a silent no-op.
    this.connect()
  }
} else {
  // Permanent disconnect until reconnect()/setAutoReconnect(true).
  this.autoReconnectEnabled = false
  if (this.ws) {
    this.ws.close()           // close handler sees autoReconnectEnabled=false → no schedule
  }
  this._connected.next(false)
  this.reconnectState$.next({ status: "disconnected", attempt: this.reconnectAttempt })
}
```

Note: with `reconnect: false`, we no longer need the `isManualReconnect` flag — `autoReconnectEnabled = false` is checked in the close handler and is durable. The one-shot `isManualReconnect` flag is removed entirely.

### Backward compatibility

- If `reconnect` is omitted, behaviour matches today: fixed 3 s, enabled, unlimited.
- If only `reconnectTimeout` is supplied, it overrides `baseDelayMs` and strategy stays `"fixed"`.
- `reconnect()` keeps its current signature (no args) and gains the attempt-counter reset + immediate connect behaviour — additive.
- `disconnect()` gains an optional `options` object. Since the arg is optional and `reconnect` defaults to `false` (matching today's permanent-disconnect behaviour), existing callers are unaffected.
- `connected$` and `isConnected` are unchanged; `reconnectState$` is a new, additive observable.

### `externalTransport` mode

All reconnect-related APIs warn and no-op in external transport mode, matching the existing guards on `reconnect()`/`disconnect()`:

- `setAutoReconnect()` → `console.warn`, return.
- `reconnect()` → already warns and returns (unchanged).
- `disconnect()` → already warns and returns (unchanged).
- `reconnectState$` → seeded with `{ status: "disconnected", attempt: 0 }` and never emits again (the client never owns a transport in this mode). Consumers in external transport mode should not rely on `reconnectState$` for connection status — they own the transport and should track status themselves.

### `reconnectState$` seeding

`reconnectState$` is backed by a `BehaviorSubject` (like `connected$`), seeded with:

```typescript
{ status: "disconnected", attempt: 0 }
```

so subscribers receive an initial value immediately on subscribe.

---

## Tasks

- [ ] **T1 — Config types**: Add `ReconnectConfig` to `YuzuClientConfig` in `src/client.ts`; mark `reconnectTimeout` `@deprecated`.
- [ ] **T2 — Defaults**: Add `CLIENT_DEFAULT_RECONNECT_*` constants to `YUZU_SETTINGS` in `src/shared.ts` (base delay, multiplier, max delay, jitter, max attempts).
- [ ] **T3 — Internal state**: Add `autoReconnectEnabled`, `reconnectAttempt`, `gaveUp`, `_suppressNextCloseSchedule`, and the `reconnectState$` subject/observable (seeded `{ status: "disconnected", attempt: 0 }`) to `YuzuClient`.
- [ ] **T4 — `computeDelay()`**: Implement the pure delay function with strategy + jitter.
- [ ] **T5 — `connect()` hardening**: Wrap `getToken()` in try/catch; reset `reconnectAttempt`/`gaveUp` and emit `connected` on `open`.
- [ ] **T6 — `close` handler rewrite**: Replace the `setTimeout` block with the retry-scheduling logic above (check `_suppressNextCloseSchedule` first, then `autoReconnectEnabled`, attempt counter, maxAttempts, gave-up emission).
- [ ] **T7 — `setAutoReconnect()`**: New public method; warn+no-op in externalTransport mode; cancel pending timer when pausing, kick a `connect()` when resuming while disconnected (and `!gaveUp`).
- [ ] **T8 — `reconnect()`/`disconnect()` update**: `reconnect()` resets attempt counter, sets `_suppressNextCloseSchedule`, closes existing socket, connects immediately. `disconnect()` takes `options?: { reconnect?: boolean }`; warn+no-op in externalTransport mode; `reconnect:false` (default) sets `autoReconnectEnabled = false`; `reconnect:true` lets the close handler schedule. Remove the `isManualReconnect` flag entirely.
- [ ] **T9 — Backward-compat shim**: In the constructor, merge `reconnectTimeout` into `reconnect.baseDelayMs` if `reconnect` is absent.
- [ ] **T10 — Tests**: Add `client.test.ts` cases for: fixed vs exponential delay values, jitter bounds, maxAttempts → gave-up, `setAutoReconnect(false)` cancels pending retry, `setAutoReconnect(true)` resumes (but not after `gaveUp`), `getToken()` rejection connects without token + logs warning, `reconnect()` resets counter and doesn't double-schedule, `disconnect({ reconnect: true })` schedules a reconnect, `disconnect({ reconnect: false })` (default) suppresses it, `disconnect({ reconnect: true })` while already disconnected kicks `connect()` directly, all reconnect APIs warn+no-op in externalTransport mode. Use fake timers.
- [ ] **T11 — Docs**: Update the JSDoc on `YuzuClientConfig` and `disconnect()`, and add a short "Reconnection" section to `README.md`.
- [ ] **T12 — Version bump**: `1.1.0` (additive, non-breaking) → `npm publish`.

---

## Resolved questions

1. **`getToken()` failure handling** → **Connect anyway without a token**, log a `console.warn`. A rejected token-less connect will just close and re-enter normal backoff; no special retry path needed.
2. **`reconnectState$` shape** → **Separate observable** from `connected$`, to avoid breaking existing `connected$` consumers.
3. **`maxAttempts` reset on manual `reconnect()`** → **Yes.** `reconnect()` is an explicit user action and clears `gaveUp` + resets the counter.
4. **Jitter default** → **0.2 (±20%)** in production; tests set `jitter: 0` for deterministic assertions.
5. **`disconnect()` semantics** → **Explicit options object**: `disconnect(options?: { reconnect?: boolean })`. `reconnect` defaults to `false` (permanent until `reconnect()`/`setAutoReconnect(true)`); `reconnect: true` lets the close handler schedule a normal backoff. This replaces the implicit `isManualReconnect` one-shot flag, which is removed entirely.

---

## Open questions

None remaining. Ready to implement on approval.

---

## Out of scope

- Server-side reconnection logic (server doesn't reconnect; clients do).
- Changing the wire protocol.
- Replacing `ws` or adding transport-level keepalive/ping frames (separate concern; could be a follow-up).
- Per-listener backoff (all listeners share one client → one reconnect loop).
