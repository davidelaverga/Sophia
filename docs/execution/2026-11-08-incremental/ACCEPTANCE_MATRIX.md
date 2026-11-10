# Acceptance matrix and release gates

**Initial state:** every new case is not_run. Preparing this pack did not connect accounts, execute native/provider work, merge code, install Impeccable, deploy, or test the app.

The complete editable register is [acceptance/cases.csv](acceptance/cases.csv). Module/contract/protocol prose is normative. A CSV row records execution; it cannot weaken the corresponding requirement.

## 1. Case inventory

| Family | Cases | Governing specification | Gate |
|---|---:|---|---|
| AC-00-01–08 | 8 | [INC-00](modules/INC-00_BASELINE_AND_INSTALLATION.md) | Programme installation/readiness |
| AC-01-01–18 | 18 | [INC-01](modules/INC-01_RESOURCES_AND_EXPLORE.md) | Full connections and API Explore mission |
| AC-02-01–19 | 19 | [INC-02](modules/INC-02_NATIVE_REPOSITORY_MISSIONS.md) | Repository mission; AC-02-17 is mandatory overall founder closure |
| AC-03-01–18 | 18 | [INC-03](modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md) | Natural input and continuity |
| AC-04-01–18 | 18 | [INC-04](modules/INC-04_ALLOCATION_AND_TEAM_RESOURCES.md) | New-assignment allocation |
| AC-05-01–18 | 18 | [INC-05](modules/INC-05_VOICE_AND_FOUNDER_RELEASE.md) | Voice and cumulative founder release |
| AC-C-01–08 | 8 | [C01](contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md) | Shared cross-boundary invariants |
| AC-GOV-01–10 | 10 | [Delivery/review](operations/DELIVERY_AND_REVIEW.md) | Programme source/review process |
| AC-GOV-11–18 | 8 | [Deployment/app verification](operations/DEPLOYMENT_AND_VERIFICATION.md) | Release identity and actual outcome |
| AC-UI-01–09 | 9 | [Design approval](operations/DESIGN_APPROVAL.md) | Significant Sophia UI changes |
| **Total** | **134** | | |

The routing evaluation's 80 labeled examples and ten observed founder messages are inputs to AC-03-15, not 90 extra programme cases.

## 2. Evidence levels

| Evidence | What it can establish | What it cannot establish alone |
|---|---|---|
| Source inspection / type checks | A contract/path and supported static relation exist | Native execution, deployed state, provider balance or user success |
| Deterministic/fault tests | Tested state transitions, idempotency, denial and recovery logic | Actual native-provider behavior outside the qualified boundary |
| Database/integration tests | Real persistence/transactions/RLS and named component crossings | Normal deployed-app experience |
| Owner-native live qualification | Actual installed account/host/model/effort/task/control route | Other owner/provider support or generic cross-member delegation |
| Actual API Explore | Selected payer and permitted retained output | Remaining balance beyond available evidence or all output formats |
| Review records | Exact candidate/commit coverage and independent source findings | Serving deployment or in-app behavior |
| Deployed identity | Exact serving bytes/runtime/configuration observed | Successful user journey |
| Ordinary in-app verification | The specific user journey on that release works | Unexercised capabilities or other accounts |

Use the least costly evidence that actually proves the boundary. Do not deliberately exhaust paid quotas to test exhaustion; use controlled fault injection for that mechanism and actual bounded operations for integration.

## 3. Required real episodes

These cannot pass solely through mocks, fixture role switches, source inspection, or coordinator CLI activity performed outside Sophia:

1. Four native qualifications: each founder and each provider has a real bounded output and account/session provenance.
2. One shared API Explore result initiated by the other eligible member.
3. One actual repository mission initiated through Sophia, with exact review, main merge, deployment and app result.
4. Each founder initiates or continues bounded repository work under their own qualified bindings and produces actual candidate output before overall closure.
5. One exact accepted Explore source is carried into repository implementation through the same mission path.
6. Actual natural request/follow-up and a real automatically allocated native assignment with permitted settings/override behavior.
7. One real voice inquiry requiring the qualified manager path and one authorized queued voice follow-up, with correct return/audience/work identity.
8. The delivered significant UI controls are exercised in the real application and match their Davide approval lineage.

Reuse a single real journey for several cases when its evidence actually establishes each assertion. Link the reused observation and its exact source/release in each row; do not repeat a paid operation just to produce duplicate evidence.

## 4. Incremental gate order

| Gate | Pass condition | What it permits |
|---|---|---|
| G0 — Start | INC-00 assignments and contract/authority mapping ready | Implement first connection; route observation work in parallel |
| G1 — First native pair | One owner's Codex and Claude Code routes plus required recovery/control boundaries qualified | Begin INC-02 repository-first task |
| G2 — First verified mission | First applicable INC-02 cases, review/design/merge/deploy/app evidence | Ship that bounded capability while other founder enrollment continues |
| G3 — Full connections | Full INC-01 four-route matrix plus other-member API Explore | Close INC-01 and expand named-founder resource use |
| G4 — Natural and allocated work | INC-03 action-family gate, INC-04 real new-assignment and override cases | Activate qualified cohort actions and allocation |
| G5 — Founder closure | All required programme cases, two-founder output, shared API and real voice path; exact accepted release verified | Complete SOPHIA-INC-2026-11 |

An unrelated new coding request in a project with an active coding mission waits. Independent projects and disjoint workers within the current mission can proceed under their grants/capacity.

Significant design candidates follow their own hold throughout these gates. No green technical gate can lift it. A held UI scope does not stop unrelated permitted backend work.

## 5. Review and design checks

Every actual PR push needs independent whole-diff pre-push review and automatic Codex coverage of introduced commits. The current final head must have valid review/check evidence immediately before merge. Closely spaced or multi-commit pushes require actual coverage, not a guessed mapping from one comment.

The same independent Codex thread supplies source-review and app-verification records. Distinct episodes and exact targets establish what it did; an extra tester thread is not required. It cannot author production fixes and approve them as independent.

For significant UI changes record working candidate, preview/state evidence, awaiting_design_approval, Davide's explicit decision, and final material-delta relation. Routine equivalent repairs remain proportionate. The decision gate applies to Sophia's own delivery programme.

## 6. Status and exception semantics

Allowed register states:

- **not_run:** not executed.
- **passed:** expected observation supported by the required evidence.
- **failed:** executed and contradicted a required observation.
- **blocked:** cannot execute because a named dependency/authority/environment is missing.
- **deferred:** explicitly outside current scope or scheduled for later execution with scope preserved.

Mandatory founder cases cannot close the programme as deferred. AC-02-17 may be scheduled for INC-05 without becoming waived/passed. A user-approved scope amendment is recorded in a decision and changes the required set explicitly; the coordinator cannot silently delete the case.

An approval, a source patch, a review finishing, and a test passing are different facts. An unknown external effect remains unknown even if another part of the case passed. Store failed evidence before repair; new proof supersedes only the affected assertion.

## 7. How the coordinator uses the register

For each assignment choose its cases, existing evidence that can be reused, actual execution level, and independent observer. Return commands/actions, result, exact source/release/profile/grant, evidence location, and limitations using [the acceptance record](templates/ACCEPTANCE_RECORD.md).

Update the CSV only from observed evidence. The coordinator reconciles its records with the reviewer/tester, design decisions, resource qualifications, and live release tuple. No all-green initializer, automatic pass from a PR label, or assistant-written completion narrative can close the mission.
