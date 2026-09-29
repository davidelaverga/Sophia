# SMC-M01 contract binding (G1)

**Frozen at G1 on 2026-09-28** against `main` `c683e6e`. It binds the mission's target semantics ([M01 §5–§9](../missions/2026-09-27-companion-research/missions/M01_MISSION_COMPANION.md), [contract bindings](../missions/2026-09-27-companion-research/shared/CONTRACT_BINDINGS.md), [prompt loading](../missions/2026-09-27-companion-research/shared/M01_PROMPT_LOADING.md)) to the code that actually exists. The six model-facing names and the v1.1 prompt and skill bytes are fixed by the pack. Everything below them is an internal binding: a later change is recorded here, with its reason, in the commit that makes it.

## 1. What already exists and is reused

| Mission concept | Existing record or code (read at `c683e6e`) | M01 use |
|---|---|---|
| Accepted mission | `sophia.projects.mission_revision`, `sophia.project_revisions(frame, accepted_by)` (0001). Every project starts at revision 1 with frame `{}`, accepted by its creator | Unchanged. An accepted mission change appends revision N+1 and moves `mission_revision` in the same transaction. `{}` is the **absent** marker, never proof of an empty project |
| Proposals and decisions | `sophia.decisions(kind, state proposed/accepted/rejected/superseded, body_source_id, accepted_by)` (0001). No code writes it yet | Proposals **are** decisions rows (kinds `mission`, `constraint`, `lesson`), extended by 0018 with who proposed, the turn, the base mission revision and who decided |
| Source-backed text | `sophia.source_objects` + `sophia.source_texts`, `sophia.put_text_source` (0012) | Every note, proposal body and correction is a project source with its SHA-256. A withdrawal erases the text and keeps the tombstone |
| Source lineage | `sophia.source_dependencies` (0001) | A correction's source derives from the corrected one |
| Trusted speaker | `sophia.exchange_inputs` + `sophia.media_tool_speaker` (0013): an input epoch binds exactly one actor | Every voice write is bound to the calling input epoch's actor, re-checked inside the write function. No model-supplied name or actor id is used |
| Roles | `sophia.is_member`, `sophia.can_edit`, `sophia.is_admin` (0002, 0010) | Writes: admin or editor. Note policy: admin. Own consent and own withdrawal: any active member |
| Events | `sophia.emit_project_event` / `emit_service_event`, SSE (0005, 0010, 0012) | Mission writes emit `mission.*` events, so the Studio and the bridge refresh |
| Eligibility | `sophia.projects.eligibility_revision` (0001) | A withdrawal narrows eligibility: it advances this revision, and the bridge rebuilds any live provider context (§6) |
| Work | goals, native tasks (`native_task_view`), `control_work` → `admit_goal_command` (0003, 0012) | Unchanged. A note never restarts work; a mission revision never touches a goal |
| Historical briefs | `draft_brief` jobs, `GET …/native-tasks/{taskId}`, `TaskCard`, result notices (0012–0016) | Kept readable and controllable. Only **new** admission is retired (§7) |

Not created: `packages/context/` stays S1-08's (unbuilt in [DESTINATION_MAP](../DESTINATION_MAP.md)). M01's minimal context compiler is the mission read model in `packages/persistence/src/mission.ts`, and nothing else.

## 2. The six model-facing operations

Names and order are exactly those of `prompts/M01_ASSETS.v1.1.json` (`model_facing_operation_names`). One declaration per name, no aliases, all `NON_BLOCKING` as today.

| Model-facing name | Bridge declaration (`apps/media-bridge/src/tools.ts`) | API handler (`apps/api/src/media-tools.ts`) | Use case / SQL |
|---|---|---|---|
| `project_status` | no parameters | `projectStatus` | `readMissionContext` (persistence) under the speaker's RLS, plus recent work and discussion from `readSnapshot` |
| `read_selected_source` | exactly one of `taskId`, `contributionId`, `entryId`, `decisionId`; optional `cursor` | `readSelectedSource` | `readSourcePage`; reading a pending proposal by voice **presents** it (`sophia.present_mission_proposal`) |
| `record_mission_note` | `kind`, `epistemic`, `text`; optional `relatedEntryId`, `goalId`, `decisionId` | `recordMissionNote` | `sophia.record_mission_entry` |
| `propose_mission_change` | `kind` (`mission`, `constraint`, `lesson`), `statement`; optional `purpose`, `destination`, `origin`, `supersedesDecisionId`, `supportingEntryIds` | `proposeMissionChange` | `sophia.propose_mission_change` |
| `decide_mission_change` | `proposalId`, `proposalRevision`, `decision` (`accept`, `reject`) | `decideMissionChange` | `sophia.decide_mission_change` |
| `control_work` | unchanged (`taskId`, `action`) | unchanged | unchanged (`admit_goal_command`) |

