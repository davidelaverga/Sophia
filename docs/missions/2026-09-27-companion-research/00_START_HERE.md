# Sophia — Three PR missions
## From the working voice foundation to mission continuity and useful research

**Version:** 1.1 · **Prepared:** 27 September 2026 · **M01 content update:** 28 September 2026  
**Repository:** `davidelaverga/Sophia`  
**Status:** implementation specifications prepared; no repository changes, merge, deployment, database mutation or paid test was performed in preparing this pack.

## Mission 1 now includes the exact runtime assets

Read [M01 section 8](missions/M01_MISSION_COMPANION.md#8-exact-system-prompt-complete-skill-and-context-binding): it contains the full literal system instruction. The canonical [system prompt](prompts/M01_SYSTEM_PROMPT.v1.1.md), complete [mission-lifecycle skill](skills/mission-lifecycle.v1.1.md), and [loading contract](shared/M01_PROMPT_LOADING.md) are included. The [v1.1 change record](CHANGELOG_v1.1.md) names the targeted updates; the three-PR sequence and M02/M03 specifications are unchanged.

These are exact authored implementation inputs, not a claim that the running application has been patched or the conversations tested. Prior repository/deployment observations in this pack retain their original dates; this content-only update did not refresh them.

## The next move

Land the reviewed working foundation; do not make removal of the brief a condition of that foundation's integration. Then deliver three feature PRs:

| Mission | Result | Default merge order |
|---|---|---|
| [M01 — Mission-aware companion](missions/M01_MISSION_COMPANION.md) | Remove the brief ritual; add the real mission skill, source-backed ledger, project notes and returning-session context. | First |
| [M02 — Qualified dsh upgrade](missions/M02_DSH_UPGRADE.md) | Upgrade one reproducible runtime unit, preserve current behavior, and bind native presets/configuration identity. | Second |
| [M03 — Research and documents](missions/M03_RESEARCH_WORKFLOW.md) | One research-worker family, Tavily/Jina source access, Markdown/PDF artifacts, nonblocking voice delivery and learning reuse. | Third |

**R00 is a short foundation-integration procedure, not a fourth feature PR.** Read [the merge assessment](02_FOUNDATION_MERGE_REVIEW.md) before pressing Merge: PR #13 currently targets `studio/qol`, not `main`; PR #12 is also open/draft and `main` is still at the earlier runtime milestone. Current exact-head CI succeeded. These are source observations, not a complete code-review or live-release certification. [SRC-01–05](SOURCE_REGISTER.md)

## Launch order

Begin with [R00 Claude](launch/R00_CLAUDE.md) and [R00 Codex](launch/R00_CODEX.md). Claude reconciles the dependency stack and review evidence; Codex checks actual deployment/auto-deploy/schema state without changing it. Davide authorizes the resulting merge/release batch. If R00 was completed since this packet was written, verify its evidence and skip already-completed work.

Then start the mission pair from the relevant row:

| Mission | Claude Code | Codex |
|---|---|---|
| M01 | [Implementation launch](launch/M01_CLAUDE.md) | [Operations/support launch](launch/M01_CODEX.md) |
| M02 | [Implementation launch](launch/M02_CLAUDE.md) | [Operations/support launch](launch/M02_CODEX.md) |
| M03 | [Implementation launch](launch/M03_CLAUDE.md) | [Operations/support launch](launch/M03_CODEX.md) |

Copy the prompt into the intended agent session and attach this pack, or first install the pack in the repository as described below. Paths under `/mnt/data` are not assumed to exist on those agents' computers.

## Division of work

**Claude Code** owns product implementation, source changes, migration authorship, local/disposable tests, candidate PRs, review fixes and engineering handoffs. **Codex** owns authorized hosted operations and bounded support assignments such as native-source audits, isolated test execution, deployment diagnostics and independent review. Codex does not become a competing product implementer or a route around a prohibition.

**Davide** retains product, merge, spending and release authority. **Luis** reviews interaction/layout changes and integration with his existing work; do not assume approval or use his accounts. One explicit bounded approval may cover the complete release batch. Do not demand new approval for every harmless command already covered by that batch.

Use the [file-change map](shared/FILE_CHANGE_MAP.md) at each G1 checkpoint. Read [ownership and sequence](01_SEQUENCE_AND_OWNERSHIP.md), [the communication protocol](shared/CLAUDE_CODEX_PROTOCOL.md), and [release rules](shared/OPERATIONS_AND_RELEASE.md).

## Important corrections to the preceding research

Native declarative presets already exist in the configured dsh rc.1 source. M02 improves and qualifies the runtime and its Sophia binding; it is not needed to invent or unlock the idea of presets. M01's Live mission skill does not wait for M02. [Prior upgrade strategy](references/pass2/DSH_UPGRADE_STRATEGY.md)

The old repository's **example configuration** selects Tavily search and Jina fetch. Actual deployed provider configuration was not established: the tracked `config.yaml` lookup returned Not Found. Reuse those providers through qualified new adapters, not their old Python wrappers or unverified credentials. [Provider audit](research/LEGACY_WEB_PROVIDER_AUDIT.md)

The inspected native web family names Exa, Perplexity and DeepSeek search plus direct HTTP fetch—not Tavily/Jina. Tavily fits a new small native search-provider adapter. Jina's extracted document does not necessarily carry the target site's final URL/HTTP status required by the native direct-fetch contract; preserve unknown metadata in a source-extraction adapter rather than inventing it. [Source policy](research/WEB_SOURCE_POLICY.md)

## Install without rewriting history

Claude installs this complete directory under `docs/missions/2026-09-27-companion-research/` in the authorized working branch. Keep `references/pass2/` unchanged. Add a small link from the repository's current documentation index; do not replace the frozen `docs/pack/` or rewrite S1-05A evidence. If a docs-only branch is necessary to share the packet before M01, it is packaging, not another product mission.

At mission start copy [MISSION_STATE](templates/MISSION_STATE.json) to the mission's progress location, populate actual branch/PR/coordination references, and record the preflight. The authoring-time `null` fields in templates intentionally avoid invented approvals, PR numbers, deployment IDs or spending limits. Real execution requests cannot contain unresolved required fields.

## Scope and authority

This pack converts the user's requested three-PR direction into implementation specifications. Exact APIs, schemas, defaults and work-session allocations are proposed engineering choices to bind against the actual checkout. A documented internal implementation-equivalent rename is allowed. The M01 v1.1 model-facing prompt/skill bytes and function names are fixed by the loading contract; changing them requires a matching versioned amendment. Changing behavior, data audience, spending, scope or acceptance also requires a recorded amendment.

No new personal-memory provider, ambient recording, full technical-lead hierarchy, image generation, slides, arbitrary browser control, subscription-account migration, paid service purchase or unrestricted agent fan-out is included. The older April maps are donor history, not authority to restore LangGraph/Hydra/Graphiti/Mem0 into the new runtime.

**Success:** people develop a shared idea by voice, return to an accurate mission record, commission useful research, inspect real evidence and documents, and continue without reconstructing their learning.
