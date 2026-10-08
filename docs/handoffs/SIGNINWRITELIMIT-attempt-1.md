# Implementation-session handoff

Goal and attempt: sign-in, «Send again» waits a write's 90 s, the follow-up Codex asked for on #83 (P2), attempt 1.
Luis: «Sigue con lo siguiente de la cola».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a follow-up from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/e2e/signin.spec.ts`, `apps/studio/src/app/SignIn.tsx`, `docs/plans/signin-write-limit.md`, and this handoff.
Runtime unit: the Studio (`apps/studio`), its sign-in screen; no API, Auth configuration, database or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-chain`, branch `signin/write-limit` from `main` (`a5bf6ad0`), 2026-10-08
Ending commit/tree: `07254a906dab557bb08ecf0d4c1555dd311e2640` (tree `dd99bf1ba25fe6f5ef3d2caf57b2280a3ba05d12`). The commit after it adds only this handoff.

## Outcome

Design note: `docs/plans/signin-write-limit.md`.

- «Send again» waits `WRITE_TIMEOUT_MS` (90 s), as every write in the Studio, before it says «Not confirmed»; it
  said so at 30 s, a read's limit, while the email could still go out.
- Once the send has lasted six seconds, it says the wait is long (`useSlow`, `SLOW_NOTE`).

## Evidence

- `e2e/signin.spec.ts`: a send again that never answers says «Sending…» with the long wait's line at 31 s and «Not
  confirmed» at 91 s. Run locally under the guard (gentle, one worker): 17 passed.
- Control mutant: the 30 s limit back; the check fails at 31 s.
- Prettier, `oxlint --type-aware` on the whole repo, `tsc`.
- Independent review: no P1 or P2; its P3s taken (the long wait's line; the reason in honest words: a send is a write,
  not a call that wakes a paused Supabase).

## Limitations and next action

- Found by the review, not changed here: the first «Email me a link», the code's verification and an invited sign-in
  await Supabase with no limit at all; a hung Auth leaves them on «Sending…» until a reload. A follow-up, on Luis's
  word.
- Next: merge on green CI with no Codex P1, and reply on #83's thread with this PR.
