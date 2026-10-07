# Implementation-session handoff

Goal and attempt: what was carried in from Personal (`docs/plans/project-carried-in.md`), attempt 1. It is Davide's vision, chapter 1, the project's side, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/carried-in` on `personal/carry-package` (#131), 2026-10-06
Ending commit/tree: two commits on `personal/carried-in`, read one by one (a merge ref or a squash folds them into one): `5af8fcc` «Project: what was carried in from Personal (Davide's chapter 1)», the content, on `main` `7979251` once #131 merged (`1e570eb`, `c6909c1` before), then this handoff's own commit.

## Outcome

«Carried in from Personal» in Knowledge, under its head and filters, shown with this project's reports:
- what members carried to the project, newest first (the API gives them oldest first);
- the words exactly as carried, with who and when: «Marco, from their Personal · Oct 6», and «You, from your Personal» for mine;
- nothing else of anyone's Personal.

**The states:**
- empty: says so;
- a failed first read: says so, with Try again;
- a failed later read: keeps what was read and says it may be out of date.

**Data:** it is read from the existing `GET /api/v1/projects` (each project's releases), so it needs no new API.

**Independent review:**
- **Two P2s, both fixed:**
  - the block sat above Knowledge's own title and ignored its filter;
  - the newest-first order was untested, because the fixture came pre-sorted.
- **P3s fixed:**
  - stale data after a failed read now says so;
  - the year shows when it isn't this one;
  - long names wrap;
  - the list's duplicate label is gone;
  - the Try again test presses the button for real.
- **P3s left:**
  - no live refresh from the carry and take-back project events;
  - two caches for `GET /api/v1/projects`;
  - the project list's caps could hide releases in very large accounts.

## Evidence

- **Browser:** `project-carried-in.spec.ts`, 3 of 3, run alone with the guard at its default floors (a game was open).
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.
- **Mutations: 5 of 5 killed, and the control survives.** The first loop was stopped when the machine froze at 12:53 beside two games, with the guard's RAM floor lowered (see `.claude-guards/README.md`). On Luis's word they waited for a free machine, and ran there under the guard at its default floor:
  - oldest first;
  - mine not said as yours;
  - a failed read said empty;
  - another project's notes;
  - shown with all projects.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex (#131 merged).

## Next bounded action

Davide's chapter 2, Conversations.
