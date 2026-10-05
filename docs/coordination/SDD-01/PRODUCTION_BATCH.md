# SDD-01 production batch and qualification packet

**Prepared by the implementer for Codex, the release operator.** Nothing here is authorized by this file. Every hosted step (schema, configuration, services, capabilities, a paid call, an app episode) is Codex's, under Davide's scoped approval, after review. The exact candidate commit is the one named in the `SDD-01-CC-*` message that hands this file over (a commit cannot name its own SHA); every identity below is reproducible from that commit with the command beside it.

## 0. Production state this batch starts from (Codex's read-only observations)

| Observation | Source | Consequence here |
|---|---|---|
| Hosted PostgreSQL 17.6; the migration ledger ends at **0036**; every applied hash matches the common baseline | CX-0005 (22:16 UTC) | `main`'s **0037** is applied first, then 0038–0041 (§2). Compare each hash before applying |
| Six `running` bindings on `sophia-runtime-m03-dev`: each joins an accepted attempt, a completed goal and a succeeded research job; their seven outbox deliveries are settled; 124 settled usage reservations and **one uncertain** | CX-0005, CX-0006 | Terminal work whose sessions were never closed (0012 settles no binding at publication). Closed through the native boundary by `reconcile_terminal_bindings` (§3, P4); no row is marked final by hand, nothing is cancelled, the uncertain reservation is kept |
| Auto-Deploy off on all four Render services; API `1e912b7`, worker `0391bc6`, runtime `6ec64f3`, bridge `1e912b7`; Studio `dpl_2ocnSuyh2Pbmvwf7RLtnj4upEyT1` (`6727de30`) READY | CX-0005 | Each deploy is an explicit operator action from the candidate |
| **No render runner and no render job** in the database; no renderer service in the Render workspace | CX-0007 (22:32 UTC) | A qualified renderer host is a precondition (P2). Without a `png` runner asking for work, HTML is refused at admission (`html_unavailable`) |
| The API has **none** of the five `SOPHIA_STORAGE_*` settings: its byte store is null; `/ready` does not qualify stored bytes | CX-0007 | Byte backing is a precondition (P1): captures, PDFs and every stored source's bytes need it |
| On the existing runtime host (`srv-darvmse0tbcc73d8kh3g`) the confinement prerequisite fails: `unshare … --mount --mount-proc` exits 1 (`cannot change root filesystem propagation: Permission denied`); 512 MiB memory ceiling | CX-0007 | That host cannot run the PDF or capture kernel. The renderer runs on a separate, qualified Linux host (P2); adding Playwright to the runtime build would not change this |

## 1. What ships

Verify each file identity with `sha256sum <path>` and `wc -c <path>` at the candidate.

