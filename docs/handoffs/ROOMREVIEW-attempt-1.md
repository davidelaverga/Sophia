# Implementation-session handoff

Goal and attempt: approve a version, or ask for changes (`docs/plans/room-review.md`), attempt 1. It is PR 18 of the room's $20 plan, behind the vision flag (a proposed A16, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/review` on `room/following` (#123), 2026-10-06
Ending commit/tree: the content commit «Room: approve a version, or ask for changes (A16 on the fixture, behind the vision flag)», the parent of this handoff's commit.

## Outcome

A review row under the report pane's head, for the version on screen (`ReviewRow.tsx`), mounted once per version.
- **Editors and admins:** they approve, or ask for changes in words. After a review, the other choice stays.
- **Every member:** sees the latest review, read again as the feed moves.
- **«Sophia is revising»:** said only on the newest version. Her next version arrives live (#109).
- **Writes:**
  - one key per press, and a recorded review moves the focus to the row's words;
  - with no reply, only «Try again» is offered, and only its own record arriving settles it;
  - Cancel keeps the words.

**API (proposed as A16, [posted to #105](https://github.com/davidelaverga/Sophia/issues/105#issuecomment-6010589410)):** POST and GET `/artifacts/{id}/versions/{vid}/reviews`. A request for changes admits Sophia's revision.

**Independent review, four passes:**
- **First pass:** two P1s and seven P2s.
  - **P1s:**
    - «Not sent» stayed after the review landed;
    - the write state and its key crossed versions.
  - **P2s:**
    - a different intent resent the old one;
    - Cancel lost the words;
    - a stale empty-words message;
    - a placeholder from another version;
    - focus lost;
    - «revising» shown forever;
    - the first review locked the version.
  - All of them are fixed.
- **Second pass:** one P1 (an effect on `useAdmission`'s unstable `reset` looped and wiped the write state) and one P2 (Try again lost focus). Both are fixed: a render-phase guard, and «Try again» kept mounted while it is sent.
- **Third pass:** one P2 (another member's review settled my lost press). Fixed by settling only on a newly arrived review of mine with its verdict.
- **Fourth pass:** no P1 or P2. Its P3, showing the latest review beside «Not sent», is left.

## Evidence

Runs used the guards' gentle mode, beside Luis's games at Idle priority, on his word.

- **Browser:**
  - `room-review.spec.ts`: 9 of 9;
  - with live-version and report, all pass.
- **Mutations** (`light_mutants.py`): 10 of 10 killed, and the control survives. The mutants:
  - a viewer given the buttons;
  - Approve staying after approving;
  - changes sent without words;
  - no reply offering the old buttons;
  - another member settling my lost press;
  - my own record never settling it;
  - the reviews not read as the feed moves;
  - Cancel losing the words;
  - the focus lost after a review;
  - one row for every version.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** A16's routes and shapes (#105).
- **This PR** awaits #122 and #123, CI and Codex.

## Next bounded action

A passage to a task, on the fixture behind the flag.
