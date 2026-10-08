# Implementation-session handoff

Goal and attempt: the lobby's «$20» pass, the guest's side, attempt 1: a fixture page first, so it can be measured. Luis: «Arranca».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/fixtures/join.html`, `apps/studio/fixtures/join.tsx`, `apps/studio/e2e/join.spec.ts`, `apps/studio/src/app/theme.css` (`.join-session`), `docs/plans/lobby-guest.md`, this handoff.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `lobby/guest-fixture` from `main`, 2026-10-08
Ending commit/tree: `831c347971a9fa4261712da868dd752eb0495ac5` (tree `691087d6202933e4455340502ff2df5fdeda2972`). The commit after it adds only this handoff.

## Outcome

- `fixtures/join.html` + `join.tsx`: `JoinFlow` as it ships, signed in as a guest, the link's token in the fragment;
  its preview, knock, entry and room-token requests answered by the page; the call over `fake-livekit.ts`. Options:
  `invite=member`, `state=`, `session=1`, `answer=`, `window.joinFixture.answer(…)` and `.asked`.
- `.join-session`: a sentence in the small sans, on one line where it fits.
- Note: `docs/plans/lobby-guest.md`.

## Evidence

- `e2e/join.spec.ts` 8 passed (the invitation, three closed links, the knock → wait → in, not this time, blocked, the
  session line); the old session line fails its check (the mutant).
- Captures at 1440 and 390 px: the invitation, the wait, in the room.
- Prettier, `oxlint --type-aware` (clean but `brand-assets.mjs`), `tsc`.

## Limitations and next action

- With the page in place, the guest side's own «$20» critique can be measured; it already reads as the Studio's
  (the light, one centred column), so only the session line changed here.
- Next: an independent review; merge on green CI with no Codex P1.
