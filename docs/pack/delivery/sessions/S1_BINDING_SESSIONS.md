# Sprint 1 — exact integration sessions

These sessions implement the existing goals; they are not a new release or a prerequisite research campaign. Davide and Luis can work in parallel on different bounded source surfaces. The shared command/source/binding IDs are agreed first. A local reference test is useful, but cannot substitute for the live condition named below.

## A. S1-02: database and command path

**Owner: Luis; counterpart: Davide.** Read architecture 12, db/README and API bindings. Create a disposable Supabase/Postgres environment, install migrations in order, run the SQL scope/idempotency tests and add two-connection race tests. Keep the app on its non-admin login and verify transaction actor cleanup after pooled connection reuse. Implement getProjectSnapshot, followProjectEvents and admitGoalCommand. Show one real project to both accounts and deny a third. Disconnect after command commit; the retry must recover the same command without a second effect.

Exit with exact migration checksums, database version, test output, API commit and a recorded browser recovery. A SQL file existing is not migration evidence. Do not deploy to the old memory pilot database.

## B. S1-09: connect each owner and register all three resources

**Owner: Davide; counterpart: Luis.** Run the selected Omnigent server pin in accounts mode with separate admin and non-admin engineer accounts. Enable its device flow, fixed public origin and backend client secret. Each owner initiates Connection in Sophia and completes the fresh Omnigent login/consent. Native Claude/Codex sign-in happens on the owner’s host through the vendor, never in Sophia.

Verify actual request encoding: JSON for device authorize, form for token exchange. Store delegates encrypted outside the model/event plane. List only that owner’s hosts, select the actual repository and record the runtime binaries/catalog. Register Davide Codex, Davide Claude and Luis Claude, concurrency one each initially. An installed CLI is not a login test; one bounded useful call on every resource provides that evidence.

Exit with redacted connection/resource identities, installed versions, observed model settings, account/payer coverage and one result per route. No vendor-token screenshots or auth.json contents in the handoff.

## C. S1-09: launch a controlled assignment

Create a session-scoped native bundle with the approved Sophia instructions and a unique launch nonce, **without a host**. Read session_id from the multipart response. Install the assignment-specific HTTPS MCP server and its scoped credential on the session agent; verify only required tool names are exposed. Then launch the runner on the selected owner host with the chosen source worktree/base. Inspect actual base/source before first mutation. Subscribe/read state, then send the initial brief.

The owner delegation must satisfy the real host/session ownership checks; do not loosen them upstream. Simulate a lost create response and reconcile by exact launch nonce. Multiple matches require resolution, not choosing the first. Never generate a second paid session to hide an uncertain launch.

Exit with exact native session/runner/source bindings and real MCP use by both vendor routes. If a custom native bundle fails to boot, repair that selected path in this session; do not quietly replace it with a Claude SDK brain or desktop automation.

## D. S1-10: one coordinator and two useful workers

For the first episode, use Davide’s Codex as goal coordinator and the two Claude resources for independent bounded work or one implementation plus review. The technical lead owns the goal and scope; the coordinator owns the technical approach inside it. Each worker can ask a substantive question through peer_send; the reply reaches its native session without an additional lead-model paraphrase.

Record authored, dispatched, native-input-observed and result/check evidence separately. No model-generated ACK loop. Native Claude delivery timing is best-effort, so a question that cannot be consumed yet is visibly pending, not “read.” After proving this arrangement, exercise a reversed or solo arrangement on a suitable bounded goal; model hierarchy is not hardcoded.

Exit with one useful during-work question/answer, exact source handbacks and all three resources contributing without shared production mutation races.

## E. S1-09: owner permission and unknown resolution

Trigger a benign real permission request on Luis’s native resource. Sophia shows the actual session, operation and Luis as resolver. Resolve in the native surface. Record the actual available verdict; a native event lacking it becomes resolved_unknown, not accepted. Native login or network prompts outside the hook’s scope remain honest native-only conditions.

Also test a second member opening the card, stale request identity and a host that becomes unavailable. Opening a card does not answer it. A heartbeat that cannot observe the request says observation unavailable; it does not invent what Luis must approve.

## F. S1-03/S1-10: Stop racing delivery

Queue ordinary guidance, begin an external delivery and request Stop. First fence authority and retire unsent normal deliveries. Drain or reconcile already-started writes to the binding, then send native stop and inspect settlement. Omnigent’s stop is not sticky, so no late prompt is permitted after the final stop. A success HTTP response alone does not pass.

Test one lost send response: persist outcome_unknown and reconcile; do not retry the send. Test a late native permission resolution: it updates historical request state but cannot open another worker. External Hold uses controlled stop and retained project/source context; Resume is explicit after settlement, with a new current attempt/binding.

Exit with the exact race ordering, current epoch and native/process evidence. Unknown external effects stay unknown; do not report “fully stopped” until the selected settlement conditions hold.

## G. S1-04/S1-07/S1-12: actual Studio and source handoff

Implement the reference functions through the mapped React components and real API. Both founders join the project in different lenses. Generate a real UI source candidate; Luis edits a source component after taking the relevant work hold, and his unsaved draft survives a resnapshot. A stale worker result goes to conflict rather than overwriting it.

Pass exact source/assets/mocks/accepted behavior to the lead and native engineers. They integrate, build and return the complete application preview. The S1 supported preview is a team-owned, source-linked deployment with framing explicitly permitted for the Studio origin; fix preview-only configuration through the owner’s engineer rather than stripping security headers. Arbitrary third-party sites are not promised as embeddable. Remote-browser takeover is an extension of the browser/review work, not a bypass.

Review the application, capture source/version and target, request one change and one preservation constraint, and observe the actual revised candidate. Source-bound precise intent is required; general mechanically protected editing remains S2.

## H. S1-13: extract the real renderer kernels

Read architecture 14 and verify the three kernel blobs plus license from the actual legacy clone. Stage them with the extraction script. Adapt paths, confinement, structured outcomes, notes/language and PNG retention. Build the isolated render image, then create a useful report and deck with selected generated imagery.

Inspect actual pages/slides, not only file existence. Test a missing asset, escaping path, unavailable layout measurement and cancelled job. The output PPTX is image-based; the editable artifact source is HTML. Record this in the exported manifest and UI.

## I. S1-11/S1-14: founder release episode

Use Sophia to advance the real project: import selected prior context, speak, research, generate/select an image, build/edit a prototype, allocate all three engineers, handle one permission and one manual/periodic progress review, review the integrated app and apply one amendment. Return later and use a relevant lesson in the next brief.

End with accepted outcomes and unresolved limitations, actual model/provider/infrastructure usage where available, owner repair effort and release source identity. Do not fabricate quota data or force a mission change to demonstrate learning. Start actual use as increments work; no 50-session qualification gate is added.

## Session close record

Every session records goal ID and accepted revision, code base/head, changed files, executed checks and exact outputs, actual native IDs when present, unsettled external effects, applied/rejected decisions, resources used, next bounded task and the human who can accept it. A session chat is disposable; the goal and its evidence are not.
