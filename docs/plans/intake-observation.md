# Intake observation — offline policy and replay report (INC03-CC-001)

Source preparation for INC03-S01/S02 (pack v2, `modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md`,
`contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md`, issued at `afe68b679722e28471dcdf6222d519759cd78c49`). It is **not**
installed automatic routing, not a live intake service and not the shipped INC-03 feature. Nothing here is exported
from `@sophia/coordination`, registered in an app, or reachable from a request.

- `packages/coordination/src/intake-observation.ts` — a pure, versioned, deterministic observation policy
  (currently `sophia.intake-observation.policy.v14`; v1 was r1, v2 r2, v3 r3, v4 r4, v5 r5, v6 r6, v7 r7, v8 r8, v9 r9 (unpublished), v10 r10, v11 r11, v12 r12, v13 r13). It reads a validated input and returns a proposal. It holds no
  transport, provider, database, notification, control or dispatch handle and reads no clock or environment.
- `scripts/intake-observe.ts` — the consumer: an offline CLI that validates a bounded corpus file, strips every
  label before the policy sees a case, runs the policy, compares results with the labels separately and writes a
  versioned JSON report to an explicit path outside the repository.

The later admitted intake consumer (after INC01-CC-002's contract/migration/generation ownership is reconciled)
must reuse this policy behind an additive durable contract. It must not grow a parallel scheduler or event bus,
and this CLI is not that consumer.

## Current source this respects (read at `953e5dc3`)

| Seam | Actual behaviour | What the policy does |
|---|---|---|
| `Contribution.intent` (A05) | `discuss` / `ask_sophia` / `propose_work`; room writes `discuss` | Not renamed or reinterpreted. Room migration is separate. |
| `ConversationStart/Send.askSophia` (A33, 0063) | Required boolean; `false` persists without `conversation_ask`; omitted is invalid at OpenAPI and SQL | `legacy_explicit_ask` requires the boolean: `false` → recorded only, no assessment; `true` → the existing explicit reply path; omitted → **invalid input**, never normalized to false or opted into `automatic_v1`. |
| `WorkCommand.guidance` (0042 `work_command`) | Returns `unavailable` | Not used as a follow-up path. `manager_followup` is a proposal only. |
| `GoalCommand.steer` | Stronger native steering | Never proposed for an ordinary follow-up. |
| `persistence/conversation-context.ts` | Renderer only, not exported, nothing calls it | Not described or used as an installed assembler. |

`automatic_v1` is an internal versioned test input of this module only; it is not an installed public contract.

## Input

An input is `{ interaction, text, context }`. `interaction` is `{ contract: 'automatic_v1' }` or
`{ contract: 'legacy_explicit_ask', askSophia: boolean }`. The corpus schema `sophia.inc03.development-corpus.v2`
declares automatic-mode cases, so the CLI gives its cases `automatic_v1`; a case may name a legacy interaction
explicitly with an `interaction` member, and then `askSophia` must be a boolean.

`context` holds **typed facts only**, each validated against a closed table (`CONTEXT_FIELDS`); an unknown key, a
wrong type, an oversized string or list is an input error. What each group means and how far it is trusted:

| Group | Fields | Trust |
|---|---|---|
| Audience | `audience`, `originalAudience`, `participantsChanged` | Server scope of the thread/call. Never widened. |
| Addressing | `trustedMentions`, `currentMembers`, `directAddress`, `replyTo`, `replyAuthor`, `needsReply` | Structured mentions/reply targets as the composer would send them. A mention not in `currentMembers` (when given) is dropped. |
| Untrusted text | `untrustedTextMentions`, `quotedText`, `attachmentInstruction` | Evidence only. Fenced out of the text before rules run; never an addressee or an instruction. |
| Exact context | `selectedArtifact`, `selectedComparison`, `attachment`, `uniqueDecision`, `uniqueDate`, `retainedEvidence`, `latestArtifact`, `otherArtifact`, `acceptedVersion`, `accepted`, `acceptedStandard`, `repo`, `base`, `issue` | Exact references; a selected version is never replaced by `latestArtifact`. |
| Ambiguity | `possibleTargets`, `possibleComparisons`, `candidates`, `possibleRepos` | More than one plausible referent → clarify. |
| Work | `activeMission`, `selectedMission`, `manager`, `control`, `relatedToActive`, `pendingOperation` | Current mission link and control state. |
| Resource/permission facts | `apiGrant`, `apiResource`, `nativePair`, `nativeSubscription`, `inquiryGrant`, `stop/hold/resumeQualified`, `pin`, `pinUnavailable`, `alternateAvailable`, `requester`, `resourceOwner`, `nativeDelegationQualified`, `projectExcludedByGrant`, `currentSourceEligible`, `sourceEligible`, `sourcePermission`, `unrelatedNativeHistory`, `membershipRemovedBeforePublication`, `grantRevokedBeforeSend`, `designState`, `implementationAuthorized`, `currentActorAuthorized`, `currentGrant` | **Supplied facts, not grants.** A negative fact can wait or deny; a positive one never admits. |
| Origin/identity | `origin`, `causedBy`, `voiceUtterance`, `isFinal`, `operationId`, `redeliveryOf`, `samePayload`, `originalAdmission`, `originalOperation`, `dispatchState`, `expectedRevision`, `currentRevision`, `newTarget`, `correctedSourceManifest`, `originalBinding`, `currentBindingRevision`, `missionAllowanceLineage`, `originalEffectState`, `nativeSession` | Ingestion facts. Generated output never becomes a human instruction. |
| Adoption | `actorExplicitlyAdopts` | A structured fact that the actor adopts quoted words as their own request (as a composer "use this quote" action would send). Read only by the quotation rule; text never sets it. |
| Informational | `textContainsBuildWord` | Accepted and recorded; no rule reads it. |

The policy never sees `caseId`, `family`, `split`, `expected`, `status`, `labelAuthority` or `fixtureAuthority`:
the CLI keeps them as comparison metadata, and a context that carries any of those keys is an input error.

## States (one observation) — policy v14

Policy v2 (`sophia.intake-observation.policy.v2`) replaced v1 after the independent r1 review
(INC03-CC-001-r1-SOURCE-PRE-PUSH-001, F01–F07). Policy v3 (`sophia.intake-observation.policy.v3`) replaces v2 after
the r2 review (review SHA-256 `1d568e04…`, F01 and F04 remaining): straight single quotes are bounded across lines and
an unclosed opening straight quote abstains; an explicit negative native route makes a follow-up, inquiry or
correction wait. Policy v4 (`sophia.intake-observation.policy.v4`) replaces v3 after the r3 review (SHA-256
`901583b5…`, one F01 class remaining): single-quoted evidence whose end is ambiguous fails closed. Policy v5
(`sophia.intake-observation.policy.v5`) replaces v4 after the r4 review (SHA-256 `df9abc94…`): v4 recognised a
straight opener only after a short list of characters and discarded every other straight quote as an apostrophe, so a
quote opened after an em dash or a backslash exposed its contents. v5 replaces the opener list with the general rule
below. Policy v6 (`sophia.intake-observation.policy.v6`) replaces v5 after the r5 review (SHA-256 `110918ad…`): v5
exempted every apostrophe glyph with a letter or digit on both sides before looking at quotation structure, so a pair
of such marks around a multi-word span (`said'first line. Stop the job'next`) vanished and the Stop inside was read as
authored. v6 exempts a mark only in a provable token shape (below). Policy v7 (`sophia.intake-observation.policy.v7`)
replaces v6 after the r6 review (SHA-256 `6229777b…`): v6 still judged each mark alone, so two marks that each fit a
contraction or name shape (`said's first line. Stop the job's next`) were both discarded and the Stop between them was
read as authored. v7 adds a whole-input pair check (below). No earlier version's semantics are reused under a later
name.

Order (v8, unchanged since; the descriptor's `order` lists it this way from v10 — v8 and v9 still listed the interaction contract first): **origin (terminal)** → **transport redelivery** → interaction contract (legacy explicit Ask, or
automatic) → addressing → **human-only addressing (terminal)** → correction of an earlier operation → quotation check →
**identified control** → structural ambiguity → text intent → mission identity → target → blockers.

v8 (published r7 `cf5f82e8`, automatic review on PR 504, gate SHA-256 `0114e54c…`) moved origin and redelivery ahead
of the interaction contract. Before v8 a legacy `askSophia` input never reached the origin rule: generated,
agent_result, receipt, delayed_output and voice_interim inputs became an `answer` with `askSophia:true`, and claimed
`humanInstruction:true` with either boolean. A selector boolean is not provenance. Now:

| Input | Proposal | Provenance |
|---|---|---|
| any non-human origin (generated, agent_result, receipt, delayed_output, voice_interim), legacy true or false or automatic | the origin result (`no_action`, `record_provisional`, `withhold_from_current_call`), correlation kept | `humanInstruction: false` |
| transport redelivery (`redeliveryOf` + `samePayload`), any contract | `replay_original` / `conflict` | `humanInstruction: false` (it re-delivers an existing operation) |
| human or `voice_final` origin, `legacy_explicit_ask` true | `answer` via the existing explicit path | `humanInstruction: true` |
| human or `voice_final` origin, `legacy_explicit_ask` false | `recorded_only`, no assessment | `humanInstruction: true` |
| legacy without `askSophia`, or an invalid one | input error (`legacy_ask_missing` / `invalid_interaction`); never automatic | — |

Declared imported spans (v8). `quotedText` and `attachmentInstruction` are removed **first**, before backslash/encoded
escape detection, fences, single-quote boundaries and the whole-input pair check — every occurrence, across lines,
counted as fenced spans. Before v8 they were removed last, so an unmatched quote, an escaped quote or a pair of
apostrophes wholly inside a declared import made the authored text around it abstain as `malformed_quotation`. A
directive inside a declared import is still data; malformed quotation in the authored text outside it still abstains.

v9 (published r8 `08925d90`, automatic review on PR 504, gate SHA-256 `ed8cd02f…`) repairs two policy classes:

- **Acknowledgement prefix.** v8 classified a whole clause as an acknowledgement as soon as it began with one of the
  eight acknowledgement terms, so `Thanks stop` or `Okay hold` lost the control (32 of 32 acknowledgement × Stop/Hold
  verb pairs were `no_action`). v9 peels leading acknowledgements — repeated, with the existing fillers or `also`
  between them, or followed by a hyphen or dash — and reads the words after them as a clause of their own, with the
  existing lexicon, exactly as `Thanks, stop` was already read. v9 also kept any acknowledgement whose remaining words
  named no request as an acknowledgement (`Thanks for the update.`, but equally `Okay immediately halt the job.`):
  **superseded by v10, below.** Fences, declared imports, non-human origins and the legacy contract decide before
  this, unchanged. An acknowledgement followed by other words and a question mark reads as a question, like its
  comma form.
- **Transport redelivery addressee.** v8 gave a redelivery with no addressing an invented `sophia` addressee on basis
  `operation_reference`. v9 reports only what the delivery's own addressing resolves (trusted mention, reply target,
  direct address, or the personal default); otherwise no addressee with basis `unresolved`, and dropped non-members
  stay reported. A redelivery never asks for attention. `operation_reference` remains only for a fresh correction of
  the actor's own operation, which is a new act, not a delivery.

