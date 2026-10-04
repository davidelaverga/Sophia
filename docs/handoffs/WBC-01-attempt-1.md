# Implementation-session handoff: WBC-01, attempt 1 (Tasks ready for real work state)

- **Goal and attempt:** WBC-01, attempt 1. Parent scope: LFE-07.1, the shared LFE-06 controls and the interface parts of SCM-03/04.
- **Human owner / executor:** Davide, by the ownership amendment of 2026-10-03. Claude Code in the Claude desktop app, on Davide's Mac (darwin-arm64).
- **Coordination:** issue [#74](https://github.com/davidelaverga/Sophia/issues/74), under [policy v1.1](../coordination/WBC-01/policy/WBC-01_POLICY.md). Claude implements. Codex opens the PR (Davide's decision), reviews, app-tests and, on Davide's exact approval, releases the Studio.
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
- `pnpm test`: 1,150 tests: 1,136 pass, 0 fail, 14 skipped (as on the merge with main, before CC-0007's fixes), after merging main (#73, #77–#87, #32). On the baseline, the Studio's own unit tests were 423; they are now 620.
- `pnpm artifacts`: every identity reproduced for darwin-arm64, on the merge with #32 (CC-0007; CC-0008 to CC-0010 change no runtime path).
- `pnpm test:integration`: 84 tests, 82 pass, 2 skipped, 0 fail, on the merge with #32 (run after `pnpm artifacts`: before it, a stale bundle archive fails it).
- `pnpm --filter @sophia/studio run build`: passes, with Vite's existing large-chunk warning. Strings found only on the board (`Closed work`, `sophia.work.board.v1`, the new Stop copy) are absent from `dist/`. Its one "Simulated" is LiveKit's own code.
- `pnpm --filter @sophia/studio exec playwright test`: 346 of 346 pass, desktop and phone. That includes:
  - 26 `wbc ·` checks for the UI cases;
  - 7 `pre-push ·` checks for the pre-push review's findings;
  - 16 `codex · F-` checks for Codex's, F-004–F-012 included;
  - 6 `pr76 ·` checks for the PR #76 reviews' (one in `resources.spec.ts`);
  - Luis's 31 checks from #73 and #77–#80 (`review ·`, `review card ·`, `challenge ·`, `receipts ·`; one adapted to this branch's words), and 3 `review card ·` checks for the merges and F-006;
  - main's own suites since: #81's brand, #84's sign-in, #85–#87's opening and home, #32's report and voice chat.

  `e2e/work.spec.ts --repeat-each=2` passed before the reviews' fixes.
- **Mutations:** 108 in all. Each reverted one repair; all but one (R1b) made a check fail. Codex's findings are C1–C7, D1–D3, F1–F2f, I1–I7c, J1, K1–K2c and N1–N2d, the PR #76 reviews' E1–E3, G1–G2 and J2–J4, and the merges' H1–H6, all failing. The command retry handler's own guard sits behind a button that isn't rendered, so the UI can't check it. Ask again's guard is the pure `againOf`, unit-checked (F2).
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

None operational: no effect, job or deployment was started.

Pending:
- Davide's `CONTRACT_ACCEPTED`, or his changes, on WBC-01-CC-0001.
- Codex's verification of the fixes for F-011 and F-012 (WBC-01-CC-0010), and its `REVIEW_RESULT`.
- This session still can't push: Codex updates PR #76 from Claude's clone.
- Luis's optional feedback.

This session has no GitHub CLI or credential. CC-0001 and CC-0002 are posted on #74, and the branch pushed, by Codex or Davide, with the sender noted.

## Next bounded action

1. Codex fetches `lfe-07/workboard-readiness` from Claude's clone into its own worktree, then:
   - pushes it unchanged to PR #76, and updates the PR's body from `docs/coordination/WBC-01/PR_DESCRIPTION.md`;
   - posts CC-0010 on #74 for Claude, giving the head's full SHA.
2. Davide answers CC-0001.
3. Codex verifies the delta from `18471ee`, and sends `FINDING` records or a `REVIEW_RESULT`.
4. Claude repairs on this branch and answers with `FIX_READY`.
5. The release, if any, is Codex's `RELEASE_REQUEST` and Davide's approval.

WBC-02 then starts from the agreed contract.
