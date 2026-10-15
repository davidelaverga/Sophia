# CON-01 takeover 75 — controller ordering and composition audit

Codex remains sole implementer/operator. Source-only renewal expires 20:00 Rome on 14 October 2026; no operational authority changes. Published HEAD457053b3fe619631f0d2e2fcc1e3edc98cfc5348/treeec71aa3a83e6208ff559d075a881b374fdb8593c independently read from Git. Current bridge still rejects all CON commands. Handoff74 pins unchanged. This checkpoint changes documentation only; independent composition audit complete, no active hold or reviewer resources.

## Ordering evidence and correction

The actual ControlBridge.dispatch implementation was exercised with actual ReplyChildren/ReplyAdmission and an explicitly substituted proposed execute branch. A held synthetic claim, followed by Stop, demonstrated both alternatives: awaiting executeCreate prevented Stop fencing before the claim response; retaining its promise and returning immediately allowed Stop to abort the claim before its response. Both cases made exactly one claim and zero spawns/provider calls. Finite admission/receipt bounds and explicit disposal settled the fixtures. The probe ran twice, exit0; source and dist were not modified. Private probe/result: controller-order-20261014-1303 under the takeover operator journal.

This proves the proposed queue composition, not an installed controller. The test must be moved onto the real integrated execute path when implemented, and expanded to held readiness/go and disposal. An injected arbitrary controller is not serving integration evidence.

The independent reviewer identified an important precision correction: Q7 section6 explicitly permits Stop waiting behind create for bounded claim+ready+go time. Handoff73's P1 phrasing overstated that as a contract violation. Prompt fencing by retaining asynchronous create work is a stronger implementation choice within the same authority, not evidence the frozen contract forbade bounded waiting. Handoff73 is corrected; current production behavior remains unqualified/disabled.

## Source assembly requirements

Use authenticated hello project identity, the actual bridgeInstanceId lease, and validated command resource identity. Never substitute ownerResourceRef for resourceId or invent hello.leaseId. Dedicated ServiceTransport.receipts acknowledgement must remain distinct from the goal queue's best-effort flush. The command branch must reserve ownership synchronously, retain asynchronous admission/Stop failures, avoid raw diagnostic disclosure, and preserve existing goal dispatch/hooks. Disposal must fence owned reply work before acknowledging shutdown. Missing configuration remains disabled before claim.

Concrete transport/admission/launcher/start-packet wiring is still absent. ReplyChildren currently supplies injected factory/callback boundaries; adding another arbitrary factory would only move those boundaries. Complete runtime qualification additionally needs selected route/profile/read-list, supported credential lifecycle, recovery and retirement. Pending handoff27 original unit and handoff36 poll supersession remain unapplied; Q8/shared-main integration stays held. No incomplete source path may be labelled production-ready.

## Independent composition result

Full receipt read: `independent-controller-composition-20261014/review.safe.json`. The useful next slice constructs the controller after authenticated hello, with project/unit/private instance identity and a single resource latch from the first authenticated validated CON command. It owns ReplyChildren, dedicated ServiceTransport receipts, concrete claim/go/observation/reservation/settlement calls and the original create identity/unit. Only the owned-launch boundary is a fixture seam. A prebuilt registry or arbitrary authority callbacks would not establish this integration.

Constructing after hello requires a shutdown race guard. All unresolved CON hello bindings remain reported unrecovered and block new capacity until reconciliation; a fresh hello cannot grant new slots. Stop and create install ownership synchronously and retain their promises, with fixed error codes and no raw diagnostic fallback. Inspect and retire are not already complete: no checked cleanup or free slot may be invented. Production index stays default-null until qualified host/route/profile composition. The first combined tests must cover dispatcher, actual transport and owned API/PG, wrong identities, lost receipts and shutdown during hello/admission.

The source-owned launcher/fd3/start adapter is the immediate dependency for this combined slice. Pending27 blocks erased-payload admitted-ordinal recovery, not the retained live create unit; pending36 blocks live supersession qualification; Q8/target approval remains separate. No unlisted constructor, goal acknowledgement or poll edits follow from this audit. Reviewer performed no execution or writes and holds no resources.

## Reviews, operations and next action

Actual GitHub PR273 comments refreshed this checkpoint: automatic6144338846 still covers457053b3fe only, no major issues. Earlier ACL findings remain historical with their corrected heads; no automatic clearance applies to unpublished Step3/4. No push, merge or artifact recording performed.

Setup/human-chat and Ask batches remain unapproved/not-ready; no hosted schema/configuration, deployment, accounts, grants, credentials or provider execution. Product-provider use0; coding consumption unknown. Last browser evidence remains Handoff73 owner shell/Resources Coming, not designated immutable cohort or serving tuple. Acceptance ledger remains18partialL1/3passedL1/15not_run; no broader product acceptance. Governed data untouched; no live rollback needed. Local unpublished source and receipts remain recovery evidence.

Next bounded action: implement the concrete trusted bridge/controller crossing within listed files with actual dispatcher tests. Keep runtime activation disabled until its dependencies and separate operation gates pass.