v10 (unpublished r9 `5fc91608`, independent gate `INC03-CC-001-r9-SOURCE-PRE-PUSH-001`, SHA-256 `59cac462…`) closes
the remaining acknowledgement class: an acknowledgement never decides words the lexicon cannot read. In v9 an
acknowledgement prefix turned an unread remainder into `no_action` (64 of 64 review forms with an unknown word before
Stop/Hold), and `combine` did the same for a separate clause (`Thanks, <unread>`, `Okay. <unread>`, `<unread>, thanks`).
In v10 a clause with words of no family is unread; a message whose only recognised clauses are acknowledgements and
that has an unread clause has family none and abstains (`outside_lexicon`, semantic assessment required) exactly as
the unread words alone do. A message is quiet `no_action` by acknowledgement only when every authored clause is an
acknowledgement (the existing terms, with fillers, `also`, repetition and separators: `Thanks!`, `Got it, thanks.`,
`Perfect, thank you!`). Nothing was added to the lexicon, so ordinary gratitude with other words
(`Thanks for the update.`, `Great job everyone.`) now abstains too; a `needsReply:false` hint still quiets it, as it
quiets any unread remark, and never a request. An acknowledgement with a recognised request keeps the request
(Stop/Hold first). Quoted, imported, non-human and legacy inputs keep their outcomes; the one crossing that changed is
authored words left around a quotation (`Thanks, she wrote "stop the job".`), which now abstain instead of `no_action`.

