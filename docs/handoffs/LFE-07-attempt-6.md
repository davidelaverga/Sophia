# Implementation-session handoff: LFE-07, attempt 6 (LFE-07.2, slice 3: Challenge)

- **Goal and attempt:** this is the last of the three slices in the [design note](../plans/LFE-07.2-progress-review.md): a way to challenge a review that proposes a change. It also takes the Codex P2 on #78.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/review-challenge`, stacked on `lfe-07/card-p2s` (#78), 2026-10-04.
- **End:** content commit `c603ee2`; its checks ran on it.
- **Writable scope:**
  - `challenges.ts`, `ReviewChallenge.tsx` and `page-memory.ts` (new);
  - `answers.ts`, `ReviewResult.tsx`, `PlanBoard.tsx` and `board.css`;
  - the work fixture and its checks;
  - the design note and LFE-07's records.

  **No contract changed.** Proposed for SCM-04: a challenge is a coordination command:
  - `kind: 'context_update'`;
  - `delivery: 'next_eligible_episode'`;
  - `caused_by_command_id`: the review's command;
  - `content_ref`: the reason.

## Outcome

- **Challenge.** At the foot of the review's card, a quiet "Challenge" opens one line ("Why doesn't this hold?") and its Send, in the guidance field's style. The line takes the focus.
  - It tells the lead why the proposal doesn't hold, as context for its next review. It undoes nothing.
  - Only someone who can act on the work sees it (`onChallenge` is absent otherwise), and only on a review of the plan's current revision.
- **Receipts**, said where it was asked:
  - "Sending your challenge…";
  - "Sent to the lead, for its next review.", with the reason quoted under it;
  - not confirmed: "Not confirmed. Sending again repeats the same request." Send again uses the same key and the same words. The line is read-only once sent. A reload starts afresh;
  - refused: "Only editors and admins can challenge a review."
- **Kept while the page lives, by review and viewer** (`challenges.ts`): the draft, the key and the receipt. Closing the card loses nothing, and the line opens by itself when something was written. Escape in the line closes the line and keeps the card.
- **One memory for the page:** `page-memory.ts` now holds what a view keeps across its mounts. The decisions' answers (`answers.ts`) use it too, with nothing else changed.
- **The Codex P2 on #78:** a decision the server already marked `expired` was left out with the open ones, so the card said nothing. The card now reads the decision from the plan. Expired by its date or by its state, it says "expired"; a decision already answered waits on no one.
- **Fixture:**
  - `challenge=unknown | denied` sets the answer, recorded by default;
  - `workFixture.challenges` lists what was sent;
  - `editor=0` means no Challenge;
  - `expired=state` marks the decision expired.

## Evidence

- **Checks:** 5 browser checks (`challenge ·`), the expired check extended to the server's state, and 3 unit tests (`challenges.test.ts`).
- **Mutations, each killed:**
  - a new key on sending again;
  - the words editable after sending;
  - Escape in the line closing the card;
  - a draft hidden on reopening;
  - Challenge on a review of an earlier revision;
  - the #78 P2: main's lookup failed the expired check;
  - after the review: the focus dropped on Send, on the receipt and on Escape, and a refusal left the line frozen.
- **Code review:** no P1. Its two P2s are fixed:
  - the focus fell to the page when the line closed, while sending, and once settled. It now goes back to Challenge, stays in the line, and moves to the receipt;
  - a refusal left the line frozen, a dead end. Now only its receipt and words stay, as when recorded.

  Its P3s are fixed too:
  - sending reads the memory as it is now;
  - the receipts promise less;
  - the checks assert the retry's two sends and the refusal's empty line.

  Noted, not changed:
  - a status mounted already full may not be announced by some screen readers. The decisions use the same pattern, so it is a change for both, later;
  - in the real app, Challenge is gated by `canAct` only once the board is wired to the API. Today only the fixture wires it (`editor=0`).
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 669, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 346 of 346.
