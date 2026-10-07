# Implementation-session handoff

Goal and attempt: WBC-02 (SCM-01), the combined integration of #107 with the accepted #117 (SDD-01 Design) and #119 (the Paperclip image's CI), and with main; then the findings of Codex's automatic reviews of the combined head and of the fix. Attempt 1: plan WBC-02-CC-0043 to CC-0046, transfers CC-0047 and CC-0048, handback 6036077438
Human owner / executor resource: Davide (decisions); Codex (coordination, independent review, two pushes, local checks); Claude Code in a cloud container (linux-x64), the only tracked-source writer
Native session: this Claude Code session (https://claude.ai/code/session_0155SjcXhv87RErnWEBWxfBM); no Sophia native session was created
Starting worktree/commit: the held #107 branch `scm-01/workboard-source-review` at `29371f5a3703f4358563886407bc360df7c38603`, in a fresh worktree with no ignored build outputs
Ending commit/tree: the content commit «WBC-02 #107: a source review cites only pages that reached its model; the plugin names its principal» (`8241e9d0d3f32154320d4a9eda237620b4f72441`, tree `f71162ec15f3c2f904abba0aaba5250922974c9d`), the parent of this handoff's commit. Its runtime records are pending (Decisions). Before it: the wakeup fix `e93b0c51` and its handoff `5c3b50ee`; the first fix `df183a5f` and its handoff `10510fcd`. Before those, three merge commits, each on the one before; nothing is rebased or force-pushed:

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

**Source-register IDs consulted:** none.

## Decisions and changes

- **Order:** #119, then #117, then main, as merge commits; the fix as a commit on the merge. History is never rewritten.
- **Records:** none needed regenerating. The runtime artifact covers `dsh-bundle` and `execution-host` only, and neither the merge nor the fix changes them. Codex's clean `pnpm check` on `5bbd59b1` reproduced every recorded identity.
- **The plugin fixes follow the plugin's own rule rather than a longer timeout.** The worker stops waiting after `HOST_CALL_TIMEOUT_MS`, but the host still runs the call and may still commit (CX-0017). No time, nor another process serving now, proves a create or a wakeup will not land. The cost is an operator fence for one whose worker died or that the host never answered, the same cost as for status writes. The 60 s wait for a wakeup's run after the host answered is kept from CX-0004: the pin can defer a wakeup behind an active run.
- **The Studio browser job's budget is 40 minutes** (Codex, 6037063010; this handoff's commit): the full 850-test suite took 24.9 min on `5c3b50ee`, and both runs on `10510fcd` were cut off at 30 min while still passing. Only `timeout-minutes` changes.
- **The records of `8241e9d0` are pending** (decision 6036790901). The bundle change moves `sophia_bundle.archive_sha256`, `archive_integrity` and `artifact_digest` in `config/runtime-unit.json` and the bundle's integrity in `config/dsh/profile/pnpm-lock.yaml`, nothing per platform (as each #117 bundle change did). Codex derives them from this exact source where the build is allowed; this writer applies that generated-only delta after inspecting it. Until then `pnpm artifacts` reports those identities as mismatched: in CI, `runtime-unit` stops there (before the integration tests), and the database job's `pnpm build && pnpm artifacts` step fails after `test:db`.
- **Permission denials in this session,** each reported, neither worked around:
  - `git merge --no-ff --no-commit 771f22489b53cd431bfc9989cf309333dfcc4c42` in the worktree was denied as «Modify Shared Resources». Davide then directed the commits pushed, and the work continued. The same merge, with main at `95c375ce`, ran.
  - `pnpm toolchain:check && pnpm build && pnpm contracts:check; pnpm artifacts` on the uncommitted merge was denied as «Modify Shared Resources». So no build, contract or artifact check ran in this session, on either head.
  - The PostgreSQL restart was denied earlier. No private database was started instead.
- No native, paid, production, registry, storage or rights choices. No acceptance, merge or deployment follows from this source.

## Remaining obligations

- **The records of `8241e9d0`**: Codex's generated delta, applied by this writer, then CI and the bundle's tests on the completed head.
- **On the fix head:**
  - CI, including `test:db` with the new controls, and the Paperclip image job;
  - Codex's independent review and local checks;
  - automatic re-review of the corrected head.
- **The final gates, before any merge to main or deployment:**
  - the full Studio suite, run serially, with `room-tiles` (8 tests), `room-chat-replies` (13), `project-conversation-follow-ups` (13), the source-review (`work.spec.ts`), and the Room following and Leave checks;
  - SQL/API, report and image-delivery crossings;
  - artifact, contract and runtime-installation reproduction.
- **The hover-fade failure** (`personal.spec.ts:382`) goes to its owner, with the evidence above. It is never counted as a green full-suite run.
- **Records:** `docs/coordination/WBC-02/` stops at CC-0009. CC-0043 to CC-0048 are on the PR only.
- **Not affected by this source:** the legacy #104 closures wait for actual fixes in main, and no native G6, perception or production acceptance follows from it.

## Next bounded action

Codex derives the runtime records of `8241e9d0` and hands back the generated delta; this writer inspects and applies it, and CI runs complete on that head. Codex then reviews it against CI, and hands back an exact finding or failure, or proceeds to the final gates. Merging is Davide's decision.