v11 (published r10 `2684bb50`, automatic review on PR 504, gate SHA-256 `d0dcb777…`) repairs one policy class: a
`null` `inquiryGrant` is known absence of that qualification, as `null` already is for `apiGrant` and `nativePair`.
Before v11 a running mission with an exact manager and `inquiryGrant: null` was treated like an omitted field
(`recorded_only` / `observation_unqualified` with `inquiry_grant_unknown`); now it waits as `inquiry_unqualified`,
exactly as explicit `unqualified`. Omitted stays unknown (`inquiry_grant_unknown`); `qualified` stays an unassessed
`recorded_only` proposal. `inquiry_grant_unknown` is reported only when the field is omitted (v10 also attached it
to explicit `unqualified`). The order is unchanged: retained evidence is read first; held or stopped work never gets
a fresh inquiry; then this qualification; then manager identity. The other nullable fields were checked: the two
nullable qualifications already treat `null` as negative, and `retainedEvidence`/`activeMission` `null` already
mean none.

v12 (published r11 `7079989c`, automatic review on PR 504, gate SHA-256 `141d0000…`) repairs two policy classes:

- **Failed structured addressing.** In v11, when every supplied `trustedMentions` entry was a human outside
  `currentMembers`, the mentions were dropped and the message fell through as if no addressing had been supplied:
  to a reply target, a direct address, the personal default, a correction, a control or text intent — so a message
  addressed to a removed person could become a Sophia `build_start` or `control_stop`. v12 distinguishes **absent**
  addressing (no `trustedMentions`, or an empty list) from **failed** addressing (a non-empty list naming no current
  recipient). Failed addressing stops before every fallback: `abstain` (rule `address.structured_unresolved`), no
  addressee (basis `unresolved`), attention none, uncertainty `structured_addressing_failed` plus one
  `mention_not_current_member` per dropped mention. The dropped ids are never reported. Partial drops keep the
  remaining current humans; an explicit `sophia` mention beside dropped humans stays Sophia-directed; with
  `currentMembers` unknown nothing is dropped. Origin, transport redelivery and the legacy contract still decide first.
