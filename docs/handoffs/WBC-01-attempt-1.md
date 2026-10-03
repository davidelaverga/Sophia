# Implementation-session handoff: WBC-01, attempt 1 (Tasks ready for real work state)

- **Goal and attempt:** WBC-01, attempt 1. Parent scope: LFE-07.1, the shared LFE-06 controls and the interface parts of SCM-03/04.
- **Human owner / executor:** Davide, by the ownership amendment of 2026-10-03. Claude Code in the Claude desktop app, on Davide's Mac (darwin-arm64).
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-07/workboard-readiness` from main `2542906` (#72), 2026-10-03.
- **End:** the branch head named in the PR; its checks ran on that head's code (the last commits are records only).
- **Writable scope:**
  - `apps/studio/src/features/work/` and `apps/studio/src/api/shape.ts`;
  - the shared `resources/SessionActs.tsx`, `resources/receipts.ts` and `resources/AwayLine.tsx`, with their Resources call sites;
  - the work and resources fixtures and their checks;
  - `CONTRIBUTING.md`'s two paragraphs on these checks;
  - the mission's records.

  **No contract, schema, OpenAPI, migration, runtime unit, prompt or deployment changed.**

## Outcome

The Tasks board reads a proposed `sophia.work.board.v1` view through one reader and shows:
- the accepted plan, with a proposed replacement beside it;
- each item's exact assignment;
- lanes by lifecycle and evidence, and Closed work;
- typed waits with their respondents;
- per-viewer commands;
- receipts in three dimensions;
- decisions bound to their work;
- results by exact version;
- Ask through a port of real chunks.

All on fixtures. See [progress](../progress/WBC-01.md) for the before/after table and the UI-01–UI-21 evidence.

**Not verified:**
- anything live: no service exists yet;
- an active call on the Tasks page (UI-20's call part);
- Codex's review and Luis's walkthrough review;
- Davide's agreement on WBC-01-CC-0001.

## Evidence

Each line names the command and its result, on darwin-arm64 with Node 24.21.0 and pnpm 11.7.0:

- `pnpm toolchain:check`, `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm contracts:check`: exit 0.
- `pnpm test`: 708 pass, 0 fail. On the baseline, the Studio's own unit tests were 423; they are now 471.
- `pnpm artifacts`: every identity reproduced for darwin-arm64.
- `pnpm test:integration`: 69 tests, 67 pass, 2 skipped, 0 fail.
- `pnpm --filter @sophia/studio run build`: passes, with Vite's existing large-chunk warning. Strings found only on the board (`Closed work`, `sophia.work.board.v1`, the new Stop copy) are absent from `dist/`. Its one "Simulated" is LiveKit's own code.
- `pnpm --filter @sophia/studio exec playwright test`: 176 of 176 pass, desktop and phone. That includes 25 `wbc ·` checks for the UI cases and 7 `review ·` checks for the review's findings. `e2e/work.spec.ts --repeat-each=2` passed before the review's fixes.
- **Mutations:** 37 in all. Each reverted one repair; 36 made a check fail.
  - The one that doesn't is the per-task key of the Stop question. It is redundant by design: the scope key inside it already includes the work. Removing both keys fails the J check.
  - Four first passed and showed a gap in a test. Each now fails with the gap closed:
    - the same attempt at an older generation;
    - a late receipt after delivery;
    - a bare fixture import;
    - the lens resetting for another viewer.
  - One more found a phone layout regression: "For you" broke onto two lines once Open became Unassigned. It is fixed, and its check counts the label's lines.
  - The list is in the progress record and the PR.
- **Independent review:** one review of the whole diff at `f736ad7` by a separate reviewer, before the push. It found 3 P1, 3 P2 and 7 P3. All are fixed but one P3, which is kept by choice; see the [progress](../progress/WBC-01.md#independent-review-before-the-push). Codex's review of the exact head is still to come.

## Decisions and changes

- **The ownership amendment applied:** Davide owns the implementation, Luis reviews design. The packet's scope is unchanged.
- **Ownership of the new code:** the shared reader and receipt fold live beside their callers. `api/shape.ts` and `resources/receipts.ts` keep Resources from importing Work.
- **The v1 fixture plan** was converted once, by hand, into explicit v2 data (the progress table). There is no runtime adapter.
- **#73** is not edited; its overlap and the semantic note for its rebase are in the progress record. **#32's** artifacts feature is not touched.

## Remaining obligations

None operational: no effect, job or deployment was started. Two reviews are pending: Codex's on the exact commit, and Luis's on the walkthroughs. Davide's contract agreement is also pending. No GitHub CLI or API credential exists in this session. Posting WBC-01-CC-0001 to a coordination issue and opening the PR needs Davide, or a session with access.

## Next bounded action

1. Davide agrees or amends WBC-01-CC-0001, and opens the coordination issue and the PR, or authorizes a session to.
2. Codex reviews the exact head.
3. Luis reviews the walkthroughs.
4. Then WBC-02 starts from the agreed contract.
