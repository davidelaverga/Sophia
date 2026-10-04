# Implementation-session handoff: sign-in, attempt 2 (Codex's P2s on #82)

- **Goal and attempt:** this attempt fixes Codex's three P2s on #82 (the sign-in's frictions), all on Send again.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `signin/resend-p2s`, stacked on `signin/frictions` (#82), 2026-10-04.
- **End:** content commit `1056f71`; its checks ran on it.
- **Writable scope:** `SignIn.tsx`, `auth-words.ts` (`waitAfter`), `theme.css`, the sign-in fixture and its checks. **No contract changed.**

## Outcome

- **A refusal that gives no wait still waits.** The hour's cap ("Too many emails…") came with no seconds, so Send again was back at once and repeated a refused request. A refusal now waits as long as it says. When it says too many and gives no time, it waits Auth's 60 s window. Anything else, such as a lost connection, can be tried again at once (`waitAfter`).
- **A send again that never answers ends.** Supabase's call has no limit of its own, so a stalled one left "Sending…" up for good. After 30 s it is said as not confirmed ("the email may still arrive. Wait for it, then send again.") and it waits the window.
- **A failure reads as one.** It shows in the screen's error colour (`--rose`), on the same status node, so its words still change in place for a screen reader.

## Evidence

- **Tests first:** 2 browser checks failed on #82's code, each for its reason:
  - with `limit=hour`, the button came back at once and the failure was grey;
  - with `stall=1`, the page stayed at "Sending…".

  1 unit test covers `waitAfter`.
- **Mutations, each killed:**
  - the send without its limit;
  - the refusal without its wait;
  - after the review, a 1 s wait instead of the window: both checks fail.
- **Independent review:** no P1 or P2. Its P3s are taken:
  - the checks assert the whole 60 s, not any wait;
  - the unit test builds its sentences with `sendFailure` itself;
  - a parameter no longer shadows `window`.

  Noted for later: a timed-out send isn't aborted (Supabase's call takes no signal), and the first email's send has no time limit yet.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm contracts:check` and the Studio's build pass. `pnpm test`: 677, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 386 of 386 before the review's P3s; `signin.spec.ts --repeat-each=2` after them: 26 of 26.
