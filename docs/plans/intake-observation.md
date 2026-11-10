# Intake observation — offline policy and replay report (INC03-CC-001)

Source preparation for INC03-S01/S02 (pack v2, `modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md`,
`contracts/03_INTAKE_ALLOCATION_AND_EVENTS.md`, issued at `afe68b679722e28471dcdf6222d519759cd78c49`). It is **not**
installed automatic routing, not a live intake service and not the shipped INC-03 feature. Nothing here is exported
from `@sophia/coordination`, registered in an app, or reachable from a request.

- `packages/coordination/src/intake-observation.ts` — a pure, versioned, deterministic observation policy
  (currently `sophia.intake-observation.policy.v7`; v1 was r1, v2 r2, v3 r3, v4 r4, v5 r5, v6 r6). It reads a validated input and returns a proposal. It holds no
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

## States (one observation) — policy v7

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

Order: interaction contract → **origin (terminal)** → transport redelivery → addressing → **human-only addressing
(terminal)** → correction of an earlier operation → quotation check → **identified control** → structural ambiguity →
text intent → mission identity → target → blockers.

| State | When | Proposal | Admission |
|---|---|---|---|
| legacy false | `legacy_explicit_ask`, `askSophia:false` | `recorded_only`, no addressee inference | `recorded_only` / `legacy_ask_false_no_assessment` |
| legacy true | `askSophia:true` | `answer` via the existing explicit path | `recorded_only` / `legacy_explicit_path` |
| contradictory origin | `isFinal` without a voice origin; `voice_interim` with `isFinal:true`; `voice_final` with `isFinal:false` | none — input error `contradictory_origin` | — |
| generated output | `origin` agent_result/receipt/generated | `no_action`, addressee none, target = cause | `recorded_only` / `output_not_instruction` |
| voice interim | `origin:voice_interim` | `record_provisional` | `recorded_only` / `voice_interim_not_instruction` |
| delayed output, same audience | `origin:delayed_output`, audience unchanged | `no_action`, correlation kept in `provenance.correlation` and the target; `proposal.rule: origin.delayed_deliver_after_recheck` | `recorded_only` / `output_not_instruction` |
| delayed output, audience changed | `origin:delayed_output`, participants/audience changed | `withhold_from_current_call` | `recorded_only` / `audience_changed_withheld` |
| transport redelivery | `redeliveryOf` with `samePayload` | `replay_original` / `conflict`; addressee as resolved, never invented | same, `operation_redelivered` / `operation_payload_changed` |
| ledger replay / conflict | same `operationId`, same / changed payload hash | the stored observation / `conflict` | unchanged / `operation_payload_changed` |
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
every comparison ref is `name@version[:region]` without `..`. Anything else is an input error
(`unsupported_comparison`), never silently truncated. Target scoring compares structured refs, not a display string.

Text (lexicon v2) is deliberately small and recorded in the policy descriptor; everything outside it abstains.
Auxiliary verbs (is, do, can …) open a question only with a question mark. A `needsReply:false` hint quiets an
acknowledgement, a remark or a question; it never turns a request such as Stop into `no_action`. The lexicon runs on
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

`sophia.intake-observation.report.v3`: tool and policy version, policy descriptor and source SHA-256, input
basename/SHA-256/bytes/schema, explicit scored and unscored label fields, semantic assessment `absent`, counts with
denominators (cases, observed, invalidCases, errorIssues, abstentions, clarifications, by kind/admission), per-field
comparison (`match` / `mismatch` / `abstained` / `unassessed`; the denominator includes all four), every miss and
unassessed item with its reason, development-set tallies, the synthetic fixture's provenance check (not authority) and
zero actual-effect counts. The output is
deterministic (no timestamps). The audience score is coarse: it compares only `change: unchanged`, not owner,
member, revision, thread or publication qualification. The tallies are development-set observations, not safety
evidence: novel counterexamples showed r1 gaps that a clean development tally did not reveal.

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
An abstained proposal's addressee, action, target and admission fields count as `abstained`, never as matches.

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
