# M01 — A mission-aware companion with durable project continuity

**Proposed PR title:** `feat(companion): mission guidance, project notes and returning-session continuity`  
**Mission ID:** `SMC-M01` · **Implementer:** Claude Code · **Operator/support:** Codex  
**Depends on:** R00 integrated foundation. **Does not depend on:** newer dsh release, research worker, full project lead, Mem0 or vector search.  
**Launch:** [Claude](../launch/M01_CLAUDE.md) · [Codex](../launch/M01_CODEX.md)

## 1. User outcome and definition of done

Two members speak with Sophia about an idea without a brief form. Sophia helps clarify the desired difference and the next useful step, records permitted project notes with attribution, and accepts a consequential direction only through an authorized explicit decision. In a fresh exchange she retrieves the current direction, relevant result/blocker and remaining uncertainty. Corrected material does not return as current truth through a stale summary.

The mission is done when this episode works on the actual hosted candidate, ordinary conversation remains natural, the privacy/control tests pass, and the source/operations evidence is recorded. A better prompt alone, a generated `mission.md`, or a note appearing in the UI without durable storage is insufficient.

## 2. Starting facts and reuse

At the inspected foundation, Live has a mostly operational prompt and four tools; the bridge does not retain room transcripts. The domain already contains `projects.mission_revision`, `project_revisions.frame`, decisions, source objects/dependencies, goals, commands and project events. Reuse them. The current brief compiler already reads accepted project facts; the companion's status tool does not supply equivalent mission understanding. [SRC-01, SRC-16, SRC-17](../SOURCE_REGISTER.md); [first-pass findings](../references/pass2/prior/Sophia_Mission_Companion_and_Research_Ledger_v0.1_2026-09-27.md).

