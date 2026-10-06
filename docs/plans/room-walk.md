# Room: Sophia walks through the report she shows

> 2026-10-06 · Luis · PR 16 of the room's $20 plan, behind the vision flag (A14, issue #105) · "Construye todo y lo que no tenemos para api que se haga por fixtures"

## The gap, measured

A shown report already sits on the stage (#110), and Sophia's words light up in it (#111). But when she talks a report through, the people following it scroll by themselves, looking for where she is. A14 gives her `present_section(anchor)`: she moves the room's focus to a section before she speaks about it. Nothing in the Studio follows that move yet.

## What changes

**Under the vision flag, while a report is on someone's stage** (they show it, or they follow it), the room's focus is read again each time it moves: A14's `GET /rooms/{roomId}/focus`, keyed by `sharedFocus.revision`.

When Sophia moves the focus to a section:
- **The report scrolls there.** The section's heading comes to the top of the report.
- **The section index marks it.** It is the same mark her voice puts there (#111). While she is placed, the placement wins over the voice match.
- **A status line says so:** «Sophia is in Recommendations.», announced once per move.
- **The focus stays where the person is:** nobody's place in a field or a button is taken.

**Who sees nothing move:** whoever doesn't follow the report. Their card is unchanged, and the focus is not read for them. This is A14's acceptance: «A viewer who doesn't follow sees nothing move».

**A member's own move** is not acted on: only Sophia walks.

**Following outlasts her moves, and nothing else.** Following stays bound to the focus's revision (#110), so any change asks again. Her move raises that revision, though, so the move alone would end it.

When the focus moves on within what is followed (same member, same version), the report stays on the stage while the read for the new revision comes:
- **The read says Sophia moved it, in the same showing:** following carries over to the new revision. «Same showing» means it began no later than the follow (`shownAt`), so a member's show again, even in one snapshot with her walk, is no walk.
- **The read says anything else:** following ends, and the card asks again.
- **The read fails:** the report stays, without her mark. That is the conservative choice for a proposed read.

Without the vision flag nothing is read, so any change asks again, as before.

**API (proposed, written to #105):**
- The snapshot's `sharedFocus` will carry `anchor`, `by` and `shownAt` (amendment A14). `shownAt` is the revision the current showing began at; Sophia's moves don't change it.
- Until the snapshot carries them, the Studio reads them from `GET /rooms/{roomId}/focus`. It returns the same shape as the PUT's receipt, plus `by` and `shownAt`. A repeated heading is named by its occurrence (`evidence#1`), as search names it (#121).

**Fixture:** `window.fixture.sophiaWalks(anchor)` moves the focus as Sophia, at the room's next revision, and the feed carries it.

## Out of scope

- «N following» on the shower's card: the next PR (LiveKit participant attributes).
- Sophia's bridge tools (`present_section`, `read_report_section`): the runtime, A14's L part.

## Checks (written first)

- **Browser** (`e2e/room-walk.spec.ts`):
  - showing a report, Sophia's move brings Recommendations to the top, marks it, says it, and leaves the focus where it was;
  - following someone else's report, the same;
  - following someone else's report: the moves are followed, and the report stays the same element across them (no round trip off the stage);
  - a member showing it again asks to follow again, and a walk after that re-arms nothing;
  - not following, nothing moves, and the focus is not read.
- **Units** (`present-view.test.ts`): what is followed, and what carries over (Sophia's move in the same showing) or asks again (a member's change, an earlier answer, a showing begun after the follow).
