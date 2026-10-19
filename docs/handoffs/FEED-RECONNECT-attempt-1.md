# Implementation-session handoff

Goal and attempt: FEED-RECONNECT (reliability baseline gap #7, with the gap #6 levers needed to prove it, from
`evaluacion-2026-10-19/fiabilidad/linea-base.md` §1.4, §4 M3/M4, §5; Luis 2026-10-19: «quisiera trabajar en la
fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Procede con el
script de medición y el lote R1»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-9`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-9`, branch `reliability/feed-reconnect` from the local
`group/follow-ups-5` (`56c61c61e`, stacked on #468; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19 (above); local only, nothing pushed.
Ending commit/tree: `76408c939`, the last commit that changes code (the review's P3, after this record was first
written; the next one updates only this record). Files changed against `56c61c61e`: `e2e/feed-recovery.spec.ts` (new), `fixtures/fixture-api.ts`,
`fixtures/room.tsx`, `src/features/studio/feed-loop.ts`, `src/features/studio/feed-loop.test.ts`,
`src/features/studio/useProjectFeed.ts`, `docs/plans/feed-reconnect.md`, and this record.

## Outcome

- Back online, or with the page shown again, the project feed asks for its stream at once. Before, the header said
  «Reconnecting» until the pending wait ran out, up to 10 s. Measured: going online after an 8 s wait had started,
  «Up to date» came 7150 ms later before the fix and 19 ms later after it.
- The waits after a lost stream are spread ±30 %, so pages that lost the stream together (an API restart) come back
  over 0.6 s at the first step and 6 s at the cap instead of all at once. The first wait the person sees is still about
  1 s (0.7-1.3 s).
- Leaving the project, or a token change, ends a pending wait at once: its timer and its `online`/`visibilitychange`
  listeners no longer stay behind for up to 13 s (independent review, P3).
- The fixture can now end (`dropStream`), silence (`stallStream`) or break (`gap`) the project stream from the server's
  side, on the room page's `window.fixture`. `StreamStalled` has its first test. The measurement branch can use the
  levers for M3/M4.

## Evidence

- The baseline's claims hold against the code at `56c61c61e` (`feed-loop.ts:29-30` and `72-79`, no jitter, no
  `online`/`visibilitychange` in the feed, no `StreamStalled` test). One difference: the fixture pings every 5 s, the
  API every 10 s. The note's «What was measured» has the details.
- Levers with their browser checks, `4c7462a21` (`feed-levers-1`, 3/3). They pass before any fix, as expected for
  coverage. Recovery to «Up to date»: dropped stream 1012 ms, gap 37 ms («Catching up», never «Reconnecting»), stalled
  stream 25355 ms (25 s after the last bytes, plus one wait).
- Written first, each red at its own commit before its fix:
  - `980e094cb` (unit): «spreads each wait by ±30 %…» fails with deepStrictEqual, actual `[1000, 2000, 4000, 8000,
    10000]`, expected `[700, 1400, 2800, 5600, 7000]`. «keeps every spread wait in its band…» fails «wait 0 is spread»
    (1000 = 1000). Fixed at `135cb2908`.
  - `f8865aa54` (unit): «a wake during the wait asks again at once…» fails «woken, it asks again at once», `1 !== 2`.
    «nothing listens for a wake while the stream is open…» fails `0 !== 1` (nothing listens during the wait either).
    Browser (`feed-wake-red-1`): «offline, then back online…» fails at `feed-recovery.spec.ts:159`,
    `toBeLessThanOrEqual`, Expected `<= 2000`, Received `7150`. Fixed at `4f829862a`.
  - `1067284c1` (unit, review P3): «stopping during the wait ends it at once…» fails «stopped, nothing listens any
    more», `1 !== 0`. Fixed at `76408c939` (`wait` also ends on `stop`).
- Playwright through the guard, two workers, at `4f829862a`. `feed-wake-green-1`: feed-recovery, unread-title (the
  `holdFeed` checks), dock-header and room, 55/55. Recovery there: dropped 1062 ms, gap 32 ms, back online 19 ms,
  stalled 25583 ms. `feed-wake-green-2`: every other spec that uses `outage`, `shutDoor`, the feed pill or
  `setOffline` on the project (archive-project, commands, design-refusal, project-conversation-writes, room-discussion,
  studio-lens-address, workcard-refusal, fence-frame, reconnecting-on-video), 75/75.
- At `76408c939` (`feed-stop-green-1`): feed-recovery, unread-title, dock-header and room, 55/55. Recovery: dropped
  1217 ms, gap 27 ms, back online 18 ms, stalled 25201 ms.
- Unit: the Studio suite passes 1911/1913 at `76408c939`. The two failures are the Windows path ones (`attention.test.ts`,
  `browser-imports.test.ts`). `feed-loop.test.ts` 11/11 and `project-feed-refresh.test.ts` 3/3.
- Whole-repo `oxlint --type-aware` is clean, `tsc --noEmit -p apps/studio` is clean, and Prettier is clean on every
  touched non-docs file.

## Decisions and changes

- **±30 %, not full jitter.** Full jitter (a wait anywhere from 0 to the step) halves the mean wait and can ask again at
  once, while the API is still starting, and the person's «Reconnecting» gets no shorter on average. The doubling and
  the reset stay on the exact step, so the band is ±30 % at every step: 7-13 s at the cap, which can go past the
  10 s cap. Clamping to 10 s would pile half the pages at exactly 10 s, during the long outages where spreading matters
  most.
- **The loop owns the wake policy.** `FeedPorts` gains `wakes(wake)` and `random()`, and `sleep` takes a signal. The
  loop listens only while it waits, and the first wake or the loop's stop ends that wait (`wait`, `feed-loop.ts`), so the policy is unit
  tested. The page's ports (`pageWakes` and `sleep`, `useProjectFeed.ts`) only wire the window's `online` and
  `visibilitychange` to visible, and clear the timer.
- **A wake doesn't reset the backoff.** Only a live stream resets it. A woken ask that fails waits the next step.
- **The browser check loses the network with the fixture's levers.** `context.setOffline` doesn't reach the fixture's
  API (it answers in the page's `fetch`), so the check also sets `outage` and `dropStream`. It counts the stream asks
  with a wrapper over the page's `fetch` inside the spec, not with a new fixture lever. Three refused asks put the loop
  in its 8 s ± 30 % wait, so the check is red today whatever the draw (5.6-10.4 s left).
- **The stream is a small record in the fixture** (`OpenStream`: send, end, stall) instead of its bare controller, so
  ending one also stops its ping.
- **The test-first commits don't type-check.** They add ports (`random`, `wakes`) the type doesn't have yet. Node strips
  types, so they run and fail on their assertions. Type checks are clean from each fix on.

## Remaining obligations

- A wake that comes while an ask is on its way isn't kept for the wait after it. Offline, an ask fails at once, so
  `online` comes during a wait. Kept simple until a measurement says otherwise.
- `visibilitychange` is unit tested only. The browser check covers `online`. `offline` doesn't end a live stream early,
  and a hidden page keeps trying, as before.
- The stall check takes about 27 s. `STREAM_IDLE_TIMEOUT_MS` isn't overridable by the page, and a production knob only
  for a test isn't worth it.
- The levers are ready for M3/M4 (`scripts/reliability-report.mjs`, the measurement branch). The spec already prints
  each recovery time.

## Next bounded action

- Luis: review and fold this branch into the next batch PR with the rest of R1 (CI bottleneck batching), then merge on
  green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the reliability baseline
  only.