- **Legacy target provenance.** A legacy `askSophia:true` without a selection answered on the current thread but
  reported `targetBasis: explicit_selection`. v12 reports `current_thread` for that fallback and keeps
  `explicit_selection` for an actual selected artifact, comparison or decision with its exact target. The legacy
  answer path, its admission and legacy false are unchanged.

v13 (published r12 `9bd567a8`, automatic review on PR 504, gate SHA-256 `d3f1a0be…`) repairs two policy classes, and
the report one accounting class:

- **A dash directly after an acknowledgement.** v9 documented hyphen, en dash and em dash as separators after an
  acknowledgement, but an acknowledgement was only recognised when a space followed it, so `Thanks—stop` or `okay-hold`
  never reached the separator and abstained while `Thanks — stop` was a control (48 of 48 joined forms). v13 recognises
  an acknowledgement term followed by the end, whitespace or one of those dashes, and peels the dash as before. A word
  that only begins with an acknowledgement is none (`Thanksgiving`, `Okayish`, `Okstop`); other lexicon boundaries are
  unchanged; unread words after it still abstain (v10).
- **Comparison ref syntax.** v12 checked only for one `@` and no whitespace. v13 implements `name@version[:region]`
  (below) for the selected pair and every possible pair.
- **Report tallies** (`scripts/intake-observe.ts`, report v5 shape unchanged): counts by kind, admission, family and
  field result were accumulated in an ordinary object, so a family named `__proto__` vanished and one named
  `constructor` or `toString` was not a number. They are now accumulated in a `Map` and written as own numeric
  properties for every name; family counts sum to the observed cases. No global prototype was changed before or after.

v14 (published r13 `bc11826b`, automatic review on PR 504, gate SHA-256 `caa98503…`) repairs two policy classes:

- **A supplied date is an exact reference.** `uniqueDate` was an accepted exact-context field that target resolution
  never read, so `Remind me.` with a supplied date answered on the current thread, for automatic and legacy Ask alike.
  v14 resolves it as a `reference` target with `explicit_selection` basis. It is an opaque id: never parsed as a date,
  time or timezone, and nothing is scheduled.
