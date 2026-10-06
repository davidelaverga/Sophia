# Decisions, precedence and scope

## Owner directions retained

**D01 — Native baseline first.** Reproduce the relevant Raven design behavior through the existing DeepSeek Harness/Cordis runtime before testing Raven over ACP. No Raven host/ACP integration, Pi Durable, Prime, new root agent loop, new generic scheduler or new orchestration backend is part of these missions.

**D02 — Design for non-Markdown output.** A newly requested HTML file is a designed artifact, not an ad hoc browser conversion. Routing to design is determined by the requested format, not by a model classifying whether the user wanted a basic or premium result. Effort can vary within the same lifecycle.

**D03 — Preserve current research.** Retain the merged researcher, evidence/source policies, accounting, draft/version history, control fences and publication behavior. A fixed research package is the comparison input. Do not simultaneously port Raven-Research and claim to have isolated a design improvement.

**D04 — Role split.** Claude Code implements and authors migration/config/source changes; Codex independently reviews, applies authorized hosted changes, deploys and tests in the app. Codex does not become an uncoordinated second feature writer. Davide retains product, spend, merge and release decisions. Existing repository-required reviewers, including Luis where applicable, are not waived.

**D05 — Real authoring and perception.** The designer can author and revise semantic HTML/CSS, not merely approve one hard-coded template. Rendering produces actual current screenshots; qualified models receive actual image content and relevant measurements. A returned image path or a success string is not visual inspection.

**D06 — Coherent work and artifacts.** Sophia owns the accepted work, human contribution, source eligibility, version identity and publication. dsh owns the native loop/inbox/compaction. A runtime reviewer verdict is not human acceptance. There is one continuation owner for each attempt.

**D07 — Controlled iteration.** Support both mid-work guidance and revision of a saved candidate. Changes to protected sections, global styling or shared assets require the permitted scope or an explicit scope amendment. Preserve the prior candidate until the new one passes its checks.

## Implementation scope selected by this outline

These are concrete engineering proposals for the agents to execute when launched, subject to actual owner authority and the G0 binding review.

The first supported design profile is **static editorial research HTML**, with UTF-8 content, semantic headings/tables/links, scoped CSS, appropriate EN/IT/ES text, and optionally already-approved raster assets. A single self-contained HTML deliverable is the initial export target. Keep editable authoring source and the evidence package separately.

No active JavaScript, forms, trackers, third-party scripts, automatic remote fonts, remote CSS, generated logins, new brand identities or external publishing. A richer website profile is a later explicit capability. Do not turn unsupported interactions into fake buttons.

All newly admitted non-Markdown formats use the same design-policy rule. Only expose formats whose full path is qualified. Existing PDF files and version readers remain usable; historical `pdf-report-v1` identity stays unchanged. A new PDF request must not secretly take the old fixed-template path after the new policy is activated. Until its designer path is qualified, report that capability as unavailable and preserve any useful Markdown as an explicitly partial result. Do not delete existing PDF code or rewrite old migrations to achieve this.

## Not a complete Raven replica

Claim only **Raven-derived native HTML design baseline**. Retain four selected skill families and their reference dependency closure, map their applicable behavior to native capabilities, and disclose every adaptation/deferred clause. No claim of identical output quality, token cost, benchmarks, full format support, autonomous research, or crash guarantees of Raven.

The selected four are visual-artifact-design, design-editorial-and-presentations, build-polished-visual-frontends, and review-against-ai-patterns. Other Raven domains are not silently imported as callable skills.

## Frozen identities and changes

Do not mutate the meaning of existing role, prompt, PDF-profile or deployed runtime IDs. New behavior gets new versioned assets, profiles and recorded runtime artifacts. dsh can retain revisions in a live process, but a restart uses the installed definition for a stored preset ID; retain the correct implementation for resumable attempts or block unsafe resumption. [SRC-D1](sources/SOURCE_REGISTER.md#src-d1)

A registry allowlist is not a mounted tool, a profile name is not a loaded preset, and a process exit code is not readiness. The existing composition gate and deployment evidence remain mandatory. [SRC-S3](sources/SOURCE_REGISTER.md#src-s3)

## Authorization is not inferred

Running tests against a disposable local database is different from writing production. A paid model probe, synthetic app project, browser action that starts a task, migration, deployment and storage upload are effectful operations. Bind them to a real scoped approval. Do not borrow an earlier mission's approval or infer approval from an agent comment posted under Davide's GitHub login.

No tasks run indefinitely while waiting for a reply. Preserve the checkpoint and return a precise blocker when no independent authorized work remains.