Core SQL requires `accepted_by` on project revisions and a mission revision on work goals. An initial empty frame does not prove the team has articulated or accepted a substantive mission. Draft thinking belongs in attributed notes/proposals until accepted. Do not fabricate a mission simply to satisfy an internal foreign key. [SRC-16](../SOURCE_REGISTER.md#src-16)

## 3. In scope

Remove the brief-specific primary UI and new public brief-creation affordance; add a versioned mission-lifecycle skill and capability-aware guide policy; implement minimal source-backed notes/proposals/decisions; compile current mission context; add a compact mission view and correction controls; prove fresh-exchange recall and relevant source invalidation.

Historical brief records, existing work controls, source access, layout fixes, participant attribution, room guest fences and optional typed/manual interaction remain. During the interval before M03, Sophia truthfully has conversation/mission capabilities but does not offer background research or a non-existent project lead.

## 4. Explicitly outside this PR

No global memory migration, private-memory import, raw audio archive, automatic full transcript storage, ambient team-listening mode, generalized knowledge search, model/provider migration, complete text-agent implementation, automatic roadmap manager, new renderer, research tools, wake-word detector or full cognitive-modulation controller. Preserve extension seams without implementing these products indirectly.

## 5. Domain design

### 5.1 One authoritative ledger

Implement a mission-ledger read model over canonical project data. Markdown export is generated and revision-labelled, not independently writable truth. The UI and guide consume the same application read service, under the same audience/eligibility checks.

Retain mission, work goal, session focus, attempt and artifact as separate concepts. A lifecycle intervention is per focus; it is not a global project phase or authority to change work.

### 5.2 Minimal new records

First map current tables/contracts. Add only the missing records in new append-only migrations:

| Record | Required purpose |
|---|---|
| Mission entry | Source-backed observation, expectation, outcome, blocker, explanation hypothesis, scoped lesson or session continuity note. |
| Entry linkage | Related goal/source/earlier expectation, superseded entry and supporting decision. Preserve original expectation and baseline. |
| Ledger revision | A monotonic view revision for note/proposal changes, separate from accepted `missionRevision`. Ordinary notes must not invalidate every work goal as a mission pivot. |
| Note-policy state | Project setting plus applicable participant acknowledgement/current capture scope. No rollout-wide implicit consent. |

A concrete implementation may use one `mission_entries` table and a compact project policy/revision extension. Do not duplicate existing `decisions`, `project_revisions`, source text or task-state tables. Accepted mission changes append `project_revisions` and advance current mission revision atomically. Accepted lessons/constraints use the existing decision machinery or a clearly linked decision kind.

Every entry binds project, actor or machine author, source/version, entry kind, epistemic status, observation time, recorded time and optional supersession/link. Preserve `reported`, `observed` and `inferred` separately from `proposed`, `accepted`, `rejected` and `superseded`. A majority of mentions is not consensus, and the floor holder is not every teammate.

### 5.3 Authorization and conflict rules

Reuse active membership and current project authority. Initial default: admin/editor may write their own attributable project notes and propose changes; viewers may discuss/read and submit an ordinary contribution under existing rules, but cannot commit accepted state or control work. Whether a viewer contribution becomes a retained note follows the enabled note policy; never silently upgrade that role.

An admin/editor with current decision rights may confirm a specific project proposal. The UI records who accepted it; do not label it unanimous team agreement. A disputed proposal remains visibly disputed. Any stronger decision policy already present wins; do not loosen it to match this default.

Commands carry expected ledger/mission/decision revisions where relevant and an idempotency key. Server checks actor, audience, eligibility and current revision in the transaction. Same identity + same semantic request returns the existing receipt. Changed payload with the same key is rejected. A stale-base edit returns a conflict, never last-writer-wins prose replacement.

New grants/RPCs are narrow. Recheck reads and writes through the real application role, not just the migration owner. Never grant broad table writes to make tests pass.

## 6. Voice notes without silent transcript recording

### 6.1 Enable an understandable project-note policy

Provide visible wording such as “Sophia keeps shared project notes during this exchange.” Recording is off until the project/participant policy is satisfied. A participant may decline retained notes and still use permitted conversation. A mixed or changed audience is handled by the existing restrictive room policy; do not assume every new participant agreed.

No raw audio is retained. Input transcription already supplied by the current Live route may be buffered transiently for attribution/correction only within the enabled scope. Bound and promptly clear that in-memory buffer on expiry, End, consent change, handoff where required and recovery. Do not create a general transcript service in this PR. Declare actual buffer bounds in configuration and test them; initial proposal: at most two recent admitted turns and 32 KiB, maximum five minutes, whichever expires first. These are proposed caps, not a promise that provider-side retention is erased.

### 6.2 Ground notes in actual admitted input

Reuse current trusted turn/speaker/input-epoch attribution. A note-writing tool is automatically bound to an eligible admitted turn; a model-supplied person name or actor ID is never trusted. Cross-turn/cross-person claims must refer to an existing source/note with real provenance or be marked unverified, not retroactively assigned to another member.

A paraphrased note is explicitly a Sophia-authored interpretation of admitted input. Its source is the saved note and trusted turn metadata; it is not an exact transcript or proof that the speaker used those precise words. Exact quotes require actual retained selected text under the note policy; otherwise use paraphrase. A missing transient turn must return `source_unavailable`/clarification, not fabricate one.

The smallest implementation may retain only paraphrased project notes plus source/turn metadata. The metadata must not expose raw participant speech in public logs. An explicit request to save a chosen note may be served by a confirmation-backed path even when automatic relevant-note capture is off.

### 6.3 Consequential decisions need a bound proposal

A routine note does not require a question every time. An accepted mission revision or consequential constraint does:

1. Create a proposal with immutable content/source hash and a server-issued ID/revision.
2. Present or read back the proposal's material meaning; maintain one eligible confirmation target per relevant interaction.
3. Bind a clear affirmative/negative utterance or manual action to that exact proposal, current actor and current version. Unclear “yes”, multiple pending alternatives, changed proposal, interruption, speaker handoff or an expired target requires clarification.
4. Commit through the decision operation only when permission and confirmation checks pass. A model parameter saying `confirmed: true` alone is not evidence.
5. Return and announce the durable receipt. “I've saved that” follows commit, not prediction of success.

Test negation, corrections and English/Italian/Spanish confirmations. The host handles identity/version checks; semantic interpretation is not presumed infallible. A failed or ambiguous interpretation must not default to acceptance.

### 6.4 End, revocation and cleanup

Persist each important authorized note as it is made; do not depend entirely on a final session-summary model call. At End, close capture first, finish or explicitly fail already-admitted note writes, clear volatile input and emit a continuity view from committed records. A lost bridge can lose unsaved transient speech; disclose that instead of claiming complete memory.

Stopping note capture prevents new capture. Correcting/forgetting retained material is a separate action affecting its eligibility, derivatives and current model context. A source revoked after being loaded must not keep influencing a resumed raw provider session: stop/rebuild the affected context before further affected generation. Cleanup obligations survive restarts; do not implement deletion as a UI hide or promise deletion of another person's external copy.

## 7. Minimal tool and API contract

Names below are implementation targets; bind aliases to existing conventions in `CONTRACT_BINDING.md` before coding. Do not expose both names as duplicate capabilities.

| Operation | Model-facing behavior | Server behavior |
|---|---|---|
| Existing `project_status`, enriched | Read mission, recent relevant notes/decisions, active work, pending decisions and capabilities | Calls shared mission/context service; empty/present/unavailable distinct. |
| `record_mission_note` | Propose a meaningful delta with kind, text and existing references | Trusted turn/actor binding, allowed note policy, source-backed write and receipt. |
| `propose_mission_change` | Prepare a specific mission/constraint/lesson proposal | Immutable proposed source + decision ID/revision, no accepted-state mutation. |
| `decide_mission_change` | Accept/reject a specific presented proposal after a clear request | Verify decision rights, bound confirmation and expected revisions; commit once. |
| Existing `read_selected_source`, extended | Read exact eligible mission/decision/note source passages | Page bounded text; preserve source hash, locator, coverage and next cursor. |
| Existing `control_work` | Hold/Resume/Stop existing work | Preserve existing authority; note updates never implicitly restart work. |

Suggested member-facing route home: the existing project API with `/mission`, `/mission/entries` and `/mission/proposals` operations. Voice reaches the same use cases through `/v1/media/tool-calls`, not a second unrestricted DB route. If a new media payload/operation is required, add it to the exact authenticated allowlist and canonical contract; no broad `/v1/*` bypass. [SRC-17](../SOURCE_REGISTER.md#src-17)

Required read fields: `readState`, `missionRevision`, `ledgerRevision`, `eligibilityRevision`, accepted frame or absent marker, active constraints, relevant entries, pending decisions, work links, source references, excluded/missing descriptions, and actual capability availability. Required write receipts: committed/proposed/conflict/denied status, stable identity, resulting revisions and exact affected references.

## 8. Skill, prompt and context

Install [mission-lifecycle.v1](../skills/mission-lifecycle.v1.md) as versioned application content. It adapts the original six modes, removes numeric emotional bands, preserves disagreement and evidence, and does not force ordinary speech through an interview.

Compose four layers: stable guide identity; compact procedure; current authorized context packet; actual tool/capability description. The current Live model remains conversational. No second model paraphrases every reply. The same semantic policy can be consumed by a later/available text guide without building that route here.

For new exchanges, read current state before deciding whether this is a new mission. `empty` invites the idea; `present` offers a relevant continuation; `unavailable` states the read problem. Do not ask the team to start over because a cache, model handle or connection is new.

After accepted changes, refresh the current packet at a tested safe boundary. Prefer the existing supported read/notice mechanism initially. Passive `sendClientContent(...turnComplete:false)` may be probed here if needed, but no unrelated transport overhaul is required. If source/audience narrowing demands a clean context, reconstruct without the removed history; a prompt to ignore it is insufficient.

A proposed planning target is a compact packet rather than all project history. Mandatory accepted constraints and source freshness win over an arbitrary token target. Larger evidence is retrieved deliberately. Record packet/skill hashes and actual inclusion manifests with content-safe telemetry.

## 9. UI and migration away from briefs

Remove `BriefRequest`, the dedicated instruction input and brief-selection checkboxes from Converse. Hide/remove new `start_brief` declarations and new-admission affordances consistently, including direct API admission policy, so another stale client does not keep creating them unexpectedly. Return a descriptive unsupported/disabled-new-task result, not a success placeholder.

Keep historical tasks/results readable and their controls available. Retain `sophia-brief-v1` and restore support while any existing task depends on it. Do not rename old briefs, delete them, or stop them merely because the form disappeared.

Use one compact evolving mission view, with current direction, next focus, new observations and consequential pending decision. Empty fields need not become empty cards. Keep optional text and manual note/decision controls accessible; no typing is required in the primary episode. Do not replace the brief form with a mission form.

Preserve Luis's layout, light engine, dock, typography, reduced-motion behavior and local/shared focus distinction. History/corrections are inspectable without turning Converse into a permanent dashboard. At small screens and browser zoom, all content and controls remain reachable above/beside the dock.

## 10. Goals and evidence checkpoints

| Goal | Claude deliverable | Codex handoff | Completion evidence |
|---|---|---|---|
| M01-G1 Bind current source/contracts | File/schema crosswalk, scoped change plan, failing tests, note-policy proposal | Read-only actual baseline/RBAC/migration inspection | Existing records reused; exact field gaps identified. |
| M01-G2 Canonical ledger | Append-only SQL, narrow RPC/use cases, revisions, source/decision links | Hosted-compatible migration preflight; no application yet | Local API/DB tests: write/read/retry/conflict/denial. |
| M01-G3 Voice notes and guide | Trusted note attribution, confirmation protocol, skill/context assembly | Bounded independent race/negative review | Real tool path with no invented attribution or saved-state claims. |
| M01-G4 Mission experience | Brief removal, compact view, corrections, optional text, reconnect behavior | Authorized preview/test evidence as needed | First and returning mission episodes; layout/voice regressions. |
| M01-G5 Release and acceptance | Exact candidate PR, evidence table, release request | Apply approved migration/config/deploy batch; smoke/handback | Hosted two-person episode, source correction and actual tuple. |

## 11. Acceptance tests

| ID | Required observation |
|---|---|
| M01-T01 | New idea elicits a useful clarification; no compulsory form, research promise or forced six-stage interview. |
| M01-T02 | First/fresh-connection/returning-mission/read-failure are distinguished using real records. |
| M01-T03 | A permitted note is source-backed, attributable and available after End plus a fresh exchange. |
| M01-T04 | Same write retried after lost reply returns one record; changed payload/key reuse refuses. |
| M01-T05 | Concurrent changes against one revision do not silently overwrite each other. |
| M01-T06 | A proposal, disagreement, hypothesis and accepted decision remain distinguishable in UI/context. |
| M01-T07 | A viewer or revoked editor cannot commit accepted state; role is not taken from model arguments. |
| M01-T08 | Clear confirmation names the current proposal; negation, ambiguous yes, stale target and speaker switch do not accept it. |
| M01-T09 | Capture off/private utterance/guest transition prevents new retained notes and leaked context. |
| M01-T10 | Transient buffer expires and clears at required boundaries; telemetry contains no raw speech/secrets. |
| M01-T11 | Original expectation survives changed current understanding; actual outcome/source can be compared. |
| M01-T12 | Corrected or revoked source does not re-enter through a cached packet, raw resumed session, summary or export. |
| M01-T13 | A source-read prefix is marked partial with a continuation handle; exact quotation is not fabricated. |
| M01-T14 | Historical brief remains readable/control-compatible; new brief UI and admission affordances are consistently retired. |
| M01-T15 | Existing Stop speaking/End/Stop looking/Hold/Resume/Stop work meanings and guest fences remain unchanged. |
| M01-T16 | Fresh two-person exchange uses current mission/one meaningful result or blocker; EN/IT/ES cases are exercised. |
| M01-T17 | Small viewport/zoom/keyboard/reduced-motion/manual controls remain usable; no dock clipping. |
| M01-T18 | After a bridge crash only committed notes are claimed durable; unsaved speech is not invented from an old summary. |

Run current project suites plus these targeted cases. Unit tests do not replace actual hosted voice continuity. No automatic full audio/transcript capture is permitted for test evidence; use synthetic cases or explicitly consented bounded evidence.

## 12. Release and rollback

Claude owns migration source and tests; Codex applies only reviewed missing migrations to the owner-confirmed new Sophia database. Register actual next migration/amendment numbers at launch; never edit 0001–0017 in place.

Sequence: compatible DB/read APIs → bridge/context writes under disabled note policy → Studio controls → enable only for the consented founder project → bounded acceptance. The exact process subset is determined by the changed source, not every service restarted indiscriminately.

Rollback disables new note/mission mutation and stops affected model contexts while preserving historical notes/accepted revisions and compatible read/correction/cleanup behavior. Never restore old raw context after a source revocation. Reverting copy must not remove state needed to read new records. A schema rollback is forward-only unless separately reviewed and authorized.

Do not retire this PR as accepted until the hosted continuity episode is evidenced or the owner explicitly records source-only acceptance and leaves hosted acceptance pending.
