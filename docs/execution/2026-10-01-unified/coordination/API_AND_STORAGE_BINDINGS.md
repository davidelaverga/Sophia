# API and storage binding decisions

## 1. Extend existing use cases

Member actions remain under the current authenticated Sophia API and their shared media/tool use cases. The application, not model arguments, derives actor/project, input mode, speaker epoch, controller generation, current source/decision revisions, resource grant and allowance. Extend existing generated contracts by a fresh reviewed amendment; do not hand-edit only the browser types.

Proposed new member actions are commission work, request progress review, send guidance, read required actions, resolve a work decision, hold/stop/resume and request handover. Bind their concrete routes to repository conventions in SCM-01/03/04. The plugin-only routes in the Paperclip integration specification are separately declared new APIs; they are not browser proxies.

One action result has explicit disposition, stable operation/work identity and observed evidence. Recommended dispositions are `recorded`, `queued`, `conflict`, `denied`, `unavailable`, `outcome_unknown` and `settled`; do not force them into an old success boolean. Existing contracts that use equivalent words keep their vocabulary through a documented mapping.

## 2. Minimum new record families

| Family | Keep in Sophia | Keep in Paperclip | Do not duplicate |
|---|---|---|---|
| Commission | Authenticated intent, stable operation and binding | Actual operational issue | Independently editable task status |
| Work contract | Mission/source/criteria revisions and accepted changes | Versioned authorized input/ref | Private personal context |
| Assignment mapping | Work/attempt/resource/controller identity | Assignee/run/checkout/dependencies | A second native session launcher |
| Peer input | Stable content/source reference and authority, or plugin namespace receipt linked to it | Wake/continuation when required | A courier issue for every active message |
| Resource | Owner enrollment, contribution policy and native binding | Opaque configured resource/adapter mapping | Provider authentication files |
| Quota | Owner/window observation and contribution/commitment data | Optional bounded operational metadata | A fake team percentage or fungible credit wallet |
| Decision | Existing mission family plus new typed operational target | Required-action/review path with next owner | Two independent accept/reject authorities |
| Artifact | Canonical bytes/source/version/publication and acceptance | References/metadata | Second product artifact store |
| Learning | Versioned proposal/evidence/promotion | Optional managed work performing evaluation | Hidden automatic prompt mutation |

Use existing Sophia tables/types where they genuinely fit. New table names are allocated in the source PR after schema inspection; this pack does not invent deploy-ready SQL for a live database.

## 3. Peer/control message delivery

Persist original user/peer content (or a governed source reference), causal message ID, ordered part identifiers, target work/attempt and current controller/grant/eligibility revisions. Separate:

```text
recorded -> dispatching -> upstream_accepted -> native_input_observed
                                             -> result_observed -> checked
```

Support denial, supersession, cancellation and unknown outcome at each appropriate stage. The implementation may expose fewer native stages when the source cannot prove them. Preserve unsupported fields as unknown, not simulated acknowledgements.

If an active attempt exists, deliver to that attempt; if none exists, request one normal eligible operational wake. Link wake to the original input identity so a timeout retry cannot later consume it again. An FYI may be recorded without waking. Queued messages from an old epoch are retired on Stop; Resume re-admits only explicitly retained eligible input under the new epoch.

## 4. Revocation and forgotten sources

Reuse the existing exact withdrawal preview and source-eligibility closure. Before context leaves Sophia, resolve the current eligible manifest. Track which operational/native packets depend on each source. On narrowing, refuse future reads, invalidate projections where needed and fence affected attempts before further use/publication.

Native logs already containing revoked material may need a clean new session with an eligible handover. Do not resume the raw old log because it is easier than rebuilding context. Report whether provider-side or owner-side stored copies can actually be removed; application deletion is not proof of universal erasure.

## 5. Required-action resolution

Validate actual owner, project membership, native session/child, request fingerprint, status/expiry and operation grant at resolution time. Resolve the exact request only, then observe the runtime. A request accepted by the endpoint is not proof of native execution resumption. A lost response is reconciled by reading the same request, never by blindly answering a replacement.

## 6. Outbox and projection consistency

Sophia's accepted intent and local outbox append share its transaction. Paperclip core changes and plugin-namespace bookkeeping may not share that transaction. Use a stable operation key and proven create/update reconciliation. Do not write runtime multi-statement SQL or cross-core tables to evade plugin restrictions. [P01]

Keep last observed upstream version/cursor and a separate observation timestamp. Stale events cannot overwrite a newer control generation or candidate. Snapshot/replay works while optional tracing is unavailable. Periodic read reconciliation can repair missed notifications without waking a model.

## 7. Review activation is an event, not a circular dependency

The work-plan contract explicitly identifies `activation.kind = candidate_ready` and the producing work ID. This is a Sophia plan field, not a claimed Paperclip issue field. The plugin creates/activates the actual review issue only after the trusted candidate-ready publication event, under a stable candidate/reviewer operation identity. It does not create an immediately runnable unblocked review at plan time. An existing planned review may stay in backlog until that same event is reconciled.

The implementation's final acceptance can wait on the review; the review must not also depend on the implementation reaching Done. New candidate versions create new review obligations or an explicitly version-bound continuation, never apply an old verdict to new bytes. Test duplicate candidate events and observer restart so they create one review obligation, not a review swarm.


Private assistant jobs, messages and packages are not shared commission records. PA-01/02 add owner-only operations and a separate human publication, using current source/byte mechanisms but no private title/context in a team company. The template/MCP client has no publish-to-team operation.
