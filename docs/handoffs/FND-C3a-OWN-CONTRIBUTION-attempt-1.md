# Implementation-session handoff

Goal and attempt: FND-C3a-OWN-CONTRIBUTION, attempt 1 (#365 section 4; `Refs #365 — section 4`)
Human owner / executor resource: Davide; lane C (Claude). Coordination by P, verification by V, combined integration by B.
Native session: Claude Code desktop session (this conversation); no native runtime session.
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-message-acts`, branch
`api/contribution-revisions-20261016`, from sealed C2b `6d4585a304617b4bbb9eb6b63317e1633776ef06` (tree
`ca645f23bd18e3ac67d19aa185c4875853396c2a`).
Ending commit/tree and changed files: implementation `f73ec7e6e94eefaa2571353275cf94f6a02aa5b7` (tree
`d5e1f21d2e6cb6d2cefb1fccacd2b46645cc122a`); this handoff follows it. Draft PR #396 (base `api/updates-20261016`).

## Outcome

The author of a live room message can now correct it or withdraw it.

- **Who may act.** Only the author, as an active member. A viewer may act on their own talk. Nobody may act on another
  person's message.
- **What a message may do** comes from its kept submit:
  - a written message can be corrected (same id, author and time; revision +1) or withdrawn;
  - a message that shares a source can only be withdrawn, which detaches it.
- **Erasing.** Correcting, or withdrawing a written message, erases the old words. The research that read them is
  revoked and rebuilt on the same allowance, and the designs that read them are revoked. This sits behind a signed
  preview of that reach, rechecked under the project and message locks.
- **Identical words** change nothing.
- **Erased digests.** Digests of erased words are redacted, and a retry of them gives `request_erased`.
- **Old readers** without `revisions=1` keep the exact prior DTO.
- **Studio.** The UI sits behind `VITE_SOPHIA_MESSAGE_ACTS`.

Missing or unverified:

- **Browser spec.** `e2e/message-acts.spec.ts` (8 cases) is written but not run: P has not assigned the browser slot.
- **CI** on #396 was pending at the time of writing.
- **Automatic review.** The review requested on `f73ec7e6` was pending.
- **Not deployed.** Nothing is deployed, and the flag is off everywhere but the fixture pages.

## Evidence

All on a local PostgreSQL 17.11 (V's recipe, port 55498):

- `apps/api/src/contribution-acts.db.test.ts` 8/8 (real signed API, generated parsers);
- `packages/persistence/src/research.db.test.ts` 0068 cases 3/3, and `apps/api/src/design.db.test.ts` 0068 case 1/1;
- `apps/api/src/media.db.test.ts` 16/16, including the voice context rebuilt with current words only;
- the readiness, access, api, profile and runtime suites, with the above, 114/114;
- a mutation check: without the redaction or the reach comparison, the leak test, the proof test and the research
  reach-drift case fail.

Fast checks: `pnpm lint`, `pnpm typecheck`, `pnpm contracts:check` and `pnpm format:check` are clean, and `pnpm test`
gives 2359 pass, 0 fail. Studio unit tests (`message-acts.test.ts`) give 10/10. No model, provider, voice or
production call was made.

## Decisions and changes

The source policy is P's `decision-C3a-source-policy.json`: an erasing correction behind the existing signed
preview. It is not Davide's operational approval. The namespace is P's rev4: `0068`, `A36`. A36's generated outputs
were produced after B released the generation slot (B2 phase 1, #393).

What changed:

- **0068**, `submit_contribution`'s retries included;
- **routes** in `apps/api/src/routes/contribution-acts.ts`, and the opt-in in `routes/projections.ts`;
- **persistence** in `contribution-acts.ts`, plus the readers in `native-tasks.ts` and `snapshot.ts`;
- **Studio:** `MessageActions.tsx`, `message-acts.ts`, `api/message-acts.ts`, `app/message-acts.ts`, the hook in
  `Conversation.tsx` and `EarlierDiscussion.tsx`, the fixtures and the spec.

What was preserved: the exact legacy DTO, Luis's UI (only the hook was added), and every CON table and function
(untouched).

Shared files, declared:

- `app.ts`, `projections.ts`, `sanitize.ts`;
- persistence `index.ts`, `native-tasks.ts`, `snapshot.ts`;
- contracts `generate-validators.ts`, `validate.ts` and the generated outputs;
- Studio `client.ts`, `theme.css`, `vite-env.d.ts`, `Conversation.tsx` (overlaps #384), `EarlierDiscussion.tsx`;
- fixtures `data.ts`, `fixture-api.ts`, `room.tsx`, `vite.fixtures.config.ts`.

## Remaining obligations

- **Browser slot.** P assigns the slot; then C runs `e2e/message-acts.spec.ts`.
- **Review and CI.** Read the automatic review and CI on #396, with at most two consolidated repair exchanges.
- **Deploy.** V deploys 0068 and the routes; only then is `VITE_SOPHIA_MESSAGE_ACTS=1` set.
- **CON gap (B).**
  - 0063/A33 have no correction or revision.
  - `sophia.contributions` gains `revision`, `state`, `corrected_at` and `withdrawn_at`, and `DISCUSSION_PAGE`
    changes.
  - B reconciles CON readers, withdrawal fences and the Q13 pins.
- **Known limits** (docs/plans/message-acts.md):
  - an earlier page read before another tab's act shows its old state until it is read again;
  - `draft_brief` admission still accepts a withdrawn shared message's id.

## Repair exchange 1 (FND-C3a-BROWSER-01 and FND-C3a-REVIEW-R1)

The evidence below is for the commit that carries this section: source, tests and docs together, with nothing changed
after the runs.

- **Browser** (P granted the headless local slot). Chromium ran through Playwright with `CI=1`, so no foreign server
  was reused. Loopback ports 5199 and 5198 were verified free before every run and released after.
- **Three findings in the first browser run, all kept in the logs:**
  - Escape in the edit field closed the chat panel. It is now spent in the field and in the question.
  - Re-sorting the snapshot window broke `room-chat-replies` «the failure stays put» (3/3 on this branch, 3/3 passing
    on base 6d4585a3 in a scratch worktree). The window keeps the API's order, and tombstones go in their place.
  - The lost-reply case for a withdrawal was unreachable: the withdrawal had landed, and the next read showed its place
    with the question gone, which is the honest outcome. The same-key retry is now exercised on a correction, whose
    message stays.
- **V, P1: cross-reference leak.** Reproduced through the signed API: a live message sharing a source whose words
  were then corrected away answered its replay 202 with the erased hash. Now `request_erased`, with no erased hash
  kept in any contribution or served in any read. Detach-only and the sharer's own words are kept.
- **Codex 4296199485, P1: cancelling an act in flight.** Reproduced with a held fixture request on f73ec7e6's UI:
  both new browser cases fail there. Now Cancel and Escape do nothing while an act is under way, and a lost answer
  can only be asked again with its key.
- **Codex 4296199503, P2: more than 100 tasks reached.** Reproduced with 101 running research tasks on a local
  database: the generated parser refused the preview. A36's reach arrays are no longer bounded at 100, in the preview
  or in either act. The signed proof still binds every task, and leaving one out is stale. Regenerated under C's
  retained slot.
- **Codex 4296199494: the handoff.** This file; its evidence is bound here.
- **Results:**
  - API suites (contribution-acts 10/10, readiness, access, api, profile, runtime, media): 116/116.
  - The 0068 research and design cases: 4/4.
  - Browser: `message-acts.spec.ts` 14/14, run twice. With the nearby reader specs (discussion-earlier,
    room-discussion, chat-times, message-links, room-chat-replies), 47 of 48 passed before the forced-click test fix;
    that case then passed in the repeated run.
  - Lint, format, typecheck and contracts are clean; units give 2359 pass, 0 fail.

## Next bounded action

After CI, the automatic review and the browser slot, write the bounded C3a handback. C3b (0069/A37 mentions) does not
start until P sends its packet.
