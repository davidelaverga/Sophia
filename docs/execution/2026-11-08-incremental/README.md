# Sophia — Implementation specs pack v2

**Issued:** 8 November 2026  
**Programme:** Incremental connected resources, natural interaction, and verified repository work  
**Status:** Implementation handoff; no capability has been implemented or verified by preparing this pack.  
**Product owner:** Davide Laverga  
**Target repository:** [davidelaverga/Sophia](https://github.com/davidelaverga/Sophia)

## Start here

Give the complete extracted pack to the **one Codex coordinator** and paste [the coordinator launch prompt](prompts/00_COORDINATOR_START.md). The coordinator owns the whole programme, issues bounded assignments to the other threads, reconciles their handbacks, and continues until the agreed capabilities are merged, deployed, and independently tested in the application.

Read in this order:

1. [Mission and completion contract](MISSION.md).
2. [INC-00: current baseline, contract amendments, first assignments](modules/INC-00_BASELINE_AND_INSTALLATION.md).
3. [Domain, authority, and funding](contracts/01_DOMAIN_AUTHORITY_AND_FUNDING.md).
4. [Delivery and review](operations/DELIVERY_AND_REVIEW.md), [design approval](operations/DESIGN_APPROVAL.md), and [deployment and verification](operations/DEPLOYMENT_AND_VERIFICATION.md).
5. The assigned module and its shared contracts.
6. [Acceptance matrix](ACCEPTANCE_MATRIX.md) and [baseline/source register](references/BASELINE_AND_SOURCES.md).

The coordinator may parallelize independent assignments. It does not ask Davide to approve routine implementation choices already covered by the mission. Actual resource enrollment, native permission prompts, missing repository authority, and significant Sophia UI approval remain concrete owner actions when needed.

## The exact delivery team

| Thread or service | Assignment |
|---|---|
| One Codex thread | Programme coordinator; keeps the mission, dependency graph, decisions, evidence, and next assignments coherent. |
| Claude Code threads | Bounded implementation work in isolated worktrees. |
| One Claude Code thread with a pinned Impeccable setup | Design specialist for incremental improvements to Sophia's production interface. |
| Automatic Codex GitHub review | Runs on every PR push; records coverage of newly pushed commits and the exact pushed head. |
| **One independent Codex thread** | Both independent source review and in-app verification, as separate stages with separate evidence. It does not author implementation fixes it later approves. |
| Davide | Approves significant Sophia UI changes and decisions concerning his resources. |
| Luis | Owns his resource decisions and the repository's currently assigned integration/merge responsibility. |

The combined reviewer/tester is the latest user decision. It supersedes the roadmap and October pack's separate reviewer and tester threads. The automatic reviewer is an additional gate, not a substitute for that thread.

This is the team **building Sophia**. The product's future project manager and agents are separate runtime entities. The product allocator cannot change this delivery roster on its own.

## Missions

| ID | Useful outcome | Primary dependency |
|---|---|---|
| [INC-00](modules/INC-00_BASELINE_AND_INSTALLATION.md) | Installed amendment, current source map, owner decisions identified, first assignments ready | Existing repo instructions and active ownership |
| [INC-01](modules/INC-01_RESOURCES_AND_EXPLORE.md) | Four real owner-native connections and API-funded Explore with a real team contribution | INC-00 |
| [INC-02](modules/INC-02_NATIVE_REPOSITORY_MISSIONS.md) | One repository change through project manager, worker, review, merge, deploy, and app verification | One owner's qualified Codex + Claude Code pair; does not wait for full INC-01 |
| [INC-03](modules/INC-03_NATURAL_COMPOSER_AND_CONTINUITY.md) | Natural conversation, research, and follow-up without an intent selector | Contracts can start early; live actions use qualified execution |
| [INC-04](modules/INC-04_ALLOCATION_AND_TEAM_RESOURCES.md) | Automatic resource/model/effort selection for new assignments, with editable limits and pins | Proven execution and relevant resource grants |
| [INC-05](modules/INC-05_VOICE_AND_FOUNDER_RELEASE.md) | Voice continuity and a verified end-to-end two-founder release | Delivered typed execution, routing, and allocation |

Useful slices may release before a whole mission closes. A slice release never marks its remaining required cases passed.

## What this pack changes

- Uses the current production application as the design and implementation base.
- Replaces the mandatory four-way intent selector with natural addressing and admission.
- Defaults Explore to an explicitly funded API route and repository Build to qualified native subscription resources.
- Retains Paperclip's bounded operational role and qualifies T3 behind one narrow runner contract.
- Adopts DSH Super Agent's intent, provenance, and durable delivery patterns without adding a competing project manager.
- Makes all significant Sophia UI improvements stop at a working candidate for Davide's approval.
- Narrows the first release to the founders' useful workflow. Broader formats, imports, active migrations, and unqualified native pooling remain deferred.

See [the prior-plan crosswalk](references/PRIOR_PLAN_CROSSWALK.md) for explicit keep, amend, and defer decisions.

## How to read the specification

**MUST** denotes a required behavior or delivery gate. **SHOULD** denotes the default implementation choice; any departure needs a bounded rationale and evidence. Logical record names and operation names are specification vocabulary, not claims that tables, endpoints, or upstream APIs already exist.

INC-00 maps the vocabulary to the current repository contracts, generated types, persistence, and route bindings. Preserve existing identifiers where they already satisfy the behavior. Do not invent a second implementation because a specification uses a different logical name.

Requirements are identified by INCxx-Rnn or a contract/protocol prefix. Acceptance cases use AC-00 through AC-05, AC-GOV, AC-UI, and AC-C. All new acceptance cases begin **not_run**. The [CSV register](acceptance/cases.csv) is an editable tracking copy; module/protocol prose defines the expected behavior.

## Precedence and scope

1. Latest explicit user decisions, including this roster and Davide's design approval gate.
2. Current repository authority, permissions, and applicable instructions.
3. This pack's mission and shared contracts for the installed incremental programme.
4. Module details and delivery protocols.
5. Prior packs and prototypes as the crosswalk specifies.

Creating this pack does not install it into the repository, activate a payer, connect an account, change branch permissions, deploy a release, or constitute UI approval. The coordinator installs the agreed amendment through the existing reviewed documentation process and then executes already authorized work. Where a real permission is missing, it prepares the concrete next action and identifies exactly what is needed.

## Package contents

- Root mission, acceptance matrix, and this reading guide.
- Six module specifications.
- Three shared contracts.
- Delivery/review, design approval, and deployment/testing protocols.
- Role-specific start, assignment, review/test, and resume prompts.
- Templates for assignments, handbacks, mission state, resource qualification, design review, verification, and decisions.
- Traceability and source references, plus the prior roadmap as historical input.
- Machine-readable acceptance register and a file manifest.

The single combined Markdown edition contains the same normative documents for convenient reading. The ZIP's modular files are the intended working handoff.