- **One notion of exact selection.** Generic target ambiguity (two or more `possibleTargets` or `candidates`, and the
  reply-referent check) counted only `selectedArtifact` as a selection, so an attachment, a selected comparison or a
  unique decision with the same exactness was clarified before its target was used. v14 uses the same exact selection
  for both target resolution and that ambiguity. Precedence when several are present: the selected comparison, the
  selected artifact, an attachment, a unique decision, a unique date. Unrelated native history is a target kind but
  not a resolved reference, so it does not suppress ambiguity; a null selection is none. Comparison and repository
  ambiguity stay specialized; people, origins, transport, legacy false and identified controls still decide first.

| State | When | Proposal | Admission |
|---|---|---|---|
| legacy false | `legacy_explicit_ask`, `askSophia:false` | `recorded_only`, no addressee inference | `recorded_only` / `legacy_ask_false_no_assessment` |
| legacy true | `askSophia:true` | `answer` via the existing explicit path; target the selection (`explicit_selection`) or else the current thread (`current_thread`, v12) | `recorded_only` / `legacy_explicit_path` |
| contradictory origin | `isFinal` without a voice origin; `voice_interim` with `isFinal:true`; `voice_final` with `isFinal:false` | none — input error `contradictory_origin` | — |
| generated output | `origin` agent_result/receipt/generated | `no_action`, addressee none, target = cause | `recorded_only` / `output_not_instruction` |
| voice interim | `origin:voice_interim` | `record_provisional` | `recorded_only` / `voice_interim_not_instruction` |
| delayed output, same audience | `origin:delayed_output`, audience unchanged | `no_action`, correlation kept in `provenance.correlation` and the target; `proposal.rule: origin.delayed_deliver_after_recheck` | `recorded_only` / `output_not_instruction` |
| delayed output, audience changed | `origin:delayed_output`, participants/audience changed | `withhold_from_current_call` | `recorded_only` / `audience_changed_withheld` |
| transport redelivery | `redeliveryOf` with `samePayload` | `replay_original` / `conflict`; addressee only as this delivery's addressing resolves it, else none (`unresolved`, v9); attention none | same, `operation_redelivered` / `operation_payload_changed` |
| ledger replay / conflict | same `operationId`, same / changed payload hash | the stored observation / `conflict` | unchanged / `operation_payload_changed` |
| failed structured addressing | non-empty `trustedMentions`, none a current recipient (v12) | `abstain`, addressee none (`unresolved`), attention none, `structured_addressing_failed` | universal blockers, else `semantic_assessment_unavailable` |
| private human mention | personal audience, human-only trusted mention (any operation metadata ignored, flagged) | `recorded_only`, attention none | `recorded_only` / `private_audience_no_attention` |
| human message | project, human-only trusted mention or human reply author (operation metadata ignored, flagged) | `human_message`, no AI response | `recorded_only` / `human_directed` |
| correction before dispatch | Sophia-directed or unaddressed; `originalOperation`, `not_sent`, matching revision, `newTarget` | `correct_proposal` | no blocker → `recorded_only` |
| correction, stale revision / after possible send / retry of unknown | as v1 | `conflict` / `correlated_followup` / `reconcile_original` | `conflict` / `waiting` / `reconciliation_required` |
| malformed quotation | an unbalanced quote or fence remains after balanced spans are removed | `abstain` / `malformed_quotation` | universal blockers, else `semantic_assessment_unavailable` |
| unadopted quoted request | a quoted/imported span was fenced, the authored request is build/follow-up/explore/publish/resume, and `actorExplicitlyAdopts` is not true | `abstain` / `quoted_content_unadopted` | as above |
| identified Stop/Hold | a Stop/Hold clause (alone, after "also", or beside other requests) and one consistent mission | `control_stop`/`control_hold` before follow-up and before unrelated artifact ambiguity | qualification and state checks |
| Resume | a Resume clause and one consistent mission | `control_resume`, same precedence | `resume_unqualified`, `resume_requires_held`, `stopped_generation_not_resumable` |
| mission conflict | `selectedMission` ≠ `activeMission`, or `managerMission` ≠ the target mission | `clarify` / `mission_identity_conflict` | `clarification_required` |
| manager identity unresolved | follow-up or fresh inquiry without both `manager` and `managerGeneration` | `manager_followup`/`manager_inquiry`, target carries what is known (nulls otherwise) | `waiting` / `manager_identity_unresolved` |
| ambiguity | >1 plausible target/comparison/candidate/repo, or an ineligible reply referent, when the request is not an identified control | `clarify`, target unresolved | `clarification_required` |
| answer / explore / build / follow-up / work read / inquiry | addressed to Sophia, text in the v2 lexicon | that family with an exact structured target | blockers below, else `recorded_only` / `observation_unqualified` |
| abstain | meaning needs semantic assessment | `abstain`, `semantic_assessment_required` | universal blockers, else `recorded_only` / `semantic_assessment_unavailable` |

