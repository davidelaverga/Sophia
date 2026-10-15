# CON-01 takeover 73 — integration readiness audit

Source-only window expires20:00Rome14October2026. Codex remains sole implementer/operator, Claude stopped. This checkpoint makes no executable source change; independent audit complete; no code/test hold or active reviewer resource. Goal remains the complete safe integrated/deployed/actual-app outcome, not completion of launcher helpers.

## Observed source boundaries

Published PR273 head457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c. Launcher39d3768c and tests83e0b176 remain handoff72's exact independently reviewed pins. Reply-child SHA2569ce38b9f2f2fbb06577e029de394d15feca604c134b84e8f60688f266bbafe72; bridge803bfacf0340d6fe793c045bbedc61f4647f518803f940f91657a16adc72e850.

| Boundary | Current evidence | Remaining crossing |
|---|---|---|
| Command/hello integration | ControlBridge.execute returns conversation_child_unqualified for every CON command; connect reports every CON hello binding unrecovered | Actual trusted controller construction, command dispatch, disposal and complete recovery; preserve goal behavior |
| Physical checker | ReplyHomeVerification.check is an injected callback; ReplyHomeChecks bounds waiting and validates complete output | Concrete owned subprocess adapter with explicit paths, complete bounded output/exit and abort/late/close handling; no generic success callback |
| Native launcher | check/sweep/digest commands implemented; run/probe remain disabled | Qualified selected read-list and actual run/probe composition, then Linux containment proof |
| Runtime installation | index, supervisor, runtime-host and profile have no reply wiring | Accepted profile/Q8 and shared integration, generation fencing, install and exact compatible artifacts |
| Durable recovery | ACK reservation rows require ordinal/state/used but no original unit; scrubbed creates cannot supply it | Pending exact handoff27 amendment, not a current-grant/default inference |
| Supersession | Existing pollLoop still retries409/invalid_state | Pending exact handoff36 amendment plus actual controller cancellation; do not modify unlisted poll scope |
| Retirement | Registry retains receipt/accounting/journal proof components; no physical delete/prune integration | Prove no live or future writers, complete durable delivery/accounting, safe deletion/ENOENT before prune; unknown remains retained |

The next proposed implementable crossing is the concrete checker subprocess adapter in listed reply-child.ts/tests. It should consume only explicit trusted Python/script/path bindings, cap output, require full close and zero exit, never treat abort/timeout/overflow/partial output as proof, and retain unresolved actual I/O so replay cannot overlap a live checker. Local synthetic process fixtures qualify L1 only. This does not enable Ask or bypass the pending recovery/profile/shared gates. Independent audit confirms this next crossing only when composed into the existing registry Stop/accounting/check/receipt flow in the same slice. Its exact receipt is `independent-integration-readiness-20261014/review.safe.json` under the takeover operator journal. A standalone adapter is insufficient evidence.

## Stop ordering found during independent audit

The actual bridge serializes commands by attempt in dispatch (lines651–672), awaiting execute's result before starting the next command. The registry's executeCreate installs ownership synchronously but returns a promise covering admission through claim/prepare/go. Naively awaiting it inside the new CON execute branch would delay a queued Stop until after the create sequence. Correction at handoff75: Q7 section6 explicitly permits bounded Stop waiting behind create. This is a stronger prompt-fencing integration choice, not a demonstrated violation of the approved contract or an enabled-product defect; current source rejects CON commands.

The listed execute insertion must retain asynchronous CON work and its error/receipt state while returning after ownership installation, leaving the existing goal queue untouched. Test through actual ControlBridge.dispatch: hold claim/ready/go, dispatch Stop, prove the fence before releasing the held create, and prove no late go/provider dispatch. Direct registry fixtures do not establish this queue crossing. Root independently read both functions and concurs. Shared finding198/6168527017 records candidate, expected/observed source behavior, severity and reproducer.

The checker adapter must not use numeric-signalling shortcuts. Timeout/abort refuses proof and retains the exact unresolved checker until actual exit and stdout EOF; a replacement cannot overlap it. Wiring it into existing registry verification closes a real Stop proof crossing but is not bridge integration or Linux qualification.

## Refreshed external state

PR190/199/256/273 were fetched through the GitHub connector: all open, draft, unmerged and mergeablefalse. Exact heads respectively5c10bce3060ca867402cb5ba869146a69af057c6, d527f3854222020abb6ba723bf0ea7480c76bb82, 93e9313ddb8e2cb2f64d0a1e8c64c453f3147ad9 and457053b3fe619631f0d2e2fcc1e3edc98cfc5348. Main freshly unchangede2da7d89b5231ab27d7269b0a8100bedd1fa94fe. No merge/rebase/reset or conflict resolution. Automatic273/6144338846 covers only the published head; every future push requires its actual review. Owner14/6132091412 and31/6132091149 remain latest, without new handback; Luis preservation199/6165765212 remains controlling.

The actual IAB tab5/browser3 now shows the existing project shell and owner account menu, without the earlier signed-out banner. Resources displays COMING and a description of future connected tools. Read-only actions: read AX, open/inspect/close Account menu, read AX, markHandoff. No login, invite, account/member, credential or provider action. Rendered display identity does not establish immutable subject/role, backend token validity, designated cohort or deployed CON tuple. The previous signed-out observation is historical, not current. Private browser receipt: integration-audit-20261014-1232/browser.safe.json in the operator journal.

## Operations, acceptance and recovery

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not-ready drafts with exact candidate, approval and expiry unbound. No deployment, hosted migrations/configuration, grants/connection termination, provider/subscription execution or spending. Product-provider use0; coding consumption unknown. The two immutable test subjects/roles, subscription topology/eligible requester/credential lifecycle/quota/bounds, exact artifacts and compatible rollback still require binding before a reviewable operational batch.

Acceptance ledger remains18partialL1/3passedL1/15not_run, includingA30not_run; no actual two-account/native-answer episode or serving app/API/runtime tuple. Whole source_ready/combined reviewed/authorized/deployed/app_verified/owner_accepted remain unestablished. No governed data changed or live rollback required. Existing unpublished source and receipts remain recovery evidence. All prior test processes terminal; this checkpoint starts none. No autonomous monitor.

Next bounded action: implement the concrete checker adapter and its actual registry Stop/accounting/receipt crossing within listed reply-child.ts/tests. Use only owned synthetic local processes/API/database for L1 evidence; real Darwin refusal must remain refusal. Require full exit plus stdio completion and retain the underlying operation after timeout, because ReplyHomeChecks removes its busy entry when that operation settles. Then independently review the exact combined slice. Keep source approvals separate from effect-batch approval and product acceptance.
