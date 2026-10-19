# The project feed comes back spread out, and at once when the network does

> 2026-10-19 · reliability baseline gap #7, with the levers of gap #6 it needs to be proved
> (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.4, §4 M3/M4, §5); Luis 2026-10-19: «quisiera trabajar en la
> fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Procede con
> el script de medición y el lote R1». Studio only; no API.

## What was measured

- The baseline holds against the code at `56c61c61e`. `runFeedLoop` (`feed-loop.ts`) waits `MIN_BACKOFF_MS` (1 s),
  doubling to `MAX_BACKOFF_MS` (10 s), after every stream that ends or fails, and goes back to 1 s once the stream is
  live again. The wait is exact: every page that lost the stream at the same moment (an API restart ends them all)
  asks again at the same moment, 1 s later, then 2 s, then 4 s.
- Nothing ends the wait early. `useProjectFeed`'s `sleep` is a bare `setTimeout`; the feed listens to neither `online`
  nor `visibilitychange` (only `personal/online.ts`, `useSinceNews.ts` and `unread-title.ts` do, for their own
  things). After the network returns, the page says «Reconnecting» until the pending wait runs out: up to 10 s.
- The fixture can't make any of this happen. Its stream (`fixture-api.ts`, `eventStream`) stays open until the page
  drops it, pings every 5 s (the API pings every 10 s), and sends every revision in order. No lever ends it from the
  server, silences it, or skips a sequence, so `StreamStalled` (`api/stream.ts`, 25 s without a byte) has no test at
  all, and the reconnect and resync paths are tested only in `feed-loop.test.ts`.
- `context.setOffline` doesn't reach the fixture's API: it answers in the page's own `fetch` (`room.spec.ts` says so
  at BASE-03). Offline flips `navigator.onLine` and fires `offline`/`online`; the stream has to be lost with the
  fixture's own levers (`outage`, and the new `dropStream`).

## What changes

- **Three fixture levers** (`fixture-api.ts`, exposed on the room page's `window.fixture`), each a few lines:
  - `dropStream()`: the server ends every open stream, as an API restart or a proxy's idle cut does. The page reads the
    end and reconnects from its cursor; what was published meanwhile comes with the stream's history.
  - `stallStream()`: the open streams stay open and send nothing more, not even a ping, as a zombie proxy connection
    does. The page's `StallWatch` gives up after 25 s; a new stream is a healthy one.
  - `gap()`: the next event published skips a sequence, as a lost frame would. The page sees the hole, reads the
    snapshot again (`resyncing`) and follows from its cursor.
  The stream is kept as a small record (send, end, stall) instead of its bare controller, so ending one also stops its
  ping. The levers are there for the measurement branch too (M3, feed recovery; M4, resyncs).
- **Jitter, ±30 %.** Each wait is `backoff × (1 + 0.3 × (2r − 1))`, `r` from a new `random()` port (`Math.random` in
  the page, a fixed number in tests). The doubling and the reset run on the unspread value, so the band stays ±30 %
  at every step, 7–13 s at the cap. Not full jitter (a wait anywhere in 0…backoff): the mean wait halves and a page can
  ask again at once, against an API that is still starting, and the person's «Reconnecting» gets no shorter on
  average. ±30 % spreads pages that lost the stream together over 0.6 s at the first step and 6 s at the cap, and
  keeps the 1 s first step the person sees.
- **Woken by `online` and by the page being shown.** The loop's wait takes a signal (`sleep(ms, woken)`), and a new
  `wakes(wake)` port says when trying now is worth it. In the page (`pageWakes`, `useProjectFeed.ts`) that is the
  window's `online` event and `visibilitychange` to visible. The loop listens only while it waits, and the first wake
  ends that wait: one attempt per wait, so `online` and a shown page together still ask once, and a wake while the
  stream is live does nothing. A woken attempt that fails waits the next step as before; the backoff isn't reset by a
  wake, only by a live stream.

## Checks, written first

- **Browser, with the levers** (`e2e/feed-recovery.spec.ts`, new; coverage, may pass before any fix): each lever on
  `room.html?discussion=3` with the chat open, a message said while the stream is lost. `dropStream` →
  «Reconnecting» → «Up to date» and the message in the chat; `stallStream` → the same after the 25 s stall (the only
  check of `StreamStalled`); `gap` → «Catching up» → «Up to date» and the message. The pill's states are recorded in
  the page with their times, and each check prints its recovery time.
- **Unit, jitter** (`feed-loop.test.ts`): with `random` at 0 and near 1 every wait is at 0.7× and 1.3× its step; over
  a spread of `random` values each wait is in its band. The existing exact backoffs run with `random` at 0.5. Red
  today: every wait is exact.
- **Unit, wake** (`feed-loop.test.ts`, a fake wake source and a sleep that only ends when woken): a wake during the
  wait asks again once; two wakes in the same wait ask once; nothing listens while the stream is open. Red today:
  the wait never ends.
- **Browser, offline** (`feed-recovery.spec.ts`): offline, the fixture out of reach and the stream dropped: the pill
  says «Reconnecting»; after three refused asks (the wait is then 8 s ± 30 %) the fixture comes back and the page goes
  online: «Up to date» within 2 s. Red today: it waits out the 5.6–10.4 s left.

## Limits

- A wake that comes while an attempt is on its way is not kept for the wait after it. Offline, an attempt fails at
  once, so `online` comes during a wait; kept simple until a measurement says otherwise.
- `offline` doesn't end a live stream early; the stream ends by itself or by `StallWatch`. The feed's wait for a
  hidden page isn't changed either (it keeps trying while hidden, as before).
- The stall check takes about 27 s: `STREAM_IDLE_TIMEOUT_MS` is a constant the page doesn't override, and making it
  configurable only for a test isn't worth a production knob.
