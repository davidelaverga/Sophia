# Implementation-session handoff

Goal and attempt: follow-ups to #122 and #123, the walk and following (`docs/plans/room-follow-ups-4.md`), attempt 1. It is PR 21 of the room's $20 plan, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/follow-ups-4` on `room/follow-ups-3` (#126), 2026-10-06
Ending commit/tree: the content commit «Room: follow-ups to #122 and #123, the walk and following», the parent of this handoff's commit.

## Outcome

Codex's P2s on #122 and #123:
- **Following after a reconnect:** a client back from a drop says its own («nothing» too), asks the members theirs (`{ ask: true }`), and forgets what it heard until they answer. An ask is answered to the asker only. All of it only under the vision flag.
- **The stage going says «nothing»:** for another view, and for home or Personal with the call on (`background`).
- **The fixture:** each connection starts afresh (`said`), and the room fixture passes `background` as App.tsx does.
- **Sophia's walk reaches every heading:** an H3 or H4 included (`walkTarget`), marking the section it lies in.
- **Each move is drawn anew:** the status's words are keyed by the focus revision.

**Independent review:**
- **Two P2s, both fixed:**
  - a follower who went home with the call on was still counted;
  - the resync ran without the flag.
- **P3s fixed:**
  - a walk with no section above it no longer yields to her words;
  - the span test checks its mark.
- **P3s left:**
  - the keyed span is a guard the fixture can't prove: between two moves the focus read already blanks the status, so its mutant survives;
  - the rejoin test has two paths;
  - `walkTarget` is recomputed per render (cheap).

## Evidence

Runs used the guards' gentle mode, at Idle priority beside Luis's games, on his word.

- **Browser:**
  - `room-walk`, `room-following`, `room-present`, `room` and `room-so-far`: all pass;
  - the specs that go away and come back (`report`, `room-following`, `room-passage`) with walk: 69 of 69.
- **Units** (`following-signal.test.ts`, `voice-trail.test.ts`): 23 of 23.
- **Mutations:**
  - **Units:** 8 of 8 killed, and the control survives:
    - nobody asked;
    - what was heard kept;
    - «nothing» not said again;
    - an ask answered to all;
    - a subsection marking itself;
    - only the index walked;
    - the resync without the flag;
    - an ask answered without it.
  - **Browser:** 3 of 4 killed, and the control survives:
    - the stage going still following;
    - the fake connection remembering;
    - out of sight still following.
    - The keyed span survives, as said above.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- The search and recap P2s of #121, and the plans that said «written to #105»: the next follow-ups PR.
- This PR awaits #126, CI and Codex.

## Next bounded action

Follow-ups to #121 and the docs, then Davide's chapter 5 (Return) on the fixture.
