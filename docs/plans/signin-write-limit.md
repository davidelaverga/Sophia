# Sign-in: «Send again» waits a write's 90 s

> 2026-10-08 · Luis: «Sigue con lo siguiente de la cola». The follow-up Codex asked for on #83 (P2): a send again is a
> write, and the Studio's writes wait 90 s (`CONTRIBUTING.md`, «No wait is endless»). No API change.

## What is wrong

- «Send again» says «Not confirmed» after 30 s, the limit for a read. A hosted Auth that is slow to wake can take longer,
  and the call is not aborted: the email may go out after the screen said it didn't, and a second send then voids the
  link the first one carried.

## What changes

- A send again waits `WRITE_TIMEOUT_MS` (90 s), the same limit as every write in the Studio, before it says «Not
  confirmed». Once the send has lasted six seconds it says the wait is long, as every long wait in the Studio does
  (`useSlow`, `SLOW_NOTE`). Nothing else changes: the countdown, the words, the window after it.

## Checks (written first)

- A send again that never answers still says «Sending…» at 30 s, with the long wait's line, and «Not confirmed» once
  90 s have passed
  (`signin.spec.ts`).