The policy's admission is **never** `admitted`. Blockers it derives from facts: `source_ineligible`,
`membership_lost`, `grant_revoked`, `project_excluded`, `actor_unauthorized`, `pin_unavailable` (no switch to an
alternate), `native_delegation_unqualified` (universal); `api_payer_missing`, `api_resource_unavailable` (API
families); `awaiting_design_approval`, `project_coding_slot_occupied`, `native_route_unqualified`,
`implementation_not_authorized`, `selection_not_accepted`, `selected_version_not_accepted` (build);
`held_no_fresh_inquiry`, `inquiry_unqualified`, `mission_held`, `manager_identity_unresolved` (inquiry/follow-up);
`stop_unqualified`, `hold_unqualified`, `resume_unqualified`, `resume_requires_held`, `mission_already_stopped`,
`mission_not_running`, `stopped_generation_not_resumable` (control); `native_route_unqualified` also for follow-ups,
fresh inquiries and corrections when `nativePair` is explicitly `unqualified` or `null` (v3). An explicit negative
fact blocks; an absent fact is uncertainty, never a grant.

Mission identity (F05): the observation's mission target carries `mission`, `manager`, `managerGeneration` and
`binding` exactly as supplied, `null` where absent; nothing is guessed. A mission id alone is not a qualified
current-manager queue: follow-ups and fresh inquiries wait until the manager and its generation are known.
Audience is the coarse scope only (`personal` / `project` / `voice_call`): the observation states
`audience.exactness: scope_only`, because no owner, member, revision or thread identity is in the input.

Held or stopped work: a question with retained evidence is a `work_read`; without evidence it is a
`manager_inquiry` that waits — never a fresh turn or a resume. A follow-up targets the one current mission
only, queued (no fan-out, no new mission, no allowance reset); an unrelated build while a mission is active waits.

Comparisons (F06): `selectedComparison` holds exactly two refs and each `possibleComparisons` entry exactly two;
every comparison ref is `name@version[:region]` (v13): exactly one non-empty name and one non-empty version, and at
most one non-empty region, each made only of letters, digits, `.`, `_` and `-`, with no `..` inside a ref. Empty
components, a second `:`, `/`, a backslash, whitespace or any other character are outside this bounded grammar. Anything
else is an input error (`unsupported_comparison`), counted among the invalid cases and never silently truncated. Target scoring compares structured refs, not a display string.

Text (lexicon v2) is deliberately small and recorded in the policy descriptor (with its text rules from v10). A message
with no clause in the lexicon abstains, and so does one whose only recognised clauses are acknowledgements beside
unread words (v10). A clause outside the lexicon beside a recognised request is **not** read: the request decides.
That is a disclosed limit, not an abstention.
Auxiliary verbs (is, do, can …) open a question only with a question mark. A `needsReply:false` hint quiets an
acknowledgement, a remark or a question; it never turns a request such as Stop into `no_action`. A leading
acknowledgement is a prefix (v9): the words after it are classified as their own clause, and unread words after it stay unread (v10). The lexicon runs on
authored text only: balanced `"…"`, `“…”`, `‘…’`, `'…'`, `«…»`, `„…“`, backticks, fenced code and `>` blockquote lines
are removed first — every form may span lines — as are `quotedText` and `attachmentInstruction`; `@name` text is never
an identity.

Single quotes (v7) share their glyphs with apostrophes, so the policy does not decide by what precedes an opener. It
classifies every single-quote-like mark — `'`, `‘`, `’`, `‚`, `‛`, `‹`, `›`, `＇`, `′`, `‵`, `ʼ`, `ʹ` — after double
quotes, guillemets, low quotes, backticks, fences and `>` lines have been fenced (marks inside those are never
examined):

