# Implementation-session handoff

Goal and attempt: the sign-in send-again checks fit Playwright's 30 s on a busy runner, attempt 1. Found failing CI twice on other PRs (a 30 s timeout) while it passes locally and on its own PR; Luis:
«Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a test fix named in «Goal and attempt».
Writable scope: `apps/studio/e2e/signin.spec.ts` and this handoff.
Runtime unit: none: an end-to-end check of the Studio (`apps/studio`); nothing the Studio builds changes.
Existing authority: Luis's instruction in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no CI change.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `test/signin-slow` from `main`, 2026-10-08
Ending commit/tree: `a26e7473ebc1b46b8c8895ce6351dedfdb449762` (tree `55228abdb0e65c0c9443bea356d5d2366c92c4ae`). The commit after it adds only this handoff.

## Outcome

- «a send again that never answers…» timed out at 30 s on CI (22 s on a normal run there). Its time went on frames: it
  runs 4.4 s of held clock (`runFor`), and the sign-in page draws Sophia's light on every frame, about 55 ms each on
  CI's software GL. Its three send-again siblings ran at 17–19 s of 30 s on the same busy runner.
- `sendHeld`, which only the four send-again checks use, now puts the light away first (`.light { display: none }`): a
  box with no size asks for no frames. None of them reads the light; the checks that do (`held` alone) are unchanged.
- A first version marked the one check `test.slow()`; the review showed the cause and a fix for all four, so it went.

## Evidence

- The sign-in file under the gentle guard (1 worker): 17 passed.
- The four send-again checks, `--repeat-each=3`: 12 passed, 0.55–0.65 s each; the never-answering one was about 3.6 s.
- Prettier, `oxlint --type-aware` on the whole repo.
- Independent review (of the `test.slow()` version, with CI's logs): no P1 or P2, no product bug behind the timeout (no
  remount; the 90 s limit and the countdown don't interact). Its P3s taken: the cheaper fix for all four checks, and
  the comment's overstatement (the `fastForward`s run no frames) gone with `test.slow()`.

## Limitations and next action

- Next: merge on green CI with no Codex P1.
