# Implementation-session handoff

Goal and attempt: Sophia walks through the report she shows (`docs/plans/room-walk.md`), attempt 1. It is PR 16 of the room's $20 plan, behind the vision flag (A14, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/walk` on `room/search` (#121), 2026-10-06
Ending commit/tree: the content commit «Room: Sophia walks through the report she shows (A14 on the fixture, behind the vision flag)», the parent of this handoff's commit.

## Outcome

While a shown report is on someone's stage (they show it, or they follow it), the room's focus is read as it moves (A14's proposed `GET /rooms/{roomId}/focus`). When Sophia moves the focus to a section:
- the report scrolls there;
- the section index marks it;
- «Sophia is in X.» is said;
- nobody's focus moves.

Whoever doesn't follow sees nothing move and reads nothing.

**Following:**
- It stays bound to the focus's revision, as in #110.
- Her move carries it over only when the read says the move is hers, in the same showing (`shownAt`). A member showing it again, even in one snapshot with her walk, asks again.
- While the read is pending or failed, the report stays on the stage.
- Without the flag, nothing changes from #110.

**API proposals (#105):** `sharedFocus` will carry `anchor`, `by` and `shownAt`. Until it does, the GET returns them.

**Independent review, four passes:**
- **First pass:** one P1 and two P2s:
  - (P1) following bound to version and guide re-armed itself, and survived a stop and show again;
  - the status line sat in the wrong grid row;
  - a stale anchor was replayed from the placeholder.
- **Second pass:** one P1 and two P2s:
  - (P1) a refused carry left the follow armed;
  - the report flashed off the stage on each move;
  - a failed read dropped the follower.
- **Third pass:** one P1 and one P2:
  - (P1) the carry wasn't fenced by the flag;
  - the design note was out of date.
- **All of the above are fixed.** Also fixed: each move scrolls once, keyed by its revision; `retry: 1`; the identity in the query key.
- **Fourth pass:** no P1 or P2.

## Evidence

Runs used the guards' gentle mode, beside Luis's games at Idle priority, on his word.

- **Units:** `present-view.test.ts`, 8 of 8.
- **Browser:**
  - `room-walk.spec.ts`, 5 checks;
  - with `room-present` and `room-voice-trail`: 27 of 27, then 20 of 20 after the last fix.
- **Mutations** (`light_mutants.py`): 7 of 8 killed, and the control survives. The killed ones:
  - no scroll;
  - the voice mark only;
  - nothing said;
  - the read for a non-follower;
  - her move ending following;
  - a refused carry keeping the follow;
  - the report leaving the stage while her move is read.
- **The survivor:** «a member's show again carries» survives in the browser because `shownAt` refuses it too. The unit test kills it.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** A14's amendment (`anchor`, `by`, `shownAt` on `sharedFocus`), the GET until then, and the bridge's `present_section`.
- **This PR** awaits #121, CI and Codex.

## Next bounded action

«N following» on the shower's card (LiveKit participant attributes).