| Mark | Class |
|---|---|
| `'`, `’`, `ʼ`, `＇` with a letter or digit immediately on both sides **and** in a provable token shape: a contraction or possessive suffix — the mark followed by exactly `s`, `t`, `re`, `ve`, `ll`, `d` or `m` and then a non-letter/digit or the end (`it's`, `don't`, `we're`, `I'll`, `Maria's`, `O'Brien's` second mark, `90's`) — or a name prefix — a one-letter token `o`, `d` or `l` before the mark (`O'Brien`, `d'Arcy`, `l'Oréal`, `o'clock`) | provable apostrophe: ordinary text |
| any other occurrence, including a mark between two letters that is in neither shape (`said'first`, `job'next`, `dell'arte`), whatever precedes or follows it (space, start, end, em dash, backslash, symbol, emoji, formatting, newline) | **boundary mark** |

| Boundary marks in the input | Result |
|---|---|
| none | nothing to fence |
| exactly two, the first `'` or `‘` with a non-space after it and no letter or digit before it, the second its own family's closer (`'` or `’`) with a non-space before it and no letter or digit after it | one span, fenced as evidence; text outside it is authored |
| anything else — one, three or more, a lone possessive (`users'`), an elision (`'90s`), mismatched families, `‚ ‛ ‹ › ＇ ′ ‵ ʹ` as boundaries | bounds unknown: the whole input abstains with `malformed_quotation` |

Any quote mark directly preceded by a backslash (`\'`, `\"`, `\’`) is source escaping, not supported: the whole input
abstains with `malformed_quotation`. Literal Unicode-escape text such as `\u2014` is not decoded; it is ordinary text,
and any quote marks around it follow the rules above. `‟`, `〝`, `〞` and `＂` anywhere are unsupported double-quote forms
and also make the input abstain.

`malformed_quotation` abstains whatever the authored text asks — Stop and Hold included — and `actorExplicitlyAdopts`
cannot repair it, because what would be adopted is unknown. This is a conservative lexical fallback, not a quotation
parser: the only fenced single-quote form is one exactly paired span. Deliberately unassessed, by abstention: any
plural possessive or end-boundary apostrophe (`the users' list`, `the boss’ desk`) anywhere in the input, elisions,
any between-letter mark outside the two provable shapes (non-English elisions such as `dell'arte`, glued quotes such as
`said'first`), two single-quoted spans, mixed straight/typographic pairs, escaped quotes and the rarer quote glyphs.
Contractions, possessives and `o'/d'/l'` names in the provable shapes, and a clearly authored command outside one
exactly paired span (`'disk full'. Stop the job.`), stay meaningful. Only authored direction outside a bounded quotation
can be a control.

Whole-input pair check (v7). The per-mark shapes above only decide which marks are boundaries for fencing. After one
exactly paired span (if any) is fenced, **every** single-quote-like mark still in the input — provable apostrophes
included — is considered together: any two of them that could enclose words, i.e. that are separated by anything but
letters and digits (a space, punctuation, a symbol, a line break, a zero-width character), might bound a quotation, so
the whole input abstains with `malformed_quotation`, adoption included. Marks within one token (`O'Brien's`,
`d'Arcy's`) enclose no words and stay ordinary; a single apostrophe cannot pair with anything.

| Remaining marks after fencing | Result |
|---|---|
| none, or one | ordinary text |
| two or more, all within one token (only letters/digits between consecutive marks) | ordinary text |
| two or more, any two separated by anything else | `malformed_quotation`: the whole input abstains |

Recall loss, stated: a message with apostrophes in two different words (`Stop the job; it's stuck and we're done.`)
now abstains rather than proposing the Stop, and so does a single fenced quotation with an apostrophe on each side of
it. The v6 limit — two marks that both fit contraction or name shapes being read as apostrophes — is closed by this
check rather than documented.

## Errors (CLI)

| Code | Exit | Report |
|---|---|---|
| usage (missing, unknown or repeated argument, URL-like path) | 2 | none written |
| `input_hash_mismatch`, unreadable/oversized file, invalid JSON, unknown schema, too many cases | 2 | none written |
| `output_exists`, output inside the repository, output equal to input | 2 | none written |
| a case fails validation (`invalid_case`, `unknown_context_field`, `label_in_context`, `legacy_ask_missing`, `contradictory_origin`, `unsupported_comparison`, `duplicate_case_id`, bounds) | 1 | written; the case appears only in `errors`, never as a classification. `counts.invalidCases` counts cases, `counts.errorIssues` counts issues (one case may have several) |
| all cases valid | 0 | written |

