# Project memory and the context supplied to each role

**Decision:** current accepted state in Postgres, immutable scoped sources in Storage, derived Markdown knowledge and Postgres text search. No mandatory Mem0/vector migration in S1. Preserve the existing privacy/control semantics instead of importing the old middleware implementation. [P-01, P-02]

## 1. What is stored where

Accepted mission/goal revisions, chosen designs, decisions and current permissions are directly queried domain state. Evidence consists of source documents, selected transcripts, candidate source, checks and native observations. Knowledge pages explain what the project has learned, with source references and freshness. Procedural lessons are versioned candidates for later reuse. Personal memories are not folded into the team store by default.

Do not implement a second writable `mission.md` in Git that can disagree with the database. Human-readable exports are generated views with their source revision. The same applies to `PRODUCT.md`, `DESIGN.md`, repository maps and handoff summaries.

## 2. ContextPacket contract

A packet contains project/audience, goal and accepted revisions, current source/target, active constraints and decisions, relevant source excerpts, source identity/hash, role/task instructions, open obligations, resource envelope, excluded/missing source descriptions and an eligibility revision. It is compiled for a specific role/attempt and has a stable digest.

The compiler reads current accepted state first. It then selects history and lessons by scope and relevance. A source does not become instruction because its text sounds imperative. A semantically similar older decision cannot overrule the current accepted revision.

Keep initial packets small enough to inspect: a compact current-state section plus selected sources and links to deeper material. This is not a fixed universal token cap. Large research can retrieve more deliberately, within the goal's resource envelope. Native dsh compaction/spill manages runtime context after admission; it does not determine source eligibility.

## 3. Role-specific context

The guide gets team direction, current focus, open human actions and relevant recent discussion. The technical lead gets the roadmap, criteria, source map, assignments and changed evidence. A worker gets its exact brief and source—not every conversation. An independent reviewer gets the goal, current candidate/diff, checks, selected attempt history and uncertainty, not a prompt telling it the preferred verdict.

Native peer messages reference supporting objects instead of copying the entire project. A useful challenge may request more context; that retrieval is checked against the recipient's current permissions.

## 4. Existing project import

S1 supports selected ChatGPT/Claude export conversations, instructions, files and explicit handoff bundles, plus owner-selected local repository/session context. Imports stage privately by default. The user reviews a manifest of included, omitted, unsupported and duplicate material before sharing it with the project.

The importer records provider/source identity where available, author, time, file hash, extraction version and any missing grouping/attachment coverage. Deduplicate by content/source identity. A reconstructed project summary is a proposal; an old assistant answer is not automatically accepted product state. Conflicting directions are shown for resolution.

The explicit send-to-Sophia MCP trial accepts a selected context bundle, not blanket reverse access to all Projects. Do not use undocumented account scraping or enterprise compliance endpoints as a personal-subscription feature. The precise current export/custom-tool bindings are carried from v0.2 and are exercised in S1-08. [P-02]

## 5. Repository knowledge

Maintain a source-bound map of entry points, important modules, contracts and known checks. Each claim cites file/range/hash or a specific build/test observation. Mark stale claims when the underlying source changes. A tree of filenames is not a statement that every feature works.

The state-of-the-build view distinguishes exists, mocked, checked, deployed and not checked. Goal completion updates it from actual evidence. OpenWiki-style claim sidecars are a useful later implementation donor; no complete OpenWiki runtime is required to establish the first map. The concrete source register in this pack is the initial coding-agent map, not a live map of code we have not built.

## 6. Correction, Forget and scope changes

Correction creates a new decision/knowledge revision and identifies affected contexts. Forget/revocation makes the source ineligible for future retrieval immediately, queues cleanup of eligible copies, and invalidates dependent summaries/claims. Active dsh/Live contexts that already contain the removed material must be rebuilt or stopped before further affected reasoning. Removing an index row while resuming an old raw session is not sufficient.

Keep minimal non-content tombstones for reconciliation; report physical cleanup as pending until confirmed. Approved historical artifacts and records have their defined retention policy, not an invented promise to erase another person's memory or an already published external result.

Private excerpt release is an exact versioned copy to a named project/audience. Joining the room or connecting a coding harness does not release the owner's local memory. New members do not automatically inherit a private release whose audience excludes them.

## 7. Compounding without an optimization bureaucracy

At a goal close, record outcome, actual evidence, what was changed/preserved, the next open question and a proposed lesson. Accept/Edit/Reflect is available for consequential proposals. One relevant accepted lesson must enter the next brief with its source. A successful no-change conclusion is valid.

S3 adds comparison and promotion of procedure candidates: prompt/skill/context/routing changes against a competent current baseline, fresh work, recorded failures and rollback. Do not optimize for the number of accepted cards, convert every mission into a probability or automatically rewrite identity, privacy boundaries or raw personal memory.

## 8. First proof

Import one selected project bundle, correct a stale recommendation, share only the intended portion and use it in a real brief. A fresh session recalls the current decision rather than the superseded one. A denied private source stays out of a worker handoff. Remove a source and verify a rebuilt native/voice context does not reinject it through its history. Record actual inclusion manifests; a successful generated paragraph is not proof of scope enforcement.