`start_brief` is removed from the declarations, the contract's `MediaToolCall.name` and the handler map. No research, PDF, lead, builder, scheduler or monitor declaration exists.

**The handler map is the single source of names.** The API's handlers are a record keyed by the contract's `MediaToolCall['name']` union, so a missing handler fails typecheck. `GET /v1/media/tool-surface` returns those names; the bridge activates the guide only when they equal its declarations (§5).

## 3. Wire contract: amendment `A08-mission-ledger`

The only contract writer for this mission. Types and validators are regenerated with `pnpm --filter @sophia/contracts generate` and checked by `pnpm contracts:check`.

**Media (bridge ↔ API):**
- `MediaToolCall.name`: the six names above. New optional `utterance` (integer ≥ 0): how many holder utterances the bridge has forwarded in this provider session when the call arrived. The decision binding uses it (§4.3).
- `MediaToolResult.status`: adds `committed`, `proposed`, `conflict`, `denied` and `unknown` to `ok`, `admitted`, `refused`, `clarify` and `error`. `control_work` keeps its current statuses.
- `MediaAssignment`: adds `missionRevision`, `ledgerRevision` and `eligibilityRevision` (the project's).
- New `GET /v1/media/tool-surface` → `MediaToolSurface { names }`, on the exact media allowlist (`MEDIA_ROUTES`), media capability only.

**Member (Studio ↔ API)**, all under the member's own token and RLS, writes with `Idempotency-Key`:

| Route | Schema | Who |
|---|---|---|
| `GET /api/v1/projects/{projectId}/mission` | `MissionContext` | any member |
| `POST …/mission/entries` | `MissionEntryRequest` → `MissionReceipt` | admin, editor |
| `POST …/mission/entries/{entryId}/correction` | `MissionCorrectionRequest` → `MissionReceipt` | admin, editor |
| `POST …/mission/entries/{entryId}/withdrawal` | `MissionWithdrawalRequest` → `MissionReceipt` | the entry's actor, or an admin |
| `POST …/mission/proposals` | `MissionProposalRequest` → `MissionReceipt` | admin, editor |
| `POST …/mission/proposals/{proposalId}/decision` | `MissionDecisionRequest` → `MissionReceipt` | admin, editor with current rights |
| `PUT …/mission/note-policy` | `MissionNotePolicyRequest` → `MissionNotePolicy` | admin |
| `PUT …/mission/note-consent` | `MissionNoteConsentRequest` → `MissionNotePolicy` | the member themself |
| `POST …/native-tasks` | unchanged request; now **410** `native_task_retired` | nobody (§7) |

## 4. Schema: migration `0018_mission_ledger.sql`

Reserved for M01. 0001–0017 are not edited. One migration; a follow-up, if review needs one, takes the next free number after recording it here.

### 4.1 Records

| Record | Purpose | Key fields |
|---|---|---|
| `projects.ledger_revision` (new column) | Monotonic view revision for notes, proposals and decisions, separate from `mission_revision` | starts at 1 |
| `sophia.mission_entries` | One observation, expectation, outcome, blocker, explanation hypothesis, scoped lesson candidate or continuity note | `kind`; `epistemic` (`reported`, `observed`, `inferred`); `state` (`current`, `superseded`, `withdrawn`); `source_id`; `authored_by` (`sophia` for a voice paraphrase, `member` for typed text); `actor_id` (whose admitted turn it interprets, or who typed it); `origin` (`voice`, `studio`); `exchange_id` + `input_epoch` (voice only); links `related_entry_id`, `supersedes_entry_id`, `goal_id`, `decision_id`; `observed_at`, `recorded_at`, `ledger_revision` |
| `sophia.decisions` (new columns) | A proposal is a decisions row | `proposed_by`, `origin`, `exchange_id`, `input_epoch`, `base_mission_revision` (mission kind), `frame` (mission kind), `supersedes_decision_id`, `supporting_entry_ids`, `decided_by`, `decided_at`, `decided_via`, `created_at`, `ledger_revision` |
| `sophia.mission_confirmation_targets` | The single eligible confirmation target of one exchange | `exchange_id` (PK), `decision_id`, `decision_revision`, `input_epoch`, `actor_id`, `connection_generation`, `utterance`, `presented_at`, `expires_at` (5 minutes) |
| `sophia.mission_note_policies` | Project setting: `capture` `off` (default, also when no row) or `automatic` | `revision`, `changed_by`, `changed_at` |
| `sophia.mission_note_consents` | A member's own acknowledgement: `accepted` or `declined`; no row means unset | `revision`, `changed_at` |
| `sophia.mission_requests` | Idempotency for every mission write: same actor + key + semantic request returns the stored receipt; a changed request with the same key is refused | `operation`, `semantic_request`, `receipt` |

Original expectations and baselines are never rewritten: an outcome links to its expectation, and a correction appends a new entry that supersedes the old one, which stays readable as history.

### 4.2 Write rules (all `SECURITY DEFINER`, project row locked first, authority re-checked under the lock)

- **Record a note.** Admin or editor. By voice, only when the project's capture is `automatic` **and** the speaker's own consent is `accepted`; the function re-verifies that the input epoch binds this actor in an open exchange of this project. Typed notes from the Studio need no capture policy: they are the member's own words, saved by their own action.
- **Propose.** Admin or editor. A `mission` proposal records the current `mission_revision` as its base. By voice, it becomes the exchange's confirmation target, presented to the calling speaker at the calling utterance.
- **Decide.** Admin or editor, at the moment of the decision. The proposal must still be `proposed` at the expected revision; a `mission` proposal's base must still be the current mission revision, or the answer is a conflict, never last-writer-wins. Accepting a `mission` proposal appends `project_revisions` and moves `mission_revision` atomically and supersedes the previously accepted mission decision; accepting a proposal that names `supersedesDecisionId` supersedes that decision.
- **Correct.** Admin or editor; the entry must still be `current`. Appends a new entry that supersedes it.
- **Withdraw (forget).** The entry's own actor, or an admin. The entry becomes `withdrawn`, its text is deleted from `source_texts`, its source is marked `deleted` and ineligible, and `eligibility_revision` advances. Not a UI hide: the text is gone from the database, and nothing reads it again.
- Every write advances `ledger_revision` and emits a `mission.*` project event. Grants: `EXECUTE` on these functions to `sophia_api` only; `SELECT` on the new tables with members-only RLS. No table write grant.

### 4.3 The confirmation binding (M01 §6.3, cases T08)

A voice decision commits only when **all** of these hold, checked by the database in the decision's transaction:

1. The proposal is the exchange's current confirmation target (set by `propose_mission_change` or by reading the pending proposal with `read_selected_source`). A later presentation replaces it, so there is only one.
2. The caller is the same speaker, in the same input epoch, as the presentation. A floor handoff moves the epoch, so a speaker switch needs a new presentation.
3. The call's `utterance` is greater than the presentation's, in the same provider session (`connection_generation`). The speaker must have said something after the proposal was put to them; a decision in the same model turn as its proposal is refused. A cold reconnect starts a new provider session, so it needs a new presentation.
4. The target has not expired (5 minutes), and the proposal's revision equals `proposalRevision`.
5. The caller is admin or editor now.

The host checks identity and versions; whether the words meant yes or no is the model's reading, and an unclear answer is the prompt's to clarify. No `confirmed: true` parameter exists. A Studio decision is a manual action by the member and needs none of 1–3.

### 4.4 Note policy (M01 §6.1)

`project_status` and `GET …/mission` report, for the person asking: `capture`, their consent, `automaticNotes` (capture `automatic` and consent `accepted`), `explicitSelectedNoteSave` (the same condition: this candidate has no separate confirmation-backed save while capture is off), `exactTextRetention: false`, and `transientBuffer: { turns: 0, bytes: 0, seconds: 0 }`.

**No transcript is buffered or retained in this candidate.** The bridge still discards input transcription text, as it does today. Notes are Sophia's paraphrases of admitted input, bound to the turn; they are labelled `sophia_paraphrase`, never exact quotes. Capture is off for every project until an admin turns it on, and each member's own consent is required for notes from their turns. Nothing is enabled rollout-wide.

## 5. The v1.1 prompt and skill in the bridge

| Item | Binding |
|---|---|
| Content home | `apps/media-bridge/src/content/mission-guide/`: `M01_SYSTEM_PROMPT.v1.1.md`, `mission-lifecycle.v1.1.md`, `M01_SYSTEM_INSTRUCTION.v1.1.txt` and the release manifest `M01_ASSETS.v1.1.json`, each byte-identical to the pack. The bridge runs from the repository checkout (`node apps/media-bridge/src/server.ts`), so these files are in the deployed artifact |
| Loader | `apps/media-bridge/src/guide.ts`: strict UTF-8 reads, each component's SHA-256 and length against the manifest, assembly `prompt + "\n" + skill`, the combined SHA-256 and length, byte equality with the snapshot, and the manifest's operation names against `TOOL_DECLARATIONS`. Any failure throws at bridge start: the new revision never activates on bad assets, and there is no fallback prompt |
| Setup | `connectGeminiLive` passes the loaded instruction as `systemInstruction` on every connection, fresh, resumed and rebuilt alike. `systemInstruction(restored)` and its reconnect sentence are deleted |
| Activation | Before its first Live connection, a session checks `GET /v1/media/tool-surface`. If the API's names differ from the declarations, or the route is missing, the session reports voice `unavailable` with a reason and does not connect Google |
| Diagnostics | `guide.loaded` at start and `provider.setup` per connection log the prompt, skill and combined ids and SHA-256 only, never text |
| Continuity facts | A connection that restarted without its history says so in the `project_status` result (`connection.restoredWithoutHistory`), not by changing the static text |

## 6. Context freshness and narrowing

- **Refresh.** `MediaAssignment` carries `missionRevision`, `ledgerRevision` and `eligibilityRevision`. When the ledger or mission revision moves by a change the session did not make itself, the bridge sends one notice at the next idle boundary, as it does for a finished brief, asking Sophia to read `project_status` again before relying on earlier notes.
- **Narrowing.** When `eligibilityRevision` moves during an exchange (a withdrawal, or any other eligibility change), the bridge stops the current output, drops its resumption handle and reconnects cold with the same static instruction. The withdrawn text cannot come back through a resumed provider session, a cached tool result or the ledger read.

## 7. Retiring the brief ritual

| Surface | Change |
|---|---|
| Live tools | `start_brief` removed (§2) |
| Studio Converse | `BriefRequest`, the instruction input and the "Use in the brief" checkboxes are removed. The compact mission view takes their place; it is not a form |
| HTTP | `POST /api/v1/projects/{projectId}/native-tasks` answers **410** `native_task_retired` with a message saying what to do instead, before any write |
| Database | `sophia.admit_native_task` is kept. Existing tests use it to create historical tasks, and the runtime restores `sophia-brief-v1` work that already exists |
| Kept | Snapshot `work`, `GET …/native-tasks/{taskId}`, `TaskCard` (Converse and Work), Hold/Resume/Stop, the one-time result notice for a brief finished during an exchange |

## 8. Ownership reservations

| Shared item | Owner now | Note |
|---|---|---|
| `db/migrations/0018_mission_ledger.sql` | SMC-M01 | Reserved on #17. M02/M03 take numbers after it |
| `packages/contracts/amendments/A08-mission-ledger.json` and the regenerated `openapi/openapi.json`, `generated-types.ts`, validators | SMC-M01 | One contract writer at a time |
| `apps/media-bridge/src/{tools,live-session,room-session,service,guide}.ts`, `content/mission-guide/` | SMC-M01 | M02 does not touch the media bridge |
| `apps/api/src/{media-tools,app}.ts`, `routes/{media,mission,conversations}.ts` | SMC-M01 | |
| `packages/persistence/src/{mission,index,errors}.ts`, `packages/domain/src/errors.ts` | SMC-M01 | |
| `apps/studio/src/features/{conversation,mission}/`, `apps/studio/src/api/` | SMC-M01 | Luis reviews layout and interaction |
| `packages/dsh-bundle/`, `config/runtime-unit.json`, lockfiles | not M01 | M01 changes no dependency and no runtime identity |

## 9. Named acceptance cases → planned evidence

| Case | Planned evidence at source level (hosted evidence is G5) |
|---|---|
| T01, T16 | Prompt-level behaviour: not provable by unit tests. Hosted episode (G5) |
| T02 | `project_status` distinguishes `empty` (verified), `present` (draft, proposal or history, even without an accepted mission) and `unavailable` (read failed or denied): API tests |
| T03 | DB + API: a voice note is stored with its turn and actor and returned in a fresh read |
| T04 | DB + API: the same key and request returns the same receipt; a changed request with the same key is refused |
| T05 | DB: concurrent decisions and corrections against one revision; one wins, the other gets a conflict |
| T06 | API: proposal, rejected proposal, hypothesis (`inferred` explanation) and accepted decision are distinct in the context |
| T07 | API: a viewer and a revoked editor cannot propose or decide; the actor comes only from the input epoch |
| T08 | DB + bridge: same-turn decision, stale revision, replaced target, speaker switch, expiry and cold reconnect are refused; an answer in a later utterance commits once |
| T09 | DB + API: capture off, consent declined or unset, and a paused (guest) exchange write nothing |
| T10 | Bridge: input transcription text never reaches logs, tool calls or retained state; declared buffer 0 |
| T11 | DB: an outcome linked to an expectation leaves the expectation's text and time unchanged |
| T12 | DB + API + bridge: a withdrawn entry's text is erased and absent from every read; the bridge rebuilds cold on the eligibility change |
| T13 | API: a long source reads in pages marked `partial` with a cursor; notes are labelled paraphrase |
| T14 | API: `POST …/native-tasks` is 410; historical task read and control still work. Studio: no brief form |
| T15 | Existing bridge and exchange suites stay green unchanged, apart from the retired reconnect sentence |
| T17 | Studio at small viewport and zoom: manual check with the dev stack (G4) |
| T18 | Bridge: after a lost connection only committed notes appear in the next read; nothing is replayed from a summary |
| T19 | Bridge, against the real `@google/genai` SDK and a local WebSocket: the setup frame's `systemInstruction` equals the snapshot bytes, once, with the six declarations |
| T20 | Bridge: a missing or tampered asset throws at load; a tool-surface mismatch keeps the session from connecting Google |
| T21 | Bridge: fresh, resumed and cold-rebuilt connections all send identical instruction bytes; the skill appears once; no reconnect sentence |
| T22 | Declarations = manifest names = contract enum = API handler keys; no retired or future tool; a viewer's writes are refused |

## 10. Implementation notes against this binding (G2–G4)

The binding above stays the G1 record. Where the implementation differs, it is written here; none of these changes a model-facing operation name, the authored prompt or skill, the scope or an authority, so none needs a versioned amendment.

| Binding | As implemented | Why |
|---|---|---|
| §4.1 `decisions.frame` | The column is `proposal jsonb` (statement, purpose, destination, origin). The accepted frame is still appended to `project_revisions` | It holds a proposal until someone decides it; the name says so |
| §2 `record_mission_note` | Also accepts `correctsEntryId`: a voice correction takes the correction path (append and supersede) | Corrections by voice need the same append-only rule as typed ones |
| §4.2 Propose by voice | Needs the same gate as a voice note: capture `automatic` and the speaker's own consent `accepted` (`explicitProposals` in the policy view) | A proposal stores Sophia's paraphrase of the speaker's turn: T09's "nothing retained" applies to it too |
| §3 `MediaToolResult` | Statuses as listed in §3; the mapping from domain errors: `note_policy_denied`, `forbidden` and `invalid_state` → `denied`; `stale_revision`, `idempotency_conflict` → `conflict`; `confirmation_required`, `not_found`, `invalid_request` → `clarify`; `outcome_unknown` → `unknown`; anything else → `error`, with nothing claimed as saved | One vocabulary the guide's skill can act on |
| §6 Refresh | No spoken notice. The next tool result carries `recordsChanged` when records moved outside this conversation, cleared by the next `project_status` | Nothing is spoken unprompted, and nothing is added to the conversation outside the static instruction; the skill already re-reads status before relying on it |
| T18 | A lost tool reply is retried twice (250 ms, 1 s) under the same identity and idempotency key; a 4xx is not retried; a write still unconfirmed is reported `unknown`, telling the guide to read `project_status` | The write may have committed: the guide must read, not repeat |
| T17 | Checked in a real browser against the real API on synthetic dev data, not with `pnpm dev` (this container has no Docker for LiveKit) | Same code paths; rooms answer 503 without LiveKit, which the Converse lens does not need |
| §9 Studio view | Also shows the accepted constraints and lessons and the recent decisions | `project_status` gives Sophia both; the Studio view reads the same context |
| §4.4, §6 Note policy freshness | A change to note capture, or to a member's consent, moves `projects.ledger_revision`. Setting the same consent again changes nothing. A live guide therefore sees `recordsChanged` and re-reads the policy it speaks from | Codex's review of #18: otherwise the guide kept speaking from a stale policy until some other write |
| §7 HTTP retirement | `POST …/native-tasks` is `deprecated`. It declares only 401, 410 and 422, and no request body or key. Its generated type is `request: undefined; response: never`: the type generator gives an operation with no success response the type `never` | Codex's review of #18: the contract still promised a 202 receipt |
| §4.2 Decide: supersedes | A proposal may name only an accepted decision of its own kind in `supersedesDecisionId`, checked when it is proposed. Acceptance supersedes only a decision of the same kind. A constraint or a lesson therefore never retires the mission, whose projection only a mission acceptance moves | Codex's second review of #18 (P1): a constraint naming the mission marked it superseded while `MissionContext.mission` still showed it |
| §3 Member routes: CORS | The API's preflight answer allows `PUT`, which the note-policy and consent routes use; the hosted Studio calls the API from another origin | Codex's second review of #18 (P1): the browser would have blocked both calls |
