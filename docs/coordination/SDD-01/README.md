# SDD-01 coordination (Claude ↔ Codex)

SDD-01 is the native dsh HTML design mission: a requested HTML research deliverable is designed by a native designer role from its frozen research, checked in its rendered pixels, reviewed by a separate native reviewer, saved as an immutable rendition, steered while it works and revised by section later (Sophia Native Design Mission Pack v0.1, [installed here](../../missions/2026-10-04-native-design/00_START_HERE.md): `03_SDD01_MISSION.md`). It starts from M75's merged foundation ([handoff](../M75/HANDOFF_TO_SDD01.md)).

| Item | Value |
|---|---|
| Mission | SDD-01 |
| Protocol | [`sophia.dev-handoff.v1.1`](../../missions/2026-09-27-companion-research/shared/CLAUDE_CODEX_PROTOCOL.md) with the `sophia.native-design.v0.1` profile ([pack 07](../../missions/2026-10-04-native-design/07_COMMUNICATION_PROTOCOL.md)) |
| Message ids | `SDD-01-CC-####` (Claude), `SDD-01-CX-####` (Codex), findings `SDD-01-RF-####`, operations `SDD-01-OP-####`, allocated from the coordination issue |
| Coordination issue | [#103](https://github.com/davidelaverga/Sophia/issues/103) |
| Branch / PR | `claude/sdd01-native-html-design` / [#104](https://github.com/davidelaverga/Sophia/pull/104) (draft) |
| Base | `main` `ed6f3cd` |
| Implementer | Claude Code (cloud session); sole implementation writer for the paths in the [binding map](BINDING_MAP.md) §1 |
| Reviewer / operator | Codex: independent review, isolated verification, the hosted operations and the in-app tests. Its source writable scope is empty unless a `codex/*` path list is assigned |
| Owner | Davide: product, spend, merge and release. Luis: integration review (AGENTS.md) |
| Parallel track | WBC-02 (Paperclip source review), under the [proposed addendum](PARALLEL_EXECUTION_ADDENDUM.md); shared-boundary requests in the binding map §9 |
| Progress | [docs/progress/SDD-01.md](../../progress/SDD-01.md) |
| Release packet | [PRODUCTION_BATCH.md](PRODUCTION_BATCH.md): what ships, its identities, preconditions, order, qualification and rollback |

A comment wakes nobody. Davide resumes either agent with one line, for example: `SDD-01: read <the latest SDD-01-CC message> on <the coordination issue>, recover the exact candidate and operation revision, and act only within its scope.` No message here is an approval: merging, releasing, hosted reads or writes and paid calls each need Davide's own scoped approval.

## Messages

| Id | Kind | Operation | State |
|---|---|---|---|
| [SDD-01-CC-0001](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-5999501561) | review_request | OP-0001 r1: G0 binding and G1 import at `16fb5c6` | Awaiting Codex |
| [SDD-01-CC-0002](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6001384489) | review_request | OP-0002 r1: G2–G4 and the G5/G6 parts at `a53480b` | Superseded by r2, r3 (CC-0003, CC-0004: main merged) |
| [SDD-01-CX-0001](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6002542800) | prepared | OP-0001 r1 | Codex's G0/G1 review started |
| [SDD-01-CX-0002](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6002761520) | review_finding | OP-0002 r3 at `b1e227e` | RF-0001, RF-0002 (P2): changes required; review continues |
| [SDD-01-CC-0005](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003217977) | review_request | OP-0002 r4: RF-0001 and RF-0002 fixed, at `719a402` | Superseded by r5 |
| [SDD-01-CC-0006](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003598634) | review_request | OP-0002 r5 at `a67979b` (main merged, lint fix) | Reviewed in CX-0003, CX-0004 |
| [SDD-01-CX-0003](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6003915137) | review_finding | OP-0002 r5 | RF-0001, RF-0002 `pass_for_scope`; RF-0003 (P1) and the completion request |
| [SDD-01-CX-0004](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004171711) | review_finding | OP-0002 r5 | RF-0004 (P2): the required renderer CI omitted the capture kernel |
| [SDD-01-CX-0005](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004340895), [CX-0006](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004451148), [CX-0007](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004569512) | prepared | production preflight (read-only) | The ledger at 0036; six terminal running bindings on m03; no renderer, no byte store; the runtime host fails the confinement prerequisite. Folded into [PRODUCTION_BATCH.md](PRODUCTION_BATCH.md) §0 |
| [SDD-01-CC-0007](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005077740) | review_request | OP-0002 r6 at `e35111a`: RF-0003 and RF-0004 fixed, the G5 gaps closed, guide v1.3, the production batch | Reviewed in CX-0011 |
| [SDD-01-CX-0008](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004667171) | prepared | `main` at `c794558` | `DocumentPane.tsx` conflicts with #111 and #112 |
| [SDD-01-CX-0009](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6004902299), [CX-0010](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005013346) | prepared | old-work cutover; donor and runtime compatibility | Align the old unit's guard with WBC-02-CC-0007; no Stop of completed histories to meet it. Donor identity and old-profile compatibility pass for scope |
| [SDD-01-CX-0011](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005247909) | review_finding | OP-0002 r6 at `e35111a` | RF-0003 and RF-0004 `pass_for_scope`; merge main, correct P4, keep B-15's evidence level |
| [SDD-01-CX-0012](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005319979) | prepared | `main` at `7819832` (#113) | Integrate against it; keep the room composer's attribution and discussion |
| [SDD-01-CX-0013](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005512557), [CX-0014](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005568466) | prepared | byte backing; combined gates; old reports | Supabase Storage proposal and its key's scope; renderer host still to qualify; steer routing and the old-report amendment path as combined gates; the Voice Lab harness suspended. CX-0014: a completed report is not rebuilt, so no second host |
| [SDD-01-CC-0008](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005739571) | review_request | OP-0002 r7 at `4c4b647`: main merged (#111–#113), P4 aligned with WBC-02 and CX-0014, the Stop helper withdrawn, B-15 recorded at the service boundary | Reviewed in CX-0016 |
| [SDD-01-CX-0015](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005690957) | prepared | storage compatibility | Supabase Storage's PutObject upserts and ignores `If-None-Match`: P1 stays open until a live no-replace put is qualified |
| [SDD-01-CX-0016](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6005863218) | review_finding | OP-0002 r7 at `4c4b647` | No source finding; merge `main` at `ffb2a2c` (#114), whose `DocumentPane.tsx` conflicts |
| [SDD-01-CC-0009](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6006225962), [CC-0010](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6006368317) | review_request, evidence | OP-0002 r8 at `8136ef4` | Merged as #104 (`06c624a`, CX-0018) |
| [SDD-01-CC-0011](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6006708875) | operator_handoff | Native active Steer and visual perception on the combined unit | Prepared; nothing run |
| SDD-01-CX-0019, CX-0020, CX-0022 | review_finding | Five late automatic findings on #104 | Corrected on #117 (0043, A14) |
| [SDD-01-CC-0012](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6006793192), [CC-0013](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6007095072), [CC-0014](https://github.com/davidelaverga/Sophia/issues/103#issuecomment-6007136485) | plan, status | Ownership, triage and the fix plan; the local PostgreSQL lost; #117 published | — |
| SDD-01-CX-0025 to CX-0027 (on #117) | review_finding, evidence | 0043's function order; Codex's PostgreSQL 17.6 runs, adverse probe and mutation checks | Fixed at `d4d5124`; see the progress record §5a |
| SDD-01-CX-0028, CX-0029 (on #117) | evidence, review_finding | Codex's full database suite (512/512 at `f5a54fa`) and `pnpm check` (`d4d5124`); the packet's runtime-unit and OpenAPI identities | Recorded; the identities corrected in the packet |
| SDD-01-CX-0030 to CX-0036 (on #117) | review_finding, design note | The final-head review's P1s: attribute text (CX-0031, CX-0032: citation markers) and an acknowledgement whose answer is lost (CX-0033, CX-0034); CX-0035 and CX-0036 on the delivery mechanism | Fixed on #117: the attribute family at `70068b0` and `42bf820`; receipts named by the submit at `92bbbe9`; see the progress record §6 |
