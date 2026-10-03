# Implementation-session handoff: LFE-07, attempt 3 (LFE-07.2, slice 1: the progress review, said)

- **Goal and attempt:** LFE-07.2 says a progress review: asked, joined, awaiting, and how it ended. This is the first of three slices in the [design note](../plans/LFE-07.2-progress-review.md); the result card and Challenge come next.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/review-ask` from main `62bffd2`, 2026-10-03.
- **End:** content commit `d3e11f1`; its checks ran on it.
- **Writable scope:**
  - `planning/review.ts` (new), `PlanNext.tsx`, `plan.ts` (two optional fields), `board.css`;
  - the work fixture (`work-review.ts`, new), `fixture-api.ts` (a command route), and their checks;
  - the design note and LFE-07's records.

  **No contract, schema or API changed.**
  - Proposed for SCM-04: `WorkPlan.active_review` and `WorkPlan.last_review`.
  - The request's binding target is the contract's `requestProgressReview` (`POST /progress-reviews`, a pending `AcceptedJob` that coalesces reviews). The API doesn't implement it yet, so Request review still sends `GoalCommand.request_review`.

## Outcome

- **One button.** The goal's Request review already asks for a review, live, with its receipt and a retry under the same key. A first draft added a second "Review progress" on the board. It was dropped on Luis's choice, so nothing asks twice.
- **The goal's line says the review** after the plan's revision, quietly:
  - **running:** a pinging dot, still under reduced motion, and "The lead is reviewing · asked by you / Davide 3 min ago", or "· scheduled". A review of an older revision adds "· of r1";
  - **awaiting:** "Awaiting review: the project's allowance is spent. Davide can extend it.", in amber;
  - **ended:**
    - "Reviewed 12 min ago · no change";
    - "· not enough to tell until …";
    - "· a change proposed";
    - "The last review didn't finish".
  - No card and no announcement (PLAN-04).
- **PLAN-01:** asked while a review runs, it joins it at the lead (the fixture coalesces, as `requestProgressReview` will). The line still names that one review.
- **Fixture:** the page now answers a goal's command (`fixture-api`'s command route). `review=` picks how the lead answers.

## Evidence

- **Checks:** 9 browser checks (`review ·`) and 8 unit tests (`review.test.ts`).
- **Mutations, each killed:**
  - the older revision left unsaid (browser and unit);
  - a running review left unsaid;
  - the dot removed;
  - the fixture receipt with a command id that is not a UUID.
- **Design review:** the note's independent review found 4 P1s, all resolved:
  - the request is the existing command, since a second request shape was dropped;
  - a review of an older revision says so;
  - only those who can act ask, already true of Request review;
  - an unknown outcome is retried under the same key, already true of Request review.

  The work is split into three slices, and the bare `R` shortcut was dropped.
- **Code review:** no P1. Fixed:
  - **its P2s:**
    - a scheduled review seen with no viewer read "asked by you";
    - the contract's `requestProgressReview` is now named as the request's target, instead of a proposed join on `request_review`;
  - **its P3s:**
    - the fixture's receipt was refused by the client's validator. Its command id wasn't a UUID, so Request review said "Not confirmed". The check now asserts "Sent";
    - "You can extend it" for the allowance's owner;
    - the fixture API parses a command only where one is expected, and matches exact paths;
    - a review's own revision;
    - the reduced-motion check now has a control.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 663, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 300 of 300.
