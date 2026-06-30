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
| `reconnect()` | Unchanged signature, but now: cancels pending timer, resets attempt counter, connects immediately. Respects `autoReconnectEnabled` for *subsequent* closes but always performs this one connect. |
| `disconnect()` | Unchanged: cancels timer, closes socket, sets `autoReconnectEnabled = false` for this session (so the close handler won't reschedule). |
| New observable `reconnectState$` | Emits `{ status: "connected" | "reconnecting" | "disconnected" | "gave-up", attempt: number }` so the app can show UI ("Reconnecting in 4s…", "Connection lost — please log in"). |

### Internal state additions

- `private autoReconnectEnabled: boolean` — runtime override, initialised from config.
- `private reconnectAttempt: number` — 0 when connected/idle, increments on each scheduled retry, resets to 0 on successful `open`.
- `private gaveUp: boolean` — set when `maxAttempts` is reached; cleared by `reconnect()`.
- `private computeDelay(): number` — pure function of `reconnectAttempt` + config (strategy, base, multiplier, max, jitter).

### Retry scheduling logic (replaces the current `setTimeout` block)

```
on close:
  _connected.next(false)
  if isManualReconnect: isManualReconnect = false; return
  if !autoReconnectEnabled: return
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

`computeDelay`:
- `fixed`: `baseDelayMs` (± jitter)
- `exponential`: `min(baseDelayMs * multiplier^(attempt-1), maxDelayMs)` (± jitter)
- jitter: `delay * (1 + (random*2-1) * jitterFraction)`, clamped to ≥ 0

### `connect()` hardening

Wrap the token acquisition in try/catch so a failing `getToken()` doesn't silently kill the loop:

```
try {
  token = config.getToken ? await config.getToken() : config.token
} catch (e) {
  console.error("YuzuClient: getToken() failed, reconnecting without token", e)
  // fall through with token undefined, or schedule a retry
}
```

Decision to make (see Open Questions): on `getToken()` failure, do we (a) connect without a token, or (b) schedule a retry? Lean toward (b) with a warning, since connecting without a token will likely just get rejected and close again — but (a) is simpler.

### `open` handler

On successful open:
```
reconnectAttempt = 0
gaveUp = false
reconnectState$.next({ status: "connected", attempt: 0 })
```

### `setAutoReconnect(enabled)`

```
autoReconnectEnabled = enabled
if (!enabled && reconnectTimeoutId !== undefined):
  clearTimeout(reconnectTimeoutId); reconnectTimeoutId = undefined
  reconnectState$.next({ status: "disconnected", attempt: reconnectAttempt })
if (enabled && !isConnected && !gaveUp && ws === undefined):
  // resume: connect now rather than waiting for a close that won't come
  connect()
```

### Backward compatibility

- If `reconnect` is omitted, behaviour matches today: fixed 3 s, enabled, unlimited.
- If only `reconnectTimeout` is supplied, it overrides `baseDelayMs` and strategy stays `"fixed"`.
- `reconnect()` and `disconnect()` keep their current signatures and semantics; `disconnect()` now also flips `autoReconnectEnabled = false` (previously it relied on `isManualReconnect` for the one close event — now it's explicit and survives any future close).

---

## Tasks

- [ ] **T1 — Config types**: Add `ReconnectConfig` to `YuzuClientConfig` in `src/client.ts`; mark `reconnectTimeout` `@deprecated`.
- [ ] **T2 — Defaults**: Add `CLIENT_DEFAULT_RECONNECT_*` constants to `YUZU_SETTINGS` in `src/shared.ts` (base delay, multiplier, max delay, jitter, max attempts).
- [ ] **T3 — Internal state**: Add `autoReconnectEnabled`, `reconnectAttempt`, `gaveUp`, and the `reconnectState$` subject/observable to `YuzuClient`.
- [ ] **T4 — `computeDelay()`**: Implement the pure delay function with strategy + jitter.
- [ ] **T5 — `connect()` hardening**: Wrap `getToken()` in try/catch; reset `reconnectAttempt`/`gaveUp` and emit `connected` on `open`.
- [ ] **T6 — `close` handler rewrite**: Replace the `setTimeout` block with the retry-scheduling logic above (attempt counter, maxAttempts, gave-up emission).
- [ ] **T7 — `setAutoReconnect()`**: New public method; cancel pending timer when pausing, kick a `connect()` when resuming while disconnected.
- [ ] **T8 — `reconnect()`/`disconnect()` update**: Reset attempt counter; `disconnect()` sets `autoReconnectEnabled = false`.
- [ ] **T9 — Backward-compat shim**: In the constructor, merge `reconnectTimeout` into `reconnect.baseDelayMs` if `reconnect` is absent.
- [ ] **T10 — Tests**: Add `client.test.ts` cases for: fixed vs exponential delay values, jitter bounds, maxAttempts → gave-up, `setAutoReconnect(false)` cancels pending retry, `setAutoReconnect(true)` resumes, `getToken()` rejection doesn't kill the loop, `reconnect()` resets counter. Use fake timers.
- [ ] **T11 — Docs**: Update the JSDoc on `YuzuClientConfig` and add a short "Reconnection" section to `README.md`.
- [ ] **T12 — Version bump**: `1.1.0` (additive, non-breaking) → `npm publish`.

---

## Open questions

1. **`getToken()` failure handling**: connect without token, or schedule a retry? → **Proposal: schedule a retry** (same delay rules), since a token-less connect will usually be rejected and close anyway. Log a warning each time.
2. **`reconnectState$` shape**: separate observable vs. fold into `connected$`? → **Proposal: separate observable** to avoid breaking `connected$` consumers.
3. **Should `maxAttempts` reset on manual `reconnect()`?** → **Proposal: yes** — `reconnect()` is an explicit user action and should clear `gaveUp`.
4. **Jitter default**: 0.2 (±20%) is common but adds noise to tests. → **Proposal: default 0.2, but tests set `jitter: 0`** for deterministic assertions.
5. **`disconnect()` semantics**: should it set `autoReconnectEnabled = false` permanently, or just for this session? → **Proposal: permanent until `setAutoReconnect(true)` or `reconnect()` is called**, which is clearer than the current `isManualReconnect` one-shot trick.

---

## Out of scope

- Server-side reconnection logic (server doesn't reconnect; clients do).
- Changing the wire protocol.
- Replacing `ws` or adding transport-level keepalive/ping frames (separate concern; could be a follow-up).
- Per-listener backoff (all listeners share one client → one reconnect loop).
