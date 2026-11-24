# The feed says «Reconnecting» as soon as the browser goes offline

> 2026-11-24 · improvement 7 of `evaluacion-2026-11-22/mejoras-ui.md`, checked again on the rehearse stack
> (`five-decisions.md`, «Checked, no change: 7»); Luis 2026-11-24, on ending the stream when the browser reports
> `offline`: «Sí, hazlo». Studio only; no API, no new words.

## What was measured

- On the rehearse stack (`main` ffc32c4fd), with the person's browser offline for 20 s and the API fine, the header
  kept «Up to date» for 11.5 s, until the open stream had been quiet for `STREAM_IDLE_TIMEOUT_MS` (25 s,
  `api/stream.ts`). Once back online, it read «Up to date» again 54 ms later.
- The browser already knew. Chromium fires `offline` and sets `navigator.onLine` to false at once. The feed listens
  only to `online`, and only while it waits (`pageWakes`, `feed-reconnect.md`). While the stream is open, nothing
  reads the drop, so a stream whose bytes can no longer arrive is trusted until its silence runs out.
- The API side stays as it is. The 25 s wait is the only signal when the API dies behind a proxy that keeps the
  browser's side open (the dev proxy did, 25.0 s), and `offline` says nothing about that.

## What changes

- **A `drops(drop)` port** beside `wakes` (`feed-loop.ts`). It calls `drop` when the page learns the network is gone,
  and returns how to stop listening. In the page (`pageDrops`, `useProjectFeed.ts`), that is the window's `offline`
  event.
- **Listened to only while a stream attempt runs** (`followOnce`), as `wakes` is only while the loop waits. A drop
  aborts that attempt, the way a gap does. The loop then does what it does for any ended stream: «Reconnecting», then
  the wait, woken by `online`. The backoff isn't reset by a drop; only a live stream resets it.
- Nothing else changes: the stream's 25 s wait, the backoff and its spread, the pill's words and its `role="status"`
  (each change is announced, as before).

## Checks, written first

- **Unit** (`feed-loop.test.ts`, a fake drop source):
  - A drop while the stream is open ends that attempt at once: «Reconnecting», then one wait, then the next ask.
  - Nothing listens for a drop while the loop waits.
  - Red today: there is no drop port, and a stream stays open until it ends.
- **Browser** (`e2e/feed-recovery.spec.ts`): the browser goes offline (`context.setOffline`). The fixture's API is cut
  too (`outage`), but its open stream is not dropped. The pill reads «Reconnecting» within 1 s, and back online it
  reads «Up to date» within 2 s. Red today: the fixture's stream keeps pinging in the page, so the pill stays «Up to
  date».
- **Rehearse stack**: the same three cuts as in `five-decisions.md`. The offline row should read «Reconnecting» in
  milliseconds, and the two API rows should not change.

## What was measured after

- Unit: `feed-loop.test.ts`, 16 of 16 with `project-feed-refresh.test.ts`; the drop test was red before the port.
- Browser, `feed-recovery.spec.ts` through the guard: 7 of 7. Offline to «Reconnecting» in 25 ms, back to «Up to date»
  in 28 ms; the new test was red before the change (the pill stayed «live»).
- Rehearse stack, the three cuts again: browser offline → «Reconnecting» 18 ms after (was 11.5 s), back 46 ms after;
  API killed → 25.0 s, as before; API down 40 s → 22.0 s, as before.
