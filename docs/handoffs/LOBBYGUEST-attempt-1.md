# Implementation-session handoff

Goal and attempt: the lobby's «$20» pass, the guest's side, attempt 1: a fixture page first, so it can be measured. Luis: «Arranca».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a Studio slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/studio/fixtures/join.html`, `apps/studio/fixtures/join.tsx`, `apps/studio/e2e/join.spec.ts`, `apps/studio/src/app/theme.css` (`.join-session`), `docs/plans/lobby-guest.md`, this handoff.
Runtime unit: the Studio (`apps/studio`) on its fixture pages; no API, database, worker or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `lobby/guest-fixture` from `main`, 2026-10-08
Ending commit/tree: `ca8db6268bf00f88dd13848500f62876151d76f4` (tree `b694546847e63b6e07b57b1090c340b1d463d6f3`), after the review's fixes (the room's session line kept, no member option, stronger checks). The commit after it adds only this handoff.

## Outcome

- `fixtures/join.html` + `join.tsx`: `JoinFlow` as it ships, signed in as a guest, the link's token in the fragment;
  its preview, knock, entry and room-token requests answered by the page; the call over `fake-livekit.ts`. Options:
  `state=`, `session=1`, `answer=`, `window.joinFixture.answer(…)` and `.asked`.
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
- Independent review: no P1; two P2s, fixed: the session rule was shared with the room's own session line (split, the
  room's line unchanged); the member option couldn't work without sign-in (dropped). Checks now reach the room's token,
  Ask again, and no way back when blocked: 31 passed with \`room-made.spec.ts\`.
- Next: merge on green CI with no Codex P1.
