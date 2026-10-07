# Implementation-session handoff

Goal and attempt: WBC-02 (SCM-01), the combined integration of #107 with the accepted #117 (SDD-01 Design) and #119 (the Paperclip image's CI), and with main; then the findings of Codex's automatic reviews of the combined head and of the fix. Attempt 1: plan WBC-02-CC-0043 to CC-0046, transfers CC-0047 and CC-0048, handback 6036077438
Human owner / executor resource: Davide (decisions); Codex (coordination, independent review, two pushes, local checks); Claude Code in a cloud container (linux-x64), the only tracked-source writer
Native session: this Claude Code session (https://claude.ai/code/session_0155SjcXhv87RErnWEBWxfBM); no Sophia native session was created
Starting worktree/commit: the held #107 branch `scm-01/workboard-source-review` at `29371f5a3703f4358563886407bc360df7c38603`, in a fresh worktree with no ignored build outputs
Ending commit/tree: «WBC-02 #107: a review's model-call accounting waits a bounded time», this commit, with its artifact records pending (below), on the generated-only records of `081002ec` (`1e45537e876e3fbc9f0c4c0ef6a0d8e0a147b974`, tree `413fe808f28c7b0cf54275db17d288278dc90484`), on «WBC-02 #107: a Hold or Stop cuts a review's submit in flight» (`081002ec085b3a43611a7be7605bcbf1e3311121`, tree `618ac0eecf474dd01093d76d1f470b8dc74fa7fc`), on «WBC-02 #107: a review's submit waits a bounded time; a sub-cent cap may be proposed» (`8eef615749ab2ce7a3e7a3697f3408e6fdc40002`, tree `9f5fd1376911222bb3bf086242f2c9fc8e5c60ee`), on «WBC-02 #107: delivery order, in its controls» (`c0de7724c112b64117decd74ba381e16fad39ff7`, tree `50899da55838004adb28731b6e7f8c7730b6584a`), on «WBC-02 #107: a work item's deliveries in the order they were written» (`a82e3db2b7ba9937f23366451a9512c819d68d04`, tree `b6638b447c7bf94caecc1a1c3c2302d0b63e3098`), on «WBC-02 #107: a start permit not yet used is decided again» (`2e618a07c177a09d3f51c0768e28359c0cef59d5`, tree `1abb716ad06fe2ff78b33af51b3c116814f7a38c`), on «WBC-02 #107: the end of a source and the size limit, in their controls» (`7d9c940993478f45f411ffa8ace32e25d70aced4`, tree `8f1f02c11ea477be9d93e3bd60e7f2e211bf9574`), itself on the content commit «WBC-02 #107: an empty page proves no read; Review sources keeps to the size limit» (`d165c6520c9b229e52724f73096619ff14f6a911`, tree `3f6c0bf7634a0c2496569d4ba0acd3c8f2c51802`) and its handoff `7ae5a177`. Before them: the bundle records `d0eba67a`; the receipt, principal and CI fixes `8241e9d0`; the wakeup fix `e93b0c51`; the first fix `df183a5f`; each with its handoff commit. Before those, three merge commits, each on the one before; nothing is rebased or force-pushed:

| Commit | Tree | Merges | Changes beyond its parents |
| --- | --- | --- | --- |
| `53059b2dfd8183d4c66acc0e45075c6d0b9f0546` | `e6eef57877a4a08cb55bb9695a5cc35e17da29b7` | #119 at `ad749f1b527fdbc11af2e21abe35a52bccb173b2` | none: a clean merge |
| `b4cd29e54b3a51de3da6b5ed3e418f32e4957ce0` | `522c3e3c4ac04197eb8040a48fde6819f6ab06fc` | #117 at `59f9881b0db9813d6a7155ccd87164d7e2ebb903` | none: a clean merge |
| `5bbd59b193b52288f199b3109fc5aa65c222d9b0` | `9ae6622c0d2b123c4504122e6dc30e474b049c7a` | main at `95c375ce74e6bc1f512fa54415c4c8cc0ed7d21f` (through #146) | `ProjectShell.tsx`, resolved (blob `980b0c78`); `fixture-api.ts`, merged automatically (blob `178e2729`) |

This session made the three merges. Codex pushed them as the original signed objects, with fast-forward pushes: `b4cd29e5` (from CC-0047), then `5bbd59b1` (from CC-0048).

## Outcome

**The combined candidate `5bbd59b1`** holds:
- #107's source review: Tasks' served board, the door, the pilot entry, and the API, worker, plugin, adapter and runtime;
- #117's Design as accepted at `59f9881b`;
- #119's image qualification as accepted at `ad749f1`;
- main through #146.

**The only conflict** was `apps/studio/src/features/studio/ProjectShell.tsx`, in five chunks. All five are unions, so neither side's behavior is dropped:
1. **Imports:** main's `useKnownNames`, `UpdatesView`, `Connections` and `ConversationsView`, plus #107's `readsServedBoard`.
2. **`ProjectShell` body:** main's `searching`/`search`, then #107's `doorOf(snapshot)` and `useTasksWork(...)`. These replace main's inline door, which computes the same thing.
3. **`ProjectBody` call:** `{...work}`, which carries `plans` and `entry`, beside main's `search={…}`.
4. **`BodyProps`:** #107's `entry?` and main's `search`.
5. **`PageBody`:** main's form, with `Knowledge`, Conversations and Updates.

The plain union fails `oxlint`'s complexity limit: `PageBody` reaches 13, against 12. So the Goals and Work branch moves into a `Goals` component, as main already moved `Knowledge`. Against main's file, the resolution adds only #107's lines.

**The automatic `fixture-api.ts` merge** keeps every main route, including #142's replies and #143's. #107's `workRead` still answers GET `/plans` and `/plans/source-review` through `answerReports` → `answerReport`, and no main route reaches those paths first.

**Preserved from main** (CC-0043 to CC-0046), with no #107-side change to their files:
- #138: following per call, `newCall`, the reconnect sequence, the Leave recovery, «After the meeting».
- #140 and #142: tile overflow, the in-call sheet, `joinedAt`/`arrivalOrder`, replies, the failed-replies status, Stop replying.
- #139 and #143: `forgetKept`/account generation, drafts, held intent and read-before-send; the generation captured before an awaited held write; cache effects only after the guard; the matching `onAnswered` timestamp; the fixture's `endMeeting`, `forgetAccount` and late-receipt markers.
- #133, #134, #136 and #137: Conversations, Knowledge `CarriedIn`, Connections, the snapshot cursor.
- #144 to #146: the time words.

**The Personal spacing test** (`personal.spec.ts:616`, CC-0046) needed nothing here. Main's #144–#146 already pins its navigation to `${PAGE}?at=12:00`, with every assertion unchanged.

**The hover-fade failure** (`personal.spec.ts:382`) is not addressed here, by Codex's direction. Its evidence: 7 of 15 failures on #138's head `1f8f94cc` and 4 of 15 on main `580aee4c`; a pointer-away patch passed 30 of 30 on a scratch worktree.

**Codex's three findings on `5bbd59b1`**, each reproduced by Codex (r4205877266, r4205877521, r4205877853) and fixed in `df183a5f`:

1. **A reconciled commission is delivered only once its issue is bound and woken** (r4205800906, `apps/worker/src/coordination-dispatch.ts`). The lookup's `found` alone no longer settles the delivery. The commission is sent again. The plugin answers it from the issue it finds, binds it, and asks its wakeup unless one is confirmed (`wakeOnce`/`reask`, unchanged). Only that answer is recorded:
   - a wakeup the host does not queue is 503 `wake_not_queued`: unknown, never delivered;
   - one asked and maybe in flight is 503 `wake_in_progress`: unknown;
   - a durable one whose reply was lost is confirmed by its run, never asked again.
   The result keeps `reconciled: true`.
2. **A create claim is never taken over by time** (r4205800915, `packages/paperclip-plugin`). `CREATING_STALE_SECONDS` is gone. The claim follows the plugin's rules for status writes (CX-0017, CX-0020, CX-0024):
   - The claim is recorded with the host process that serves its create (`create_host_namespace`, `create_host_process`).
   - It ends when the host answered the create, with the issue (then bound) or with an error (then the issue its origin finds, if any, is the whole truth).
   - A create the host never answered (`issues.create` is now bound through `answered`, like `update`, so it raises `UnansweredHostCall`) keeps the claim until an operator fences it. `fence-previous-instance.sql` gains `open-creates` and `fence-creates`, under the same session check as the writes' fence.
   - Until then, lookup and resend answer 503 `commission_in_progress`, however old the row, and whichever process serves now.
   - Once the key is claimed, its origin is looked up again: a create that ended with its issue just before is bound, not repeated. Any failure before the create is asked ends the claim.
   - `001_sophia_coordination.sql` gains the claim's columns. The deploy README's rule is that it never changes once a service installed it; none has, since no deployment is authorized.
3. **`/ready` requires 0043** (r4205800927, `apps/api/src/app.ts`). It requires `sophia.runtime_capture_issue(bytea,text,text,jsonb,text)` and `sophia.runtime_capture_delivered(bytea,text,text,jsonb,text)`.
   - **Why these two:** they are the only SQL functions this API calls that main's doesn't. That is the difference between main's and this head's `packages/persistence/src/design.ts`.
   - **Why they prove the rest:** 0043 is one transaction, and its other changes replace functions under their own signatures (its header says so).
   - **Compatibility:** the previous API requires nothing of 0043, so it stays ready on either database during a rolling deployment.

**Codex's review of `10510fcd`** (review 5441387417) found two more:

4. **A wakeup ask is in flight until the host answers it** (r4206134009, fixed in `e93b0c51`). This is the create claim's case, for wakeups: an unconfirmed ask was asked again 60 s after it was made, while the host may still queue it, and the pin does not deduplicate the key.
   - An ask is recorded with the host process that serves it.
   - It is in flight until the host answers it (a run queued or not, or an error), or an operator fences it. `requestWakeup` is bound through `answered`, so an unanswered ask raises `UnansweredHostCall` and stays open.
   - The 60 s a resend waits for a run now counts from the host's answer, not from the ask.
   - A run since the first ask still confirms an ask, answered or not.
   - `fence-previous-instance.sql` gains `open-wakes` and `fence-wakes`; `001`'s `wakes` table gains the ask's host, answer and fence.
5. **A source review cites only pages that reached its model** (r4206134000, fixed in `8241e9d0` under decision 6036790901). Codex reproduced it: a page requested and cancelled still let a submission cite the source and publish.
   - Serving a page no longer records a read. Each page carries a fresh receipt (32 hex characters from `gen_random_uuid`), kept only as its SHA-256, with the page it was served with: offset, length, text hash, the source's length (`work_review_receipts`). The task listing carries none.
   - A submitted result presents `receipts` (A13: `result.receipts`, required). Each must be a receipt served to this attempt; the sources they are of become the reads `review_checks` cites against. A page whose reply was lost carries nothing usable; another attempt's receipt is refused; a reread that arrives recovers the citation. A refused submit records no read.
   - Paging stays honest: the result records each source's coverage (`checks.coverage`: delivered characters, total, complete), so one page is not the whole source. Citation still needs one delivered page, as before.
   - The receipts are rows, not memory: they survive a restart of the API or the runtime, and Hold and Stop fence both the page and the submit as before.
   - Contracts: A13 adds `SourceReviewPage` (the page with its receipt; `text` up to the 16000 characters `0042` serves, where the research page it replaced allowed 6000) and `result.receipts`; `pnpm --filter @sophia/contracts run generate` regenerated OpenAPI, the types and the runtime wire.
   - Bundle: the read tool puts `receipt="…"` on the page's envelope (outside the untrusted text); the submit tool sends `receipts`. The versioned review prompt (`sophia-source-review-instruction-v1`, hash-pinned) is unchanged: the two tool descriptions carry the instruction.
6. **The plugin names its principal** (r4206242556, fixed in `8241e9d0`). A configuration without a non-blank string `integrationUserId` refuses every route as 503 `not_configured`, before any nonce or effect; the configured board user alone may call; agents and other users stay refused.
7. **CI job 112764079889** (Codex, 6036970693): the delayed-Hold control at `coordination.db.test.ts:833`, and `lateFailingHold`, removed their gate once the original held the lease, before its write reached the host; the original could then land first, and the resend answered `already`. Both now wait for the original's write to enter the host (`beforeUpdate` resolves a barrier). Their assertions are unchanged.

**Codex's review of `a91cd88b`** (review 5441931074) found two more; Codex verified findings 5 and 6 fixed on that head (r4206590841, r4206591597):

8. **An empty page proves no read** (r4206591756, P1, fixed in `d165c652`). A page asked at or past the end of a source that has text came back empty, with a receipt that recorded a read. Such a receipt now proves no read and adds no coverage, so citing the source on it alone is refused. A page of an empty source still counts: it is the whole source.
9. **Review sources keeps to the size limit** (r4206591778, P2, fixed in `d165c652`). The form adds up the chosen sources' text (`review-sources.ts`, `selectionOf`); over `maxInputBytes` it says so where they are chosen and keeps Propose review off. Sophia refused such a proposal anyway.

**Codex's review of `7ae5a177`** (review 5442052835) found one more; Codex verified finding 8 fixed on that head (r4206671036) and reproduced this one over real HTTP and PostgreSQL (r4206740161):

10. **A start permit not yet used is decided again** (r4206690881, P1, fixed in `2e618a07`; handback 6037677126). A run that paused for more than five minutes between its permit and its start was answered the same expired permit for every retry, and every start was refused 409 «ask for a permit again», so the accepted review could not start through that run. `coordination_permit` now answers a run that started, attached or ended as recorded, with its attempt (and its native session, as the first answer had it). An unused start permit is decided again, under the same lock and the same checks as a new run's:
    - the enrollment, the plan, Hold, Stop and completion, the work's own ending, every input still readable (`work_denial`);
    - the assignment and its generation, which must still be the run's;
    - the work's attempts: another run's live or uncertain attempt is attached to, never duplicated; an attempt that ended starts nothing (`attempt_ended`);
    - a runtime that carries the reviewer, and the allowance.

    Still startable, the permit is kept as it is while valid and renewed for five minutes once expired; nothing is extended without this decision. Denied, the run's record is left as it was, so a later ask decides again. Only the run's own credential may ask: another credential of the same company is refused, as a revoked one is. `coordination_start` gives a run that started its own attempt even after the run ended, and starts nothing for a run that ended without one.

**Codex's review of `7d9c9409`** (review 5442265537) found one more; Codex verified finding 9 fixed on that head (r4206833190):

11. **A work item's deliveries go in the order they were written** (r4206869533, P1, fixed in `a82e3db2`; its controls extended in `c0de7724` under handback 6038061799; Codex reproduced it on `2e618a07`, r4206974770). `claim_coordination_outbox` held back a delivery while an earlier one of its work item was unsettled, but "earlier" was `created_at`, which is a transaction's start. A Stop whose transaction began before a Hold's, and wrote after it, was stamped before the Hold. While the Hold was in flight, a second worker could send the Stop alongside it, and the Hold reaching the plugin last took the larger plugin sequence and undid the Stop. `coordination_outbox` now has `seq` (a unique identity), and the claim compares and orders by it. Every row is written under its commission's lock (`work_mirror`; the commission itself with the work), so a later control always has the larger `seq`.

**Codex's review of `c0de7724`** (review 5442531855) found two more; Codex verified finding 11 fixed on that head (r4207036584):

12. **A review's submit waits a bounded time** (r4207084075, P1, fixed in `8eef6157`, and in `081002ec` cut by a Hold or Stop, after Codex's reproduction 6038521633: a request pending after the caller's cancellation). `submit_source_review` and `report_review_blocker` sent their request with no deadline. A service that took the connection and never answered held the tool call for ever, past a Hold or Stop.
    - **The bundle** (`review-tools.ts`, `transport.ts`): each request now has a deadline (the time left of 60 s). A lost answer (no answer, an unreadable one, a 5xx, 408 or 429) is sent again with the same body and `callId`, up to four times within the 60 s, as the design tools' submit (`SUBMIT_PATIENCE`). A Hold or Stop of the review cuts a request in flight at once, and nothing is sent after it; a review already held sends nothing and is told so (`invalid_state`). A refusal, or a request that breaks the contract, is never sent again. An outcome still unknown is said to the model as unknown, never as a refusal: a resend is safe, since the service answers it with what it recorded.
    - **The service** (`0042`, `runtime_source_review_submit`): a blocker sent again finds the blocker recorded, as a submit finds its published review (`replayed`). Nothing publishes after a review ended blocked.
13. **A cap below a cent, or between cents, may be proposed** (r4207084084, P2, fixed in `8eef6157`). The allowance field's `min` and `step` of 0.01 made the browser refuse a valid sub-cent cap while Propose review looked enabled. The field and the form now share one rule (`allowanceOk`): positive, within the cap, in millionths of a dollar, as Sophia keeps it.

**Codex's review of `1e45537e`** (review 5442950811) found one more; Codex verified findings 12 and 13 fixed on that head and resolved them (r4207414364, r4207414763):

14. **A review's model-call accounting waits a bounded time** (r4207423541, P1, this commit). The bridge reserved and settled each of a review's model calls with no deadline (`sourceReviewReserve`, `sourceReviewSettle`), before the call left and while its stream ended, so a response the service never finished held the review for ever. Each request now has a deadline, and one whose answer is lost is sent again with the same body (`reviewAccounts`, `review-tools.ts`): the same callId for a reservation, the same reservationId and outcome for a settlement. As patience, they share the review submit's (`REVIEW_PATIENCE`).
    - **The service answers a resend as recorded.** It returns the reservation it made under that key (`reserve_research`), or the settlement already recorded (`end_research_reservation`).
    - **A refusal is not resent.** It is thrown at once, so the model call is refused, as before.
    - **An answer still unknown is thrown as unknown.** The bridge then refuses the model call, or logs the settlement for the service to reconcile. A reservation never settled stays counted against the allowance, and is made uncertain if the turn ends abnormally (`review_turn_end`), so spend is never under-counted.
    - **Research's metering is unchanged**, as are its reserve and settle.

## Evidence

**Before the fix, on `5bbd59b1`:**
- **Static checks on a preview tree,** not on these commits. The preview was #107 + #119 + #117 at `1317562f` + main `6cf6f634`, with the same resolution blob `980b0c78`. Results: `tsc`, `oxlint --type-aware .` and `prettier --check .` pass; Studio units 895 of 895.
- **CI on `b4cd29e5`,** run 37603917072: all six jobs succeeded.
- **The transfer of `5bbd59b1`,** rebuilt in a clean clone of published objects: `fixture-api.ts` `178e2729`, `ProjectShell.tsx` `980b0c78` from the posted patch (SHA-256 `fca15470…`), tree `9ae6622c`, raw commit (1,036 bytes, SHA-256 `ecdf8b42…`) `5bbd59b1`.
- **Codex's checks on `5bbd59b1`** (reported, not rerun here):
  - `pnpm check` passed: 1924 unit tests (1856 passed, 68 environment skips); 88 integration tests (86 passed, 2 skips); recorded runtime identities reproduce.
  - The full Studio suite: 850 passed.
  - 16 real SQL/HTTP/built-bridge recovery controls: passed.
- **CI on `5bbd59b1`:**
  - run 37606506613: all six jobs succeeded;
  - Paperclip image run 37606506646: succeeded;
  - run 37606502010: five jobs succeeded. The room in Chromium was cancelled at its 30-minute limit (`timeout-minutes: 30`, 30 min 21 s). The same job on the same commit passed in run 37606506613 in about 26 minutes, so the suite runs close to its limit.
- **Codex's code and security reviews of `5bbd59b1`:** both terminal. The three code findings above; no security finding.

**On the fix, in this session** (a scratch worktree at `5bbd59b1`, then `df183a5f`):
- `prettier --check .`, `oxlint --type-aware .` and `pnpm typecheck` pass.
- **Units of the touched packages** (plugin, coordination, persistence, worker, API): 101 of 101.
- **`pnpm test`:** 1840 of 1853 pass, 1 skipped. The 12 failing files each fail to import `packages/dsh-bundle/dist/*`, which only `pnpm build` makes. It was not run here (see Decisions), and the fix does not touch the bundle.
- **The plugin's statements** under the pinned host's runtime rules (`checkQuery`/`checkExecute`): every one passes, the four new ones included.
- **No database test ran here:** there is no PostgreSQL in this container, and its restart was denied earlier. Not run here, so not claimed:
  - the plugin tests (a create held at the host for an hour across a restart; unanswered, fenced and answered-error creates; both fence steps);
  - the API crossings (the reconcile crash window; wakeup not queued; lost wakeup reply; 0042 then 0043 readiness; each 0043 function).
  CI's `test:db` runs them on the pushed head, and the image job runs the plugin's migration through the pin's loader.

**CI on `10510fcd`** (the first fix, `df183a5f`):
- `test:db` on PostgreSQL 16, run 37611400770 (job 112759240130): 524 of 524, none skipped. Every new control ran and passed: the held, unanswered, fenced and answered-error creates; the fence procedure; the reconcile crash window, wakeup not queued and lost wakeup reply; readiness through 0042 then 0043; each 0043 function.
- `runtime-unit` (`pnpm check`, with the artifact reproduction) passed in both runs, 37611391951 and 37611400770.
- The room in Chromium and the Paperclip image job (37611400748) were still running at this writing.

**On `e93b0c51`, in this session:** `prettier --check .`, `oxlint --type-aware .` and `pnpm typecheck` pass; the touched packages' units 101 of 101; every plugin statement passes the pinned host's rules. Its new `.db` controls (a wakeup held at the host for an hour across a restart; an unanswered ask confirmed by a late run; a fenced ask asked again once; the wakeup fence steps) did not run here, for the same reason.

**On `8241e9d0`, in this session:** `prettier --check .`, `oxlint --type-aware .`, `pnpm typecheck` and `pnpm contracts:check` pass; every plugin statement passes the pinned host's rules; `pnpm test` 1840 of 1853, 1 skipped, the 12 failing files each failing only to import `packages/dsh-bundle/dist/*`, which only the build makes. Not run here: the bundle's own tests (`tests/unit/review-tools.test.mjs`, the end-to-end `tests/integration/review-tools.test.mjs`), every `.db` control (the receipt, foreign-receipt, reread and coverage controls; the principal controls; the two barriered Hold controls), and the artifact check. CI runs the `.db` controls; the bundle's tests and the artifact check run there once the records are in.

**CI on `84530867`** (the same source as `0661a6f8`):
- `runtime-unit` (run 37616446014): units 1938, 1872 passed, 0 failed, 66 skipped, the bundle's receipt tests among them. `pnpm artifacts` then reported exactly the four expected mismatches and nothing else (the linux runtime digest matches). Built: `sophia_bundle.archive_sha256` `e5e107417a974fd2887407243394be44efc28230d32e7f9e90cf005e0d5f6fb4`, `archive_integrity` `sha512-Us9oeGgyOPGHWSywC+oMBGN1nwI8RXE2Nx/yTwinrzSDX1suQ0qeCpDgCmoN7D8bLTbkVcvhJnikfataIOv1gw==`, `artifact_digest` `sha256:e5e1…6fb4`, and the profile lock. The integration tests did not run.
- `test:db` (run 37616437946, job 112775782401): 528 of 529, none skipped. Every new control passed: the receipt, foreign-receipt, reread and coverage control; the principal control; both barriered Hold controls; the wakeup and fence controls. The one failure was the test order this commit fixes: the receipt control published its review, whose completion was still queued in the shared outbox, and the next test's pass claimed it as well (`['unknown','unknown']` for `['unknown']`). The reconcile helpers now count only their own world's deliveries, and the receipt control delivers its completion.

**On `d165c652`, in this session:** `prettier --check .`, `oxlint --type-aware .` and the typechecks pass; Studio's units 919 of 919, with `review-sources.test.ts` (at, over and below the limit; sizes as stated). Not run here: the new `.db` control (a page asked past the end, its receipt refused as a read); CI runs it. The Studio form itself has no browser control: the fixture page serves the review as not enabled.

**Codex's handback 6037451217, in this commit:**
- The empty-page control now reads A at its end exactly as well as B past it, and both receipts are refused as reads. It pages on from A's first page (`offset` 10, `limit` 10): both receipts count, and coverage says 20 characters. The final submit also presents both empty pages' receipts, which change nothing.
- `ReviewSources` refuses a submit over the limit in its handler too, not only by its disabled button. Size wording rounds up (`kib`), so one byte over reads 32.1 KiB, never the limit.
- Browser coverage: `work.html?served=1` leaves the page's own plans out, so the real ProjectShell reads the board Sophia serves. `fixture-api.ts`'s `workRead` (#107's own) then answers the enabled availability of the new `fixtures/source-review-data.ts`. `work.spec.ts`, «sources over a review’s limit together…», covers:
  - two versions over the limit together are said so, with Propose review off;
  - Enter in a field sends nothing (the page's unexpected-request check);
  - at the limit exactly, Propose review is on;
  - a third version of one byte is over again;
  - deselected, the selection is back within the limit.
- Run here: the whole `work.spec.ts` locally, 162 of 162 (desktop and phone; the container's Chromium through a local-only config). A mutant restoring the old check (Propose review on with any choice) fails it at `toBeDisabled`. The handler's own guard can't be told apart in a browser, since a disabled default button submits nothing. Also `prettier`, `oxlint`, the typechecks, and Studio's units 919 of 919. The `.db` controls run in CI.

**Codex's handback 6037677126, in `2e618a07`:**
- `coordination.db.test.ts`, «a start permit asked for again before it was used», four controls. Each ages only the run's durable expiry, as Codex's reproduction does:
  - **Renewed and started once.** Expired, the start is refused and nothing starts. Two asks at once give one renewal and the same answer. A third keeps the valid permit unextended. Two starts at once give one attempt; one says it started. The started run is answered with its attempt and native session. After the run's final observation, a start still answers its own attempt.
  - **Denied, effect-free, recovered.** Held (a Hold before any attempt, settled), the allowance spent, no runtime carrying the reviewer: each is denied with its code. The run's record is unchanged, the start still refused, no attempt made. After Resume and with the allowance and runtime back, the permit is renewed and starts one attempt.
  - **Credentials and stale authority.** Another credential of the same company, either way round, is refused on permit and start, and so is a revoked one; the record is unchanged. After a new assignment generation, the earlier run is denied `stale_assignment`, while a run of the current one may start. After a withdrawn input (which stops the work), the run is denied `stopped`. No attempt is made.
  - **Competing runs.** One run starts. An expired run asked again attaches to that exact attempt and session, and answers the same when asked again; its start is refused as an attach. A still-valid permit that lost the race is told by start to ask again, and asking again attaches it. Once that attempt has ended, with the work neither held, stopped nor finished, a third expired run is denied `attempt_ended`, its record unchanged and still one attempt.
- Run here: `prettier --check`, `oxlint --type-aware` and `tsc` on the touched files; the adapter's units 28 of 28 (its comment only changes). Not run here: the four `.db` controls, since there is no PostgreSQL in this container. CI's `test:db` runs them. The contract, the bundle and the recorded artifact bytes are unchanged.
- The form and browser coverage of 6037532214 are in `7d9c9409`, unchanged here, as are the EOF and paging controls.

**Finding 11, in `a82e3db2` and this commit** (`coordination.db.test.ts`, `control`):
- «a control whose transaction began before the one it follows waits for it, even unanswered; other work goes on». Two work items, each with its own plugin. In order:
  1. A transaction begins.
  2. A Hold of the first work is made through the API, and a worker's pass sends it, held at the plugin's door.
  3. The second work is held.
  4. The early transaction Stops the first work (`work_control`, so the goal's mirror writes the row) and commits. Asserted: the Stop is stamped before the Hold, and its `seq` is after it.
  5. A second worker's pass sends nothing of the first work, and delivers the second work's Hold: work items still go in parallel.
  6. Released, the first Hold lands (`blocked`), and its reply is lost: `unknown`.
  7. The next pass reconciles the Hold alone (`delivered`). The pass after delivers the Stop, and the issue ends `cancelled`.
- «controls written in one transaction, stamped alike, are sent one at a time in the order written». One transaction holds the work and fails it (`work_control`, `work_fail`). Asserted: equal `created_at`, ordered `seq`; one pass sends the Hold alone, the next the failure, and the issue ends `cancelled`.

With the claim on `created_at`:
- in the first control, the second pass sends the Stop alongside the Hold;
- in the second, one pass sends both.

Run here: `prettier`, `oxlint --type-aware` and `tsc` on the touched files. The two controls did not run here (no PostgreSQL); CI's `test:db` runs them. Unchanged: commission before controls, the supersession of a pending control by a newer one, effect leases, idempotency, and Stop.

**Findings 12 and 13, in this commit:**
- **The bundle's units** (`tests/unit/review-tools.test.mjs`, seven new):
  - a lost answer is sent again with the same request and `callId`, each with a deadline;
  - a submit and a blocker never answered end at their deadline, unknown;
  - a Hold cuts a request Sophia has not answered at once, long before its deadline, unknown;
  - a review already held sends nothing (`invalid_state`);
  - after a Hold, a lost answer is not sent again;
  - a refusal, or a request that breaks the contract, is sent once;
  - a lost blocker is sent again.

  Run here: 13 of 13, on the bundle compiled with `tsc` into this session's scratch directory, outside the worktree. Neither `pnpm build` nor `pnpm artifacts` was run. Four mutants were caught:
  - a request in flight that ignores the Hold: the Hold test hangs, cancelled at its timeout;
  - a review already held that sends anyway: 1 test fails;
  - no resends: 2 tests fail;
  - no deadline: the deadline test hangs, cancelled at its timeout.
- **The service's control** (`coordination.db.test.ts`, «a blocker sent again after its answer was lost is answered as recorded»): one ending; the second answer equals the first, with `replayed`; a submit after it is refused 409. It did not run here (no PostgreSQL); CI's `test:db` runs it.
- **The allowance:**
  - Units: `review-sources.test.ts` covers sub-cent, between-cent, least and finest amounts. Studio's units pass 920 of 920.
  - Browser: `work.spec.ts`, «a cap below a cent, or between cents…», with the fixture switch `work.html?served=1&cap=<usd>`. At 0.005 and 0.015 the field starts at the cap, Propose review is on, and the form passes the browser's own validation (`checkValidity`). A value finer than a millionth is refused by both. The whole `work.spec.ts` passes here, 163 of 163 (desktop and phone). A mutant with the old `min`/`step` of 0.01 fails it at `checkValidity`.
- **Static:** `prettier --check .`, `oxlint --type-aware .`, and Studio's, the API's and the bundle's `tsc`.
- **Records pending.** The bundle's source changes, so `config/runtime-unit.json` (`sophia_bundle`'s `archive_sha256`, `archive_integrity`, `artifact_digest`) and the profile lock's integrity line move. As for `8241e9d0`, they come from the normal artifact builder, derived independently and applied here as a generated-only commit. Until then, CI's `runtime-unit` stops at `pnpm artifacts` with exactly those mismatches and the values it built, and its integration tests do not run.

**`1e45537e`:** the records of `081002ec`, Codex's independent derivation (WBC-02-CX-generated-records-081002ec), applied byte for byte. `config/runtime-unit.json` `01888e6e…` → `6ea81548…`; `config/dsh/profile/pnpm-lock.yaml` `cb9c93c9…` → `838ad7db…`; archive `4ce95db7…6ae6`, equal to CI's build. CI on `1e45537e`: `runtime-unit` (the artifact check and integration tests included), `test:db`, live auth and the media bridge passed in both runs.

**Finding 14, in this commit:** two new bundle units:
- a reservation and a settlement whose answers are lost are sent again with the same callId, and the same settlement, each request with a deadline;
- a reservation and a settlement never answered end at their deadline as unknown, and a refusal is thrown at once.

Run here: 15 of 15, on the scratch build. Two mutants were caught: accounting without its deadline, and a reservation not sent again, each failing 2 tests. Records pending again: this changes the bundle, as findings 12 and 13 did.

**Source-register IDs consulted:** none.

## Decisions and changes

- **Order:** #119, then #117, then main, as merge commits; the fix as a commit on the merge. History is never rewritten.
- **Records:** none needed regenerating. The runtime artifact covers `dsh-bundle` and `execution-host` only, and neither the merge nor the fix changes them. Codex's clean `pnpm check` on `5bbd59b1` reproduced every recorded identity.
- **The plugin fixes follow the plugin's own rule rather than a longer timeout.** The worker stops waiting after `HOST_CALL_TIMEOUT_MS`, but the host still runs the call and may still commit (CX-0017). No time, nor another process serving now, proves a create or a wakeup will not land. The cost is an operator fence for one whose worker died or that the host never answered, the same cost as for status writes. The 60 s wait for a wakeup's run after the host answered is kept from CX-0004: the pin can defer a wakeup behind an active run.
- **The Studio browser job's budget is 40 minutes** (Codex, 6037063010; this handoff's commit): the full 850-test suite took 24.9 min on `5c3b50ee`, and both runs on `10510fcd` were cut off at 30 min while still passing. Only `timeout-minutes` changes.
- **The records of `8241e9d0` are applied** (decision 6036790901). Codex derived them from `0661a6f8` with the normal artifact builder (6037319212); they equal what CI's `runtime-unit` built on `84530867`. Applied byte for byte as a generated-only commit: `config/runtime-unit.json` `8bd4051c…` → `01888e6e…`, `config/dsh/profile/pnpm-lock.yaml` `c0079d54…` → `cb9c93c9…`; only `sophia_bundle`'s three fields and the bundle's integrity line change.
- **Permission denials in this session,** each reported, neither worked around:
  - `git merge --no-ff --no-commit 771f22489b53cd431bfc9989cf309333dfcc4c42` in the worktree was denied as «Modify Shared Resources». Davide then directed the commits pushed, and the work continued. The same merge, with main at `95c375ce`, ran.
  - `pnpm toolchain:check && pnpm build && pnpm contracts:check; pnpm artifacts` on the uncommitted merge was denied as «Modify Shared Resources». So no build, contract or artifact check ran in this session, on either head.
  - The PostgreSQL restart was denied earlier. No private database was started instead.
- No native, paid, production, registry, storage or rights choices. No acceptance, merge or deployment follows from this source.

## Remaining obligations

- **On the completed head:** CI in full (`runtime-unit` with the artifact check and the integration tests, `test:db`, Studio within its new budget, live auth, the image), and Codex's review and checks.
- **On the fix head:**
  - CI, including `test:db` with the new controls, and the Paperclip image job;
  - Codex's independent review and local checks;
  - automatic re-review of the corrected head.
- **The final gates, before any merge to main or deployment:**
  - the full Studio suite, run serially, with `room-tiles` (8 tests), `room-chat-replies` (13), `project-conversation-follow-ups` (13), the source-review (`work.spec.ts`), and the Room following and Leave checks;
  - SQL/API, report and image-delivery crossings;
  - artifact, contract and runtime-installation reproduction.
- **The records of this commit's bundle:** derived by the normal artifact builder and applied as a generated-only commit; then `runtime-unit` with the artifact check and the integration tests (the reviewer through the real pinned dsh).
- **The hover-fade failure** (`personal.spec.ts:382`) goes to its owner, with the evidence above. It is never counted as a green full-suite run.
- **Records:** `docs/coordination/WBC-02/` stops at CC-0009. CC-0043 to CC-0048 are on the PR only.
- **Not affected by this source:** the legacy #104 closures wait for actual fixes in main, and no native G6, perception or production acceptance follows from it.

## Next bounded action

CI runs in full on the completed head; Codex reviews it against CI and its own checks, then hands back an exact finding or failure, or proceeds to the final gates. Merging is Davide's decision.