| Component | Source | Identity at the candidate |
|---|---|---|
| Migration 0037 (from `main`, not SDD-01's) | `db/migrations/0037_amendment_preservation.sql` | Its `main` hash: must equal the candidate's file byte for byte |
| Migration 0038 design records | `db/migrations/0038_design_records.sql` | `sha256 b3b3acd5d215a2124d3a9fdabe416e7fe0a19eb8981e49774ee430673ed45bb8`, 16,404 bytes |
| Migration 0039 runtime design and review operations | `db/migrations/0039_design_runtime.sql` | `sha256 8b74ce6a1d904ffea7051e95105b7fc6a3d51877d357bb7f26425fe9a2523161`, 62,458 bytes |
| Migration 0040 admission, handoff, review loop, publication, Stop | `db/migrations/0040_design_flow.sql` | `sha256 0f0c7af6b723d2008dedf69bf9512e3c74b033681b0f890b3ab984b87996f046`, 82,492 bytes |
| Migration 0041 withdrawal, Resume, scoped edit, terminal-binding reconciliation | `db/migrations/0041_design_lifecycle.sql` | `sha256 6dc230b435f32cc341a94e731973a96cf52adfaa295e51d0cf5539baeb765a3f`, 62,159 bytes |
| Contract amendment A12 | `packages/contracts/amendments/A12-native-design.json` | `sha256 1fdf5c6d35add4e30b765fa952fe92dc5aab058c5b8e258918d469e9bd177046`; `openapi.json` `sha256 ca0dfcb751a8fa886f9abcf779caba3460ce14daa44fb36b924ba2b192c07abd`; `pnpm contracts:check` reproduces both |
| API | `apps/api` | Built from the candidate. Adds A12's runtime routes, `POST /api/v1/projects/{id}/html-edits`, the guide surfaces v1.1, v1.2 and v1.3 |
| Worker | `apps/worker` | **No source change** in this PR; redeploy only if Codex's batch rebuilds every service from one commit |
| Runtime unit `sophia-runtime-sdd01-dev` (previous `sophia-runtime-m03-dev`) | `config/runtime-unit.json` | Bundle archive `sha256 013c98535bc542ea85fbcdc8cf510d7e6e2536169d5b84313c8881d09052c365`; dsh tree `sophia-tree-v2:sha256:4552d08f78b47b7d0f16e79a92c487cffdfc5bb0a05eaef867c89ba837479a12`; workspace lock `sha256 64b294c0acc7399a341a983cec22a1b7e14e1d53bc9448f9495a413a07bf1e79`. `pnpm artifacts` must report "all artifact identities reproduced" on the build host |
| Renderer (supervisor, PDF kernel, capture kernel, host probe) | `renderers/web/pdf` (`Dockerfile` for a container host) | Capture kernel `captureSha256` `a33ed800df5ef962685bb67ce64fbb001bedd0ca3b24afbabf415199b2bc7e81`; PDF kernel `rendererSha256` `9b7a7d46214218faa573cb5d5f331867abc49af21827f3ce47ca98faa7fb56d7` (each receipt names its kernel's, so a running host is checkable); `playwright-core` 1.56.1 and its pinned headless shell |
| Studio | `apps/studio` | Built from the candidate |
| Media bridge and guide v1.3 | `apps/media-bridge` | v1.3 manifest `sha256 f1a4fc06943768f755d620ca50ddbc9649c6ec24b8ab0c45cb496be0b7492552`; prompt `83fa8bf7d9ba97b5cc2aa8e622416c0a81169d4d75bef7b1ca94b3b91ead82bc` (12,709 bytes); assembled instruction `c7865f4514a76b8d1367658abb93750167df0aaabccedbcb3efae7d6a16b75a9` (27,310 bytes); v1.3 tool declarations `ecbce82f02804c5539f27cb00e3116d97a905798ac85932ea20aee7d6ced8681`. v1.1 (`9717b92e…`) and v1.2 (`57cdfdad…`) declarations are unchanged. The default version stays **v1.2** |

## 2. Preconditions (none is met or authorized by this file)

| Id | Precondition | How it is qualified |
|---|---|---|
| P1 | **Byte backing.** The API's five `SOPHIA_STORAGE_*` settings point at a private bucket the API alone can write | A round trip through the deployed API: upload a labelled synthetic source, read it back, compare its SHA-256 and size; the stored object is private. Until then no renderer is registered |
| P2 | **A qualified renderer host**, separate from the runtime host: Linux with unprivileged user namespaces, mount propagation and a fresh `/proc` inside them (a VM, or a container whose seccomp profile and `/proc` masking allow them, `renderers/web/pdf/Dockerfile` header); a render user; bounded memory and processes; outbound access to the API only | `host-probe.mjs` run as the supervisor runs, with `SOPHIA_API_URL`, `SOPHIA_RENDER_RUNNER_TOKEN_FILE` and every secret path named: every line `ok:true`, including `render`, `kernel_checks`, `sandbox`, **`capture`, `capture_checks`, `capture_sandbox`, `capture_images`** (SDD-01) and the confinement checks. Then `sophia.register_render_runner(label, token hash)`; its first claim names `pdf` and `png` |
| P3 | **Owner decisions** O-1 (design's share of the lineage cap), O-2 (reference-image rights), O-3 (Studio CSP before enforcement; it is report-only today) | Davide (binding map §11) |
| P4 | **Zero non-final bindings on `sophia-runtime-m03-dev`** before the unit changes | With 0041 applied and the m03 runtime still connected: `SELECT sophia.reconcile_terminal_bindings('sophia-runtime-m03-dev')` as the owner (granted to no role). It adds one `native.stop` cleanup per terminal binding under a stop command of its goal; the worker dispatches them; the m03 runtime answers `checked`, which settles each binding. Then re-read: zero bindings on m03 outside `settled`/`lost`; attempts, jobs, goals, the 124 settled and the one uncertain reservation exactly as before. A denied or unknown stop is reported, never patched in rows |

## 3. Order

1. **Re-check** §0 read-only: the ledger, the six bindings and the reservation counts, the services' sources.
2. **Schema.** Apply `0037` (main's), then `0038`, `0039`, `0040`, `0041`, each in its own transaction, comparing each file's hash first. The running API (`1e912b7`) is compatible: 0038–0041 add tables and replace functions with the same signatures; research, briefs, missions and Try PDF again behave as before; nothing calls the design functions until the new API and runtime do. `pnpm test:sql` on a disposable copy of the ledger rehearses it.
3. **Byte backing (P1)**, then the **API** from the candidate.
4. **Renderer host (P2)** qualified and its runner registered.
5. **Runtime.** P4 on m03, then the runtime from the candidate as `sophia-runtime-sdd01-dev`. Its hello advertises the designer and the reviewer only when their assets verify, dsh's attachment service is mounted and the route declares image input.
6. **Studio** from the candidate.
7. **Bridge** from the candidate with `SOPHIA_GUIDE_VERSION` unset (v1.2, unchanged declarations). HTML is asked for by v1.2 already (format-driven admission); its outdated sentence about every report downloading as an HTML page is v1.2's until the cutover.
8. **Guide v1.3 cutover**, after the API is live and §4's L2 probe: set `SOPHIA_GUIDE_VERSION=v1.3` on the bridge. The bridge checks `/v1/media/tool-surface?guide=v1.3` against its own declarations before it connects, so an API without v1.3 stops it rather than offering a missing tool.

## 4. Qualification packet

| Level | What | State |
|---|---|---|
| L0/L1 | Every B-case at its level, [progress record](../../progress/SDD-01.md) §3; `pnpm check`, `pnpm test:db`, the required renderer job (now with `capture-html.test.ts` and the design capture crossing, SDD-01-RF-0004) | Run by the implementer at the candidate (CC message) |
| Host | P2's probe on the chosen renderer host | Codex |
| Storage | P1's round trip | Codex |
| L2 (O-5) | One design on `research-sol-medium-v1` from a published synthetic report, with a planted visual defect the hard gate cannot see (grey micro-text on the sources and caveats, or a decorative block competing with the summary): the designer's captures and the reviewer's must reach the model (attachment ids in the session journal), and the reviewer must return `needs_revision` naming the defect and the capture. Spend within the lineage cap, every call reserved and settled, usage recorded | Codex under Davide's approval |
| G6 native arm | The four frozen inputs (`docs/coordination/SDD-01/g6/inputs.json`) through the native designer on the deployed runtime; record factual preservation, readability, visual quality, correction effort, latency and measured usage separately (pack 03 G6), beside the control arm already measured | Codex under approval |
| L3 (G7) | The synthetic in-app episode of pack 03 G7: Create (HTML asked for by voice), an active steer, leaving and returning, a section-only revision (guide v1.3 `revise_html_page`, or the HTTP route), a stale response (an edit of a superseded version), Hold and Resume, Stop; and a withdrawal (forget a note the research used) that ends the design. Synthetic identities or their actual authorization | Codex |

## 5. Rollback

- **Guide:** unset `SOPHIA_GUIDE_VERSION` (back to v1.2, byte-identical declarations).
- **HTML off without a rollback:** revoke the `png` runner, or run a runtime without the designer: admission then refuses HTML (`html_unavailable`), Markdown is offered; a design in flight is ended by Stop.
- **Runtime:** back to `sophia-runtime-m03-dev`, rebuilt from its own commit, after the same reconciliation on `sophia-runtime-sdd01-dev`.
- **Schema:** forward-only. 0038–0041 add tables and replace functions; a revert is a new migration restoring earlier function bodies, which this PR does not prepare.

## 6. Combined handoff with WBC-02 (#107)

- Merge order (Codex, CX-0003): **#104, then #107** rebased and regenerated from the merged sources. WBC-02 takes migration `0042` and amendment A13.
- 0041 (`sha256 6dc230b435f32cc341a94e731973a96cf52adfaa295e51d0cf5539baeb765a3f`) replaces, with the same signatures: `mission_erase_source`, `native_delivery_ineligible`, `research_queue_unstarted`, `design_scope_of`, `runtime_design_context`, `runtime_design_render_result`, `runtime_review_context`, `design_fail`, `design_publish`, `design_task_statement`, `review_task_statement`, `design_admit_review`, `design_candidate_failures`; it adds `reconcile_terminal_bindings`. It does **not** replace `capture_native_result` or `dispatch_runtime_outbox` (0040's stay current). A 0042 that replaces any of these starts from 0041's body and keeps its branches.
- The combined runtime unit is rebuilt by the second lander (`pnpm artifacts:record`), with all three new roles beside research.