Bounds: file 2 MiB, 500 cases, text 4000 characters, 64 context keys, strings 200 characters, lists 16 items.
The report is written to a temporary file in the target directory with exclusive create, synced, then linked to
the final name (which fails if it exists) — no silent overwrite of a source, an input or an earlier report.

## Report

`sophia.intake-observation.report.v5`: tool and policy version, policy descriptor and source SHA-256, input
basename/SHA-256/bytes/schema, explicit scored and unscored label fields, semantic assessment `absent`, counts with
denominators (cases, observed, invalidCases, errorIssues, abstentions, clarifications, by kind/admission), per-field
comparison (`match` / `mismatch` / `abstained` / `unassessed`; the denominator includes all four), every miss and
unassessed item with its reason, development-set tallies, the synthetic fixture's provenance check (not authority) and
zero actual-effect counts. The output is
deterministic (no timestamps). The audience score is coarse: it compares only `change: unchanged`, not owner,
member, revision, thread or publication qualification. The tallies are development-set observations, not safety
evidence: novel counterexamples showed r1 gaps that a clean development tally did not reveal. An unexpected
consequential proposal needs an actual proposed-action label that it misses (report v4): a case without that label,
wholly unlabelled or labelled only in other fields, is listed under `consequentialProposalsActionNotLabelled` —
neither a miss nor a match, and no evidence of safety. Report v3 counted those cases as unexpected.

Admission comparison (F04, bounded choice in r3) is separate from proposal comparison and never changes the policy
outcome. A policy outcome that is a deterministic result — `waiting`, `denied`, `conflict`, `replay_original`,
`reconciliation_required`, `clarification_required`, or a `recorded_only` with a non-admission reason (human
message, private mention, no action, output, legacy, abstention) — is compared as it is. An unblocked
`observation_unqualified` proposal is **always `unassessed`** (reason `complete_current_authority_not_representable`):
this offline evaluator cannot establish current source, native/profile, manager/binding, payer or grant authority,
so it makes no positive admission claim. The r2 per-family precondition table is removed rather than extended; a
synthetic fixture whose SHA-256 is verified proves the body's provenance, not current authority. The report still
records each fixture's recomputed SHA-256 and reference matches, as provenance only. Positive admission labels in a
corpus therefore count as `unassessed`: a loss of evaluation scope, reported with its denominator, not an accuracy
change. Target scoring for a mission compares only the mission id the label names; manager, generation and binding
are in the structured observation but unscored.
An abstained proposal's addressee, action, target, admission and admission-reason fields count as `abstained`,
never as matches. Report v5 (r11) decides this **before** any equality: in v4 a label that happened to equal an
abstention's placeholder value (`abstain`, `none`, `unresolved`, `recorded_only`, `null`) counted as a match and left
the misses list. The order for a labelled field is now: not labelled (no label for it) → abstained (one of those five
fields of an abstaining proposal) → match → unassessed (admission) → mismatch. Denominators still include every
abstained field. Audience, clarification and actual-effect fields keep their comparisons for an abstention: they
compare observed facts, not a semantic resolution.

## Running

```bash
node scripts/intake-observe.ts --input /path/to/development-cases.json \
  --input-sha256 477a5784c9e25ebb3966bcb6ea56c703275b99dc9ff20008f85ace7081766b8d --out /path/outside/repo/report.json
```

The reviewed development corpus stays outside the repository: `docs/DESTINATION_MAP.md` lists `tests/fixtures/` as
unbuilt (S1-02), and changing that map is not this slice's to do. The CLI tests build their own small synthetic
corpus instead of replaying the development cases.

`pnpm test` discovers `packages/coordination/src/intake-observation.test.ts`, and — through the coordinator-granted
wrapper `tests/unit/intake-observe-registration.test.mjs`, which only imports it — `scripts/intake-observe.test.ts`.
No root `package.json`, glob or shared configuration was changed.

## Not done here (serialized after INC01-CC-002)

Additive amendment/migration with durable input/assessment/admission/effect records; generated contracts and
validators; API registration and route compatibility; the runner's queue/control binding for `manager_followup`;
a named API payer for semantic assessment; designer-owned composer changes with Davide's approval; reviewer-held
held-out evaluation of a frozen policy version; founder observation (AC-03-15). No AC-03 case is passed by this
slice.
