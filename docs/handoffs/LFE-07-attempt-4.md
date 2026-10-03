# Implementation-session handoff: LFE-07, attempt 4 (LFE-07.2, slice 2: the card of a review that proposes a change)

- **Goal and attempt:** this is the second of three slices in the [design note](../plans/LFE-07.2-progress-review.md). It shows the result of a review that proposes a change, in four parts, with its evidence. It also takes the Codex P2 on #73.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/review-result` from main `05a472f`, 2026-10-03.
- **End:** content commit `09fc8f6`; its checks ran on it.
- **Writable scope:**
  - `planning/review.ts`, `ReviewResult.tsx` (new), `PlanBoard.tsx` and `board.css`;
  - the work fixture (`work-review.ts`) and its checks;
  - LFE-07's records.

  **No contract, schema or API changed.** Proposed for SCM-04, on `WorkPlan.last_review`:
  - `observations [{text, item_id | null, evidence {kind, observed_at, ref}}]`;
  - `interpretation` and `uncertainty`;
  - `intervention {text, decision_id | null, status: 'proposed' | 'sent_by_lead'}`.

## Outcome

- **A pill, not an interruption.** A review that proposes a change waits in the board's bar as "Review · a change proposed", in lavender, beside the decisions' pill. Any other end stays on the goal's line (PLAN-04). The card opened is that review, by its id, so a later review comes closed.
- **Its card takes the decisions' slot, one at a time.** Opening the card closes the decisions, and opening the decisions closes the card. The card reads in four labelled parts, each shown only when it has something to say:
  - **Observed:** each line is led by its evidence and how long ago that was observed, in mono ("Check · 6 min ago"), and ends with what the evidence was (the check run, the log read), shown, not only in a tooltip. A line about a task opens that task's sheet;
  - **Reading** and **Unsure**;
  - **Proposed:**
    - a proposal waiting on the viewer's own open decision says "Waits on your decision: answer it". It opens the decisions, with the focus on that decision's first choice;
    - one waiting on someone else's names them, with nothing to press;
    - one the lead already sent says so.
- **An earlier revision:** the card says "Reviewed r1 · the plan is now r2", and its proposal is read, not acted on.
- **Alignment:** the four parts start on one column, Observed's lines included, and a link sits where its words start. The first captures showed the list indented by the browser's default and the decision's link centred. Both are fixed and measured.
- **Focus:** the card takes the focus when opened. Escape or Close puts it away and gives the focus back to its pill. Closing it is the viewer's own view, not a receipt.
- **The Codex P2 on #73:** a finished review of an older revision now says so on the goal's line ("· of r1"), so the plan as it stands isn't taken as reviewed.
- **Fixture:**
  - `review=material` opens with such a review;
  - `material-old` opens with the same review of the previous revision;
  - `material-sent` opens with one whose proposal the lead already sent;
  - `workFixture.reviewAgain()` brings a later review.

## Evidence

- **Checks:** 12 browser checks (`review card ·`) and 3 more unit tests (`review.test.ts`, 11 in all).
- **Mutations, each killed:**
  - the card not taking the focus;
  - an out-of-date proposal still offered to act on;
  - the card opened without closing the decisions, and the decisions opened without closing the card;
  - Escape losing the focus;
  - the older revision unsaid on the ended line (unit);
  - the decision's link centred, and the Observed list indented. The alignment check measures where the words start, not the boxes; its first version measured boxes and let both through;
  - anyone offered to answer a decision;
  - the opened card surviving a later review;
  - the decision opened without the focus.

  One mutation survived: a guard that never mattered, since each opener already closes the other. It was removed.
- **Code review:** no P1. Its three P2s are fixed:
  - the decision's link showed to everyone, and for a decision already closed;
  - the card stayed open across a later review;
  - the evidence's ref only showed in a tooltip.

  Its P3s are fixed too:
  - a fixture and a check for a proposal the lead sent;
  - the Close button checked;
  - the phone check measures that the parts stack;
  - the board split under its line limit;
  - the design note's stale lines.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 666, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 330 of 330.
