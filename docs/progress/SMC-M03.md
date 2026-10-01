# SMC-M03 progress: research specialists, Markdown/PDF delivery and Knowledge

The mission: [M03](../missions/2026-09-27-companion-research/missions/M03_RESEARCH_WORKFLOW.md), pack v1.1. Coordination: issue [#31](https://github.com/davidelaverga/Sophia/issues/31). Plan: [SMC-M03-plan.md](SMC-M03-plan.md) (approved). Contract binding: [SMC-M03-contract-binding.md](SMC-M03-contract-binding.md). State: [SMC-M03-state.json](SMC-M03-state.json). Coordination mirror: [docs/coordination/SMC-M03](../coordination/SMC-M03/README.md).

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**Checkpoint, 2026-10-01, attempt 1: S0 (bind) and S1 (readers first, byte store, report content and Knowledge reads) are done. S2 (registry and execution policy) is next. Nothing is merged, released or deployed.**

| Readiness | State |
|---|---|
| Source-ready | No: S0 and S1 are in PR #32; S2 to S7 are planned (plan §4) |
| Merge-ready | No |
| Release-ready | No: every hosted step is a Codex operation with Davide's bound approval (plan §5) |
| Hosted-verified | No. This attempt touches no hosted state |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `ba983e7` (merge of #23; #29 merged at `41ac3e7`, then #28 and #23) |
| Luis's work included | #24 (`studio/side-chat`) merged at `19a41e0` in `da7660e`, as Davide asked ("targets also Luis's latest changes"). #30 is not included yet (§5) |
| Branch | `claude/smc-m03-research` |
| Implementation PR | [#32](https://github.com/davidelaverga/Sophia/pull/32) (draft, base `main`) |
| Implementer | Claude Code, session `https://claude.ai/code/session_018hCUhiK4hgMf5V5QPbkC9S` |
| Operator | Codex, woken by Davide on #31 |
| Toolchain on this host | linux-x64, Node 24.21.0 (tarball checksum verified), pnpm 11.7.0; `pnpm install --frozen-lockfile` exit 0 at `da7660e` |
| Harness | dsh `0.2.0-rc.2` at `639ed01` (unit `sophia-runtime-m02-dev`, cut over by OP-0003) |
| Hosted gate | M02 OP-0003 complete and verified ([CX-0015](https://github.com/davidelaverga/Sophia/pull/29#issuecomment-5921358520)) |

## 2. Goals

| Goal | Slices (plan §4) | State |
|---|---|---|
| G1 Source access | S0, S1, S3 | S0 and S1 done (§6, §7); S3 after S2 |
| G2 Durable Markdown | S2, S4 | planned |
| G3 PDF | S5a (renderer host, Codex probe), S5b | planned; the host depends on CC-0001 and D6 |
| G4 Voice and text | S6 | planned |
| G5 Mission loop and release | S7 | planned |

## 3. Owner decisions

All recorded in plan §8. D1–D10 decided on 2026-09-30, with D1 raised to **$5 per task** and $40 for qualification, and D3 set to `main`. L6, U3 and U4 approved on 2026-10-01. L1–L5 and U1 are proposed for Luis's review.

## 4. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M03-OP-0001 | read only | [CC-0001](../coordination/SMC-M03/SMC-M03-CC-0001.md) ([posted](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5921937526)) | awaiting Codex. Wake line: `SMC-M03: read SMC-M03-CC-0001 on #31 and act within its scope.` |
| SMC-M03-OP-0002 | review and local tests | [CC-0002](../coordination/SMC-M03/SMC-M03-CC-0002.md) ([posted](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5922184205)) | a cloud `@codex` task answered [CX-0001 `blocked`](https://github.com/davidelaverga/Sophia/issues/31#issuecomment-5922580395): the candidate was absent from its checkout, and it had no Node 24.21.0 and no PostgreSQL. Still awaiting the operator Codex. Wake line: `SMC-M03: read SMC-M03-CC-0002 on #31 and act within its scope.` |

Cloud Codex review of #32 at `29bb825` (Davide's request, [comment](https://github.com/davidelaverga/Sophia/pull/32#issuecomment-5922653573)): verified by Claude.
- The PR is not end to end yet. That is true, and by plan: it stays a draft until S7.
- The mission state named the S1 part 1 commit. Fixed.
- Three docs ended with a blank line (`git diff --check`). Fixed.
- Its suites did not run there, because Node 24.21.0 and the dependency set were unavailable. CC-0002's test item stays open for the operator Codex.

No hosted effect, deployment, migration, paid call or credential use happened in this attempt.

## 5. Luis's open work

- **#24** is merged into this branch. The delivery UI builds on its `SidePanel`.
- **#30** conflicts with #23's review fixes on `main` (`App.tsx`, `route.ts`, `route.test.ts`, `CONTRIBUTING.md`, and `ProjectHome.tsx` deleted vs changed). Those resolutions are Luis's. This branch merges #30 once Luis updates it on `main`. It owns `0021` and `A10`; M03 starts at `0022` and `A11`.
- The cross-project Knowledge library (L6) lands in #30's Work place after that merge.

## 6. S1 part 1: readers first

What a later release writes, these readers already read. No writer exists in this slice.

| Surface | Change | Evidence |
|---|---|---|
| Schema | `0022_research_readers.sql`: <br>• `markdown` format; <br>• report description (revisioned) and per-version notes, `change_facts`, trigger, number and limitations; <br>• `artifact_renditions`; <br>• job parent and report links, with one task job per attempt and children without an attempt or command; <br>• cache usage columns; <br>• `is_task_kind` allowlist in the task view and in `media_assignments` | `pnpm test:sql`: 21 migrations; `research-readers.db.test.ts` 5/5 |
| Contract | A11 read side ([binding §3](SMC-M03-contract-binding.md)); runtime wire unchanged | `pnpm contracts:check` |
| Persistence | `readArtifacts` (each report's stable version and its renditions, at most 100); the artifact refusal removed; the real task kind and `artifactId`; result outputs and cache usage | `pnpm test:db` 203/203 (198 before) |
| Bridge | Result notices by kind; an unknown kind is skipped, never blocking a known one | `room-session.test.ts` 93/93, mutation-checked |
| Studio | Task kind and research phase words; the work heading by kind; `native_task.research` summary | `conversation-view.test.ts` |
| API | `research` summary code; `/ready` requires 0022 | `pnpm check` |

Left for S4, where research writes usage: the task detail reports the usage of the attempt's latest model call (the brief's rule, one step). A research attempt makes many calls, so its detail will sum them per attempt.

Compatibility: every added property is omitted when it has no value, so an older Studio or bridge reads every pre-M03 record unchanged. 0022 must be applied before an API that carries these readers (`/ready` says so). No research row can exist until the writer release, which follows the release carrying these readers.

## 7. S1 part 2: byte store, report content and Knowledge reads

| Surface | Change | Evidence |
|---|---|---|
| Byte store | `ByteStore` port (`apps/api/src/byte-store.ts`): write-once objects at `<project>/<source>`, signed GET URLs with an optional download name; a Supabase Storage REST adapter (config `SOPHIA_STORAGE_URL`, `_KEY`, `_BUCKET`, all or none) and an in-memory one. **Not exercised live**; the credential question is in [binding §8](SMC-M03-contract-binding.md) | `byte-store.test.ts` 6/6 |
| Report content | `GET /api/v1/sources/{id}/content?disposition=`: published report versions and their renditions only (never a candidate or a rejected version); inline text as text, stored bytes as a 120-second URL; `no-store`; not ready → 409; no store → 503 for stored bytes only | `sources.db.test.ts` 5/5 over HTTP, mutation-checked |
| Knowledge | `GET /api/v1/knowledge/reports?project=<id>|all&format=&q=&cursor=` (cards, per-project counts, 30 per page) and `GET /api/v1/artifacts/{id}/versions` (published versions with notes) | `knowledge.db.test.ts` 5/5: <br>• isolation across projects (no card, count or name from another project); <br>• format and search; <br>• paging; <br>• no candidate version; <br>• guest refused |
| Studio | Icons `download`, `expand`, `collapse` (L4); `api/artifacts.ts` for the three reads | typecheck |
