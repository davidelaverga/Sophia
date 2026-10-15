# CON-01 takeover42 — child terminal classification and passive completion

Same mission, Codex sole author, Claude stopped. Handoff24 source-only approval remains through 2026-10-14T10:00Z/noon Rome. This component changes only the listed reply-child source and its tests. Pending27/36, Q8/profile, current-main/shared integration and operation authority remain separate and unapplied. Before-write record: issue198/6158857786.

## Exact candidate and behavior

Published draft PR273 remains457053b3fe619631f0d2e2fcc1e3edc98cfc5348, treeec71aa3a83e6208ff559d075a881b374fdb8593c. Unpublished child source SHA256bad66cae7f89e632a747655c65cbe7a41356a957584036d53908a97a17d540cf; testse21b195e3cbbcf614c2068c7665363b6dcc28b1826d76df9f6f6872809b00c10. Plugin, bridge, wire, SQL, profile and recorded artifacts unchanged. Before copies and author evidence: private terminal-child-20261014-0330.

The child retains one first-cause terminal outcome, including events before the caller subscribes. Timeout is recorded at the actual autonomous deadline, not inferred later from the clock. Valid completion requires intact completed output, parsed EOF and classified clean exit. It seals/waits the existing accounting ledger passively, preserving full capture without Stop or fencing. A completed terminal observation is not capture HTTP acknowledgement, publication success, physical settlement or deletion proof.

Invalid output, unfinished EOF and launcher/control failures use the original Stop/accounting barrier. Launcher exit with fd3 still open arms a wakeup at the existing shortened settlement deadline; timeout never fabricates EOF. Explicit Stop yields stopped, disposal rejects observation, and failed accounting remains unresolved. Replay joins the original terminal promise and cannot reset the deadline or allowance. This slice does not connect autonomous failed receipts to admission/registry or the serving bridge.

Independent design review requires the future failed receipt to follow an actual positive delivered-stage acknowledgement (or an explicitly ordered batch). Starting two POSTs in order is insufficient to guarantee their SQL commit order. Preserve the immutable delivered sender, all individual ACK facts, original settlement barrier and explicit Stop/disposal suppression.

## Review finding and correction

Initial candidate2ef0fc16/2493a79e passed209 focused tests but independent probes found P2: after valid completion with capture HTTP held, a late launcher, stdin or fd3 error fenced the relay and wrote Stop. Each independent reproducer failed1/cancelled0; issue198/6158919964 records expected/observed behavior. That candidate was not cleared.

Corrected source retains error consumers but does not restart Stop on launcher/control diagnostics after actual exit. A relay completion-classified latch suppresses only subsequent stream-error invalidation of already-completely-parsed output. Preclassification stream failures still fence. The new regression covers all three late-error sources plus the incomplete-tail negative. These rules do not qualify physical stream/process/home cleanup.

## Validation and external checkpoint

Author211 focused tests pass; ordinary2569 pass/70 existing skips, zero failures/cancellations. Bundle build, whole-file structural audit and git diff --check pass. Five compiled mutations each fail a bounded adverse regression with zero cancellations: completed Stop, missing held-tail wakeup, missing timeout cause, late process Stop and late fd3 invalidation. Dist restored. Initial fixture mistakes (answer without reservation and an unadvanced fake-clock wakeup) were corrected without weakening assertions.

Independent corrected-candidate review cleared211 focused tests and four separate crossings: original launcher, stdin and fd3 late-error reproducers now preserve draining/full capture without Stop; completed bytes plus EOF before observed exit still fail on fd3 error and retain the original barrier. Dist/source equality and structural audit pass, hashes unchanged, no remaining actionable issue in this child-only slice. Source hold released. Receipt: private independent-step3-terminal-child-20261014/after-review.safe.json. All independent runners are terminal, held capture promises released, owned streams disposed and boundary fake-clock timers zero; no HTTP/PG/provider/native probe or repository edit by reviewer. Component locally_verified and independently reviewed; no whole-candidate or push clearance is claimed.

Fresh main is ceda3f3eb298a0021ca81d917a1db3ead3c637f4, tree77c2e9dbc9e8006d2b4ce486530e735ad429b2c3, including #304 Goals overview. Its task/decision address selection and served planning overview must be preserved with #287/#299–301. Read-only merge-tree against published HEAD still yields11 conflicts and excludes dirty Step3; no resolved candidate or accepted base. PR199/6158912899 records the new integration dependency for Luis. No new handback found. PR273's automatic review6144338846 was reread and covers only published457053b3fe, reporting no major issues. No push occurred; a future push requires independent whole-diff clearance and its own actual automatic review.

## Operations, acceptance and next action

OP0002r6 setup/human-chat and OP0001r4 Ask remain unapproved/not ready. No hosted migration/config/deployment, account/member/grant/connection action, external credential access/transfer, provider/subscription execution or product spend. Synthetic local child/stream tests only; product provider use0, assistant/reviewer compute unknown. No new database/server/browser resources in this slice. Before-source snapshots and published HEAD remain available for source recovery; nothing deployed and no hosted rollback ran. Eventual rollback must preserve governed data, erasure and cumulative/uncertain accounting.

Serving app/API/runtime tuple remains unverified; no actual signed-in two-account application acceptance. Ledger unchanged:36 cases,18partial_L1/3passed_L1/15not_run; CON01-A30not_run. Only component local verification is established here. No whole-source_ready, operational authorized, deployed, app_verified or owner_accepted promotion. Ask stays disabled, broader product and other missions remain open.

Next bounded action: connect the retained terminal outcome to failed-after-delivered reporting with actual delivered ACK ordering, original accounting settlement and Stop/disposal suppression. Qualify a delayed delivered commit and failed-accounting zero-POST crossing. Recovery/retirement/physical host and bridge assembly remain owed; no monitoring task or promise of out-of-session work.
