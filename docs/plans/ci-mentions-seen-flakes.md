# The seen-retry cases wait for the failed write's answer before the clock moves

> 2026-10-20 · The reliability baseline's «fallos reales» row, `mentions.spec.ts:577/582` on
> `api/contribution-mentions` (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §2.2), 2 of 2 in the week's ranking,
> the last on 10-19 09:36 UTC; written in Davide's lane (#409). Luis 2026-10-20: «Procede con el próximo lote y arregla
> tú los de Davide»; earlier «Lo que no se mide, no se puede mejorar». Tests only; nothing the person sees changes.

## Measured

- **The two recorded failures are one, already fixed.** Runs 39225403086 (08:48) and 39231306711 (09:36), both on
  #409's merge ref, part 2 of 3 and the fixture page: both tests fail at `pendingSeenRetry`'s `clock.pauseAt` with
  «Cannot fast-forward to the past», every attempt. The helper paused at the page's time read plus 1 ms; Playwright's
  `pauseAt` first adds an init script to the context (a round trip), and the page's clock had synced past the target.
  `f52ca7698` (13:29) pauses a second ahead. No CI run since has failed them: the seven failed runs to 10-20 00:11
  failed elsewhere (`voice-meters`, `next-up`, `press-answers`, `home-needs-refusal`, `light-states`), and the room
  jobs that ran them (#409's merge on main, the tasks branch) passed them.
- **A second race stays, found in the code.** The helper answers the held first write 503 with the clock stopped, then
  runs it 500 ms, then 600 ms more, and expects the retry at the second step (`SEEN_RETRY_MS`, 1 s,
  `useMentionAttention.ts`'s `seenRetries`). The retry's timer is set only once the client has read the 503's body:
  `callApi` → `toError` → `res.json()` → the rejection → `retry()` → `setTimeout`. `releaseSeen()` returns before that
  read, and nothing waits for it. On a stopped clock a timer counts from the moment it is set: read after the first
  `runFor(500)` reached the page, the retry falls due at 1.5 s, and the open case sees 1 write where it expects 2. The
  close case then passes for the wrong reason: the chat closed before any retry was pending, so it proves nothing.
- **Reproduced:** the 503's body held 300 ms of real time (`AbortSignal.timeout`, which the page clock doesn't stop):
  the open case fails 3 of 3, «Expected: 2, Received: 1»; the close case passes.
- **The call's join tick (#466):** neither case reads the dock. `chatToggle` is the first «Chat…» press, there in and
  out of the call, and the seen effect doesn't depend on the call. Probed with the token late (`token=late`): the call
  was out at the pause every time and went live during the runs or after them; both cases passed 3 of 3.

## What changes

- **The 503 answers slowly every time:** its body arrives 300 ms of real time after the release, so every run meets the
  order a loaded runner can bring.
- **The cases wait for that answer to be read before the clock moves.** The 503's `json()` notes when it is read
  (`window.seenAnswerRead`). From that read to the retry's `setTimeout` the client runs only promise steps, and a
  `page.evaluate` is a task of its own: once it sees the note, the retry is set, on the stopped clock, a second ahead.
  The assertions are unchanged.

## Checks (written first)

- `test: … (failing)`: the slow answer alone. Red for the right reason: the open case, «Expected: 2, Received: 1».
- The fix: green through the guard with `--repeat-each=20` on both cases, then the whole of `mentions.spec.ts`.

## Limits

- The pause is still a time read and then a pause a second later: a runner that stalls more than a second between two
  protocol calls would be refused again. Playwright has no «pause now»; a clock stopped from the page's load would stop
  TanStack Query's notifications (`setTimeout(…, 0)`) too.
- The close case runs 2.5 s of page time with the chat closed; on CI it takes 10-19 s against 5-10 s for the open case.
  Not chased here.
