# Mission ledger — SOPHIA-INC-2026-11

This is the programme's coordination record, laid out like [the mission ledger template](../execution/2026-11-08-incremental/templates/MISSION_LEDGER.md). It is a **timestamped snapshot**, not a permanently current record.

- **Snapshot time.** Coordinator facts at 2026-11-09T20:38:52Z (INC00-DOC-002-r3-FACTS.json, SHA256 `dabad5bd34a7c97bde45f34303b2a9c3d68ff903683b253cb07870e6d1b7bbb1`), plus read-only GitHub and Git observations by the INC00-DOC-002 author at 2026-11-09T20:42–20:44Z. Updated with the coordinator's security addendum (prompt SHA256 `69dff2cf287abe67e4ddb93f9f64ccf8e705ccd8168d1668f4bad85c997eaae1`, received about 20:58Z) and the independent assessment INC00-RELEASE-TRUST-SECURITY-ASSESSMENT-001 (2026-11-09T20:51:20Z, SHA256 `17665c62…`).
- **Reconcile before acting.** Before any new assignment, dispatch, replay, merge or release, check each row below against the current source (`git ls-remote`, PR heads), the actual actor sessions and the current-head reviews. Record what changed.
- **Unknowns stay unknown.** An empty or `unknown` cell is an unresolved fact, not permission to invent a value.
- **Keep identity types apart.** A Git commit or tree is a 40-hex Git object ID. An assignment or document digest is the SHA256 of a prompt or record file. A review record digest is the SHA256 of a review record file. A source-diff digest is the SHA256 of a canonical diff. A session ID names a native session. Never use one type in place of another. In particular, never treat an assignment or prompt digest as a Git base.
- **Keep private data out.** Secrets, raw private transcripts and held-out evaluation material stay outside Git.

Each fact is marked by where it comes from:

- **(supplied)**: the coordinator's facts, or the independent reviewer's records. The documentation author did not read the owner's host.
- **(observed)**: the documentation author read it itself on 2026-11-09, between 20:42 and 20:44Z.
- **(history)**: the 2026-11-08 installation record.

Stable references:

- Programme: [the pack entry](../execution/2026-11-08-incremental/README.md), [INC-00](../execution/2026-11-08-incremental/modules/INC-00_BASELINE_AND_INSTALLATION.md).
- Process: [delivery and review](../execution/2026-11-08-incremental/operations/DELIVERY_AND_REVIEW.md), [design approval](../execution/2026-11-08-incremental/operations/DESIGN_APPROVAL.md).
- Current mapping: [baseline](../coordination/SOPHIA-INC-2026-11/BASELINE.md), [contract map](../coordination/SOPHIA-INC-2026-11/CONTRACT_MAP.md).
- Installation: [the installation handoff and its repair history](../handoffs/INC00-DOC-001.md); the latest INC-00 attempt is [INC00-DOC-003](../handoffs/INC00-DOC-003.md).
- **Active restriction:** the [release-trust amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md). Credentialed release from source-exposed contexts is on hold, and enforcement is unqualified. Where they conflict, it takes precedence over the pack's reviewer-deployment passages.
- Programme issue: https://github.com/davidelaverga/Sophia/issues/502.

## INC-00 continuation (dated 2026-11-09T23:04–23:20Z; supersedes only the INC-00 and PR503 rows below)

The rest of this ledger stays the snapshot dated above. Reconcile before acting. Sources: the independent final review
INC00-DOC-003-r1-SOURCE-FINAL-001 (2026-11-09T23:04:18Z, review record SHA256 `b64b888b…`, supplied), and the
documentation author's `git ls-remote` and fetch at 23:10Z (observed).

| Attempt | Author / session | Commit / tree / parent | Changed paths | Review | Published |
|---|---|---|---|---|---|
| INC00-DOC-002 r4 | Documentation author `session_01FGXfrGdEeRRkWqHnZfiF8C` | `422e9ba` / `e9ff5278` / `4cb4bbe` | Four INC00-DOC-002 paths; 46 against base | Pre-push accepted (review record SHA256 `3ebce818…`). Its automatic review raised P1 `r4518692235`. Final gate `needs_revision` (supplied). | Yes |
| INC00-DOC-003 r1 | Backend author `session_01FGXfrJoUMojmJSW3H7XfoG` | `f6175c83` / `d78e54ca` / `422e9ba` | `docs/SOURCE_MAP.md` only; 47 against base | Pre-push accepted (review record SHA256 `251818db…`). Final gate `needs_revision` for two automatic P2s (supplied). | Yes: PR503 head at 23:10Z (observed) |
| INC00-DOC-003 r2 | Documentation author `session_01FGXfrGdEeRRkWqHnZfiF8C` | Local child of `f6175c83`, with subject prefix `docs: INC00-DOC-003 r2`. Its head and tree are bound by the export manifest whose `source.head_git_commit` equals it. Earlier unpublished amendments `970eca9` and `675b9d6` and their exports are history. | Four paths; 48 against base | Pending: same reviewer, whole 48 paths | No |

The full record of these attempts is in [INC00-DOC-003](../handoffs/INC00-DOC-003.md): identities, digests, evidence
locations, CI and review threads.

**Current state.**
- **Merge.** Not merged. Luis/EdX2C's integration review is requested, with no approval.
- **Security.** The security review on `f617` returned `null` finding flags, which is not clear, and the Medium advisory
  `r4517682095` is still open.
- **CI.** CI on `f617` (42716479853) had 2 jobs succeeded and 6 running at 23:03Z. The earlier `422e9ba` run
  (42710881865) is not a complete pass, and the `4cb4bbe` failure (42693446183, `home.spec.ts:301`) is retained.
- **Backend map.** Its reconciliation is planned and pending.
- **Design.** UI r2 received a changes request, and r3 is being implemented, not approved.
- **Release trust.** The release-trust hold is unchanged.
- **Acceptance.** The register still has 3 historical passes and 131 `not_run`. The issued CSV stays at 134 `not_run`.

**Next INC-00 action.** The independent reviewer reviews r2. If accepted, the coordinator publishes it to PR503, then CI
and automatic review run on the new head, then Luis decides on integration.

## Identity and current authority

| Field | Actual value / evidence |
|---|---|
| Coordinator thread and native session | Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81`, `/root`. It is the only coordination authority under the user's brief. There is no second coordinator, manager or tester. |
| Human product owner | Davide |
| Repository / current main / worktree | `davidelaverga/Sophia`. Main is `953e5dc3d4c88e491517f3f0d0eaa18216fea98f` (observed, `git ls-remote`). The coordinator worktree is `/Users/davidelaverga/Documents/Codex/2026-11-08/sophia-inc-00` on branch `docs/inc-00-install-20261108`. The common Git dir is `/Users/davidelaverga/Documents/Codex/2026-08-19/pl/Sophia-browser-account/.git` (supplied). |
| Installed spec/amendment commit | **Not installed on main.** The documentation is in [PR503](https://github.com/davidelaverga/Sophia/pull/503), which is open, not a draft and not merged (observed). The published head is `4cb4bbe55144aab92f09b7c96f55363ccbb59731`, tree `490ad4dcffb21e6e602d807cf10efe4bf1d00c6c`. Its parent is the original install, `afe68b679722e28471dcdf6222d519759cd78c49`. PR synthetic merge commit `cbb8a619…` is not a merge to main (supplied). A local r3 repair is in progress; see "Review and release". |
| Current release / URL / runtime / configuration | https://studio.sophia-ei.com. The deployed identity is **unknown** and not refreshed. No new source has been merged, deployed or app-verified. Earlier application builds are history only; refresh the exact tuple before any deployment. The user confirmed the Sophia Render workspace as `tea-d38p978dl3ps73a64hi0`. `config/runtime-unit.json` is unchanged, and no native account qualification follows from it (supplied). |
| Merge/integration authority | Luis/EdX2C holds the integration and merge role. A review is requested on PR503, with no formal approval or delegation (observed). There is no merge or deployment override. |
| Deployment/test authority and allowance | No new payer or account grant, recharge, or spending authority. The earlier $50 campaign allowance is history and is **not** imported. Sessions, the cumulative allowance and unresolved effects were not reset when the hold was lifted. |
| Release trust | **Credentialed release from any source-exposed context is on hold** under the [release-trust amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md). Release goes through an already-authorized owner or operator (DEP-R01), or a fixed-scope executor whose restrictions are enforced outside the model and demonstrated. Operational enforcement and isolation are **unqualified**. The assessment found no exposure or exploit. No release is needed now. |
| Independent Codex review/test thread | `/root/independent_review_app` is the only independent source reviewer **and** the later app tester. Source review and app testing are separate evidence stages. It never fixes a candidate it reviews. |
| Claude Code designer / Impeccable pin | INC01-DES-001, session `session_01FGXfrKKdKs2Y9XbfrHzs3s`. Impeccable `924bbd194d02e5e15a227e75b5901fb0d7a4ecad` (context 4.8.1, engine 0.1.19) was used and hash-verified. No hooks, settings or dependencies were changed (supplied). The earlier prototype `local_33df033c-b89d-497c-911c-a2b0b70a7f61` was preserved (history). |
| Delivery authentication | Claude Code **web delivery** authors are signed in and working. That proves the authoring route only. Product-native owner authentication, accounts, billing, profiles, read-only mode and toolkit qualification are **unproved** and separate. The 2026-11-08 CLI `loggedIn: false` status is history and is not current proof either way (supplied). |
| Global user hold | **Lifted.** Davide followed his stop request with "Please continue" and "disregard the stop" ([PR503 comment](https://github.com/davidelaverga/Sophia/pull/503#issuecomment-6733554871), observed). It is the same programme; sessions, allowances and unresolved effects were not reset. |
| Last reconciled at | 2026-11-09T20:38:52Z (coordinator facts), 2026-11-09T20:42–20:44Z (author observations), and about 20:58Z (security addendum and observer r3 status, supplied). Reconcile again before acting. |

## Mission status

| Mission | Phase | Current slice | Hold / blocker | Owner | Candidate / release | Required evidence outstanding | Next action |
|---|---|---|---|---|---|---|---|
| INC-00 | in_progress | Documentation installation and the source/ownership map | PR503 has a valid automatic P1 and P2 on this ledger, and the repair (now r4) is local. The security advisory on a frozen pack prompt is answered in r3 by the release-trust amendment (credentialed release on hold; enforcement unqualified). Integration is pending. | Coordinator. INC00-DOC-002 author for the current four-path repair; the earlier unpublished two-file r3 `ff5e884` is history. | PR503 head `4cb4bbe`. Not on main. | AC-00-02 (reviewed integration); AC-00-04 to AC-00-08 | r3 independent review, then publication, current-head CI and automatic review, then Luis |
| INC-01 | in_progress | Source only: backend runner and resource UX | Backend r1 needs revision, and r2 is being verified. Real dispatch is OFF. The UI part is held by the design gate. | INC01-CC-002 (backend). INC01-DES-001 (resource UX, stopped). | Backend r1 `091a3b6` (needs_revision). Designer `00d8193` (source accepted). | Real owner host, native pairing, account, model, effort, read-only mode, MCP scope and API sharing are all not_run. No activation. | Backend r2 immutable export, then independent review. Davide's design decision. |
| INC-02 | not_started | — | Waits for **one** owner's Codex and Claude native pair, with recovery and control, to be qualified | Coordinator, when unblocked | — | All INC-02 cases | Start once the first pair qualifies. Do not wait for the other owner or the API slice. |
| INC-03 | in_progress | Offline intake-observation policy, source only | r2 needs revision for two residual P2s. r3 has been handed back but is not yet reviewed. No live automatic routing. | INC03-CC-001 | r3 `d009d1e`: exported and verified by the coordinator, not reviewed, not published. r2 `9ff4ab8` needs revision. | No live intake, no AC-03 pass, no routing-accuracy pass | r3 immutable export, then independent review |
| INC-04 | not_started | — | Real automatic allocation needs qualified explicit execution first | — | — | All INC-04 cases (required) | None until INC-01 and INC-02 qualify |
| INC-05 | not_started | — | Real voice, continuity and founder-release evidence remain required | — | — | All INC-05 cases (required) | None yet |

Separate a shipped slice from whole-mission closure. AC-02-17 remains a mandatory overall gate even after the first repository release.

**Current composition (INC01-COHERENT-001, development).** One local development commit composes the accepted owned slices (API, custody, S01, resources, Personal P1 and P2 r1, S2, UI, member read) on published native `45564a5a`. It also carries 0100, the bounded repair of the inherited rebuild funding finding CW2-REBUILD-F01 (P1). It awaits the independent whole-diff gate; it is not published, merged or activated, and native post-push gates on `45564a5a` remain pending.

## Work and resource ownership

There is one writer per path or effect. Scopes are as supplied; do not widen them without a new assignment.

PR499 (`b799e46fe16ce5b068297faecbe0c8c98071e529`) and PR501 (`502b9d5383a6a9e3cf908cdf0506d29dff8033ae`) stay with their existing owners, Davide and Luis/EdX2C. The 20:35Z conflict check found that neither PR touches either path in INC00-DOC-002's r3 scope (supplied).

| Assignment | Thread / role | Branch / base | Writable files/effects | Dependencies | Binding / grant | Active operation / native session | Handback |
|---|---|---|---|---|---|---|---|
| Coordination | Codex coordinator `01a1bd48-…` | — | Coordination, publication of reviewed candidates to existing PRs, the canonical acceptance register | — | No new grant | Active | — |
| INC00-DOC-002 | Claude Code documentation repair author | `claude/upbeat-feynman-xuqimy`, local child of `4cb4bbe` | Exactly four paths: `docs/handoffs/INC00-DOC-001.md`, `docs/progress/SOPHIA-INC-2026-11.md`, the new `docs/coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md`, and `docs/execution/README.md` (navigation for the active hold only). The coordinator delegated these for r3 after no-overlap checks. | Independent review | None | `session_01FGXfrGdEeRRkWqHnZfiF8C`. r3 local, unpushed. | [Handoff](../handoffs/INC00-DOC-001.md) |
| INC01-CC-002 | Claude Code backend author | `claude/kind-hawking-j07uzz` | Sole writer for the 0092/A47 generated runner contract, coordination `runner*`/t3 mapping, runner persistence operations, API and worker runner wiring with tests, and its assigned maps, plan, handoff and qualification docs. Write assignment: owner-local `assignments/INC01-CC-002-WRITE.md`, assignment document SHA256 `500ed3c2a9e2c3cebdf9e9094f17518e86c4d764478394998505c08d2872f733`. That is an assignment digest, **not** a Git revision. Git source base: commit `953e5dc3d4c88e491517f3f0d0eaa18216fea98f`, as the independent reviewer read from that assignment (supplied). | Independent review | Real dispatch OFF | `session_01FGXfrJoUMojmJSW3H7XfoG`. r2 repair active. | Not yet in the repository |
| INC03-CC-001 | Claude Code observer author | `claude/stoic-bell-cefqur` | Only the coordination `intake-observation.ts` and its test, the `intake-observe.ts` script and its test, `tests/unit/intake-observe-registration.test.mjs`, and its two docs (supplied) | Independent review | Offline, zero effects | `session_01FGXfrGsUA6jNm3sxRoSro2`. r3 handed back. | Not yet in the repository |
| INC01-DES-001 | Claude Code designer | `claude/determined-ritchie-eujmht` | The resources feature, resources browser checks, three design handoff/plan docs, and a shared receipts-truth-and-Hold-only `work.spec` extension. No composer, room, global theme or backend (supplied). | Davide's design decision | None | `session_01FGXfrKKdKs2Y9XbfrHzs3s`. **Stopped** under the design hold. | Not yet in the repository |
| Independent review/test | `/root/independent_review_app` | — | Review and test evidence only. Never the candidate's source. | — | None | Active | Review records (owner-local) |

## Durable controls and unknown effects

| Scope | Hold / Stop / pending permission / unknown effect | Current revision / generation | Original operation | Allowed observation/control | Decision owner | Next reconciliation |
|---|---|---|---|---|---|---|
| Programme | Global hold **lifted** | 2026-11-09 | User stop request | Normal assignments within existing scopes | Davide | — |
| Credentialed release (all missions) | **Release-trust hold** (procedural). Enforcement unqualified. | [Amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md) RTA-R02 | Security P2 `discussion_r4517682095` | Source review and in-app testing without release privileges. Release through an authorized owner or operator after a §4 envelope. | Coordinator, with the existing owner or operator authority | Before any release, and at amendment integration |
| INC01-DES-001 resource UI | Design hold: `awaiting_design_approval` | Candidate `00d8193` | Formal candidate question sent to Davide. No answer received. | Read-only inspection; unrelated backend work continues | Davide | When Davide answers |
| INC01-CC-002 | Real dispatch OFF. No native, provider or account operation qualified. | r2 in progress | — | Source and test only | Coordinator | On r2 handback |
| INC03-CC-001 | Offline only, zero real effects | r3 `d009d1e` handed back | — | Source and test only | Coordinator | On r3 handback |
| Review PostgreSQL 16.15 cluster | **Stopped** after fake/synthetic probes | — | Reviewer's disposable cluster | None needed | Reviewer | — |
| Local UI preview | **Running**, simulated only: `127.0.0.1:5209`, Vite fixture `95784`. No native effect. | — | Design decision support | Viewing only | Coordinator | When the design decision is made |
| Product effects | None from these source assignments. No account or allowance reset. No unknown product effect silently settled (supplied). | — | — | — | Coordinator | Every reconciliation |

## Design gates

| UI scope | Candidate / fingerprint | State | Davide decision reference | Final material-delta check | Dependent work held |
|---|---|---|---|---|---|
| INC01-DES-001 resources UI | `00d8193c56ac42d2cc8ee31a4f96a0c479141c5f`, tree `c1a1f0d09aedf346d48b12e2d2d55ed983eca5ab`. Source review accepted (review record SHA256 `d80f3c2f…`), and 40 focused tests passed independently. | `awaiting_design_approval`. Source acceptance only, which is not design approval. | Formal exact-candidate question sent. **No decision received.** | Pending | Designer stopped. Affected UI merge, promotion and dependent expansion held. |

Supporting evidence for the design gate (supplied) is simulated only. It is 13 earlier before/after pairs plus 4 new Hold pairs, at desktop and narrow widths. The raw browser run was 316 passed with 1 unchanged failure, plus an isolated 5/5 pass. That is **not** "317 passed", and it is not native or app acceptance. Final CI, app, physical Safari and native proof are pending.

## Review and release

| PR / pushed head | Pre-push review | Introduced commits | Automatic coverage | Final source review | Design gate | Merge / build / deployment | App verification |
|---|---|---|---|---|---|---|---|
| PR503 at `afe68b6` (history) | Accepted (history) | `afe68b6` | First code review was clean, but it is superseded. Then P2 `discussion_r4516450352`, which is now outdated and **unresolved**. | Accepted at `afe68b6` (history) | N/A | Not merged | not_run |
| PR503 at `4cb4bbe` (current published head) | INC00-DOC-002-r2-SOURCE-PRE-PUSH-001 accepted (review record SHA256 `a29731e8…`). That result is history, and it is superseded for eligibility by the final review below. | `4cb4bbe` (r2; r1 `e468bed` was never published) | Code review completed on `4cb4bbe` with **P1 `discussion_r4517641847`** and **P2 `discussion_r4517641852`**, both on this ledger and both unresolved. Security review completed with **one advisory, Medium, P2 `discussion_r4517682095`**. It is on the frozen pack prompt `03_CODEX_INDEPENDENT_REVIEW_AND_APP_TEST.md` and says to isolate deployment from untrusted review context. `mergeGateEnabled: false`. Unresolved (observed). The independent assessment found it valid as a future concern, with no exposure established. r3 answers it with the restrictive release-trust amendment. | INC00-DOC-002-r2-SOURCE-FINAL-001: **needs_revision** (review record SHA256 `9677f096…`) | N/A | Not merged. PR synthetic merge commit `cbb8a619…` is not a main merge. | not_run |
| PR503 r4 (local, unpushed) | Pending: same reviewer, full 46-path base-to-head. Earlier unpublished candidates: two-file r3 `ff5e884`, then four-path r3-security `4b555b1`, which got **needs_revision** for one P2: the assignment digest was mislabelled as the backend Git base (review record SHA256 `27bfc9f7…`). | Child of `4cb4bbe`. Changes exactly the four INC00-DOC-002 paths. | Pending after publication | Pending | N/A | Not merged | not_run |
| INC01-CC-002 backend r1 | **needs_revision**: seven finding classes, five P1 and two P2 (review record SHA256 `48ce8457…`) | `091a3b69faa71d2a77a4a4f247f1bed440855a30`, tree `232c579c8bcb896c8c897098ba11469769f9fcd9` (unpushed) | — | — | N/A | — | not_run |
| INC01-CC-002 backend r2 | Not received | No immutable r2 head yet. The author reports 43 focused DB tests passing, and pure and two-process tests passing. Mutation tests, full normal checks and the export are pending. | — | — | N/A | — | not_run |
| INC03-CC-001 observer r2 | **needs_revision**: two residual P2s, on quote provenance and fake synthetic admission scoring (review record SHA256 `1d568e04…`), despite passing tests | `9ff4ab880a53459091aec5081a12ebfd0a461452`, tree `46faf1af894676ef079415ecd37d8f7916de66c6` (unpushed) | — | — | N/A | — | not_run |
| INC03-CC-001 observer r3 | Not yet reviewed | `d009d1ede2ca9e13ee24bcaeaff0d7a7e17be6fb`, tree `805b1c305a50dfabcea7784c4db0a22425fe11c0`. Exported and received; the coordinator verified its SHA, bundle and patch. Not published. | — | — | N/A | — | not_run |
| INC01-DES-001 designer | Source accepted (review record SHA256 `d80f3c2f…`) | `00d8193` (unpushed) | — | — | `awaiting_design_approval` | Held | not_run |

CI on PR503 `4cb4bbe`:

- **Operative pull_request run.** [42693446183](https://github.com/davidelaverga/Sophia/actions/runs/42693446183) was `in_progress` when observed at about 20:43Z. Four jobs had succeeded: runtime-unit, PDF renderer, Supabase and LiveKit. Four were still running: the three room shards and SQL. The room aggregate job had not been created yet. No pass or failure is inferred.
- **Superseded push run.** [42693435530](https://github.com/davidelaverga/Sophia/actions/runs/42693435530) had 8 jobs cancelled, and its aggregate failed with `PARTS:cancelled`, exit 1. It was never green (supplied).
- **Coverage.** Earlier check results cover earlier heads only. r3 needs its own CI after publication.

## Founder release coverage

All of these are mandatory and none has passed.

| Required fact | Status | Actual evidence |
|---|---|---|
| Davide Codex native connection | not_run | none |
| Davide Claude Code native connection | not_run | none. Web delivery sign-in is not a product-native route. |
| Luis Codex native connection | not_run | none |
| Luis Claude Code native connection | not_run | none |
| Davide own-binding repository output | not_run | none |
| Luis own-binding repository output | not_run | none |
| Shared API contribution used by the other member | not_run | none |
| Natural input + actual new-work allocation | not_run | none. INC03 is offline only. |
| Voice inquiry + authorized manager follow-up | not_run | none |
| Current merged/deployed/in-app-verified release | not_run | none |

## Acceptance register

There are two different records. Do not confuse them.

**1. Issued baseline (immutable history).** The issued baseline is [`docs/execution/2026-11-08-incremental/acceptance/cases.csv`](../execution/2026-11-08-incremental/acceptance/cases.csv). It holds 134 cases, all `not_run`, as issued. It is part of the frozen pack. **Never edit it.** It is not the current status.

**2. Current working register (canonical, owner-local, outside Git).** The current register is `/Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/acceptance.csv`.

- **Latest bound snapshot.** SHA256 `c5d3c09fdecb4e48f29e23994813eb97cd588bd3c8eb26b180d87f4734684e8f`. The coordinator supplied it with the 2026-11-09T20:38:52Z facts, as the read-only attachment `INC00-DOC-002-r3-ACCEPTANCE-SNAPSHOT.csv`. The independent reviewer read the same hash at 2026-11-09T20:16:59Z.
- **What the snapshot holds (observed by the documentation author, who parsed the attachment).** It has 134 rows and 134 unique `case_id`s, with CRLF line endings. Three are `passed`: AC-00-01, AC-00-03 and AC-GOV-03. The other 131 are `not_run`. It differs from the issued CSV only in the status, evidence, verification, observer and notes columns of those three rows.
- **What the three passes bind to.** Each has `verified_source` `afe68b679722e28471dcdf6222d519759cd78c49` and `verified_release` `not_applicable_documentation_source_stage`. The observer is `/root/independent_review_app` with coordinator reconciliation. The evidence references are review/INC00-DOC-001-SOURCE-PRE-PUSH-001.json, INC00-DOC-001-candidate.json and INC00-DOC-001-push-intent.json.
- **What the passes are not.** They are historical source, preparation and process passes only. None is product, native, provider, API, voice, deployed-app or full-mission acceptance. AC-00-02 is `not_run` until the actual reviewed integration.

### Locate and verify the current register

On the owner's host, the coordinator hashes the canonical file and counts its statuses:

```bash
shasum -a 256 /Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/acceptance.csv
```

```bash
python3 -I -c "import csv,collections,sys; r=list(csv.DictReader(open(sys.argv[1],newline=''))); print(len(r), collections.Counter(x['status'] for x in r))" /Users/davidelaverga/.codex/operator-journal/SOPHIA-INC-2026-11/acceptance.csv
```

If the hash differs from the snapshot above, the register has changed since this ledger. Record the new hash, time and counts here at the next reconciliation.

An environment that cannot read the owner-local path, such as a cloud session, must get a **fresh SHA-bound read-only snapshot** from the coordinator through the established automated attachment handoff, and check the hash before using it. It must not:

- create a new or parallel register;
- infer or invent a status;
- edit the issued pack CSV;
- ask a founder to relay credentials.

A read-only attachment is never an additional mutable source.

### Updating the register

- **Who writes.** Only the coordinator reconciles evidence-backed changes into the canonical register.
- **What a new pass needs.** A fresh binding of the exact verified source, release (or an explicit not-applicable stage), observer and evidence references. Evidence from an earlier head, a stale review or a simulated preview cannot pass a case for a new candidate.
- **What is never dropped.** Skips, failures and unknowns are kept. A pass is never written over them.

## Next bounded actions

Each action has one owner. Before acting, reconcile with the current source and sessions.

1. **INC00-DOC-002 r4** (documentation author, then the independent reviewer). Full 46-path base-to-head pre-push review of the exact r4 commit. If accepted, the coordinator publishes it to PR503. Then come CI and automatic code and security review on the new head, and Luis's integration decision.
2. **Release-trust hold** (coordinator). PR503 itself needs no release. When a release is next needed, prepare its envelope under §4 of the [amendment](../coordination/SOPHIA-INC-2026-11/RELEASE_TRUST_AMENDMENT.md), then name the existing authorized owner or operator operation, or a fixed-scope executor and its qualification plan. The independent reviewer checks the RTA-R05 rejection and isolation evidence before the hold lifts, and later carries out the app stage. Security thread `discussion_r4517682095` stays unresolved until the owner and the automatic review of the current head decide it.
3. **INC01-CC-002 backend r2** (same backend author). Finish verification, then hand back an immutable export for independent review. Keep real dispatch OFF.
4. **INC03-CC-001 observer r3** (independent reviewer). Review `d009d1e`. Fixes go back to the same observer author, who keeps its exclusive scope. Offline only, and no routing, admission or app acceptance.
5. **INC01-DES-001** (Davide). Decide on the exact candidate `00d8193`. Until then the designer stays stopped and affected UI work stays held.
6. **INC-02 start** (coordinator). Starts when one owner's Codex and Claude native pair, with recovery and control, is qualified. Do not wait for the other owner or the API slice.
7. **Ledger and register** (coordinator). Re-timestamp this ledger after each gate changes. Reconcile the canonical register only from new bound evidence.

## History (2026-11-08 installation; not current constraints)

Startup observations recorded at 2026-11-08T22:33:39Z. Each note in brackets gives the current status:

- The starting Sophia-Agent directory was a non-git historical Python snapshot; the actual project is TypeScript. [The common Git dir is now recorded above.]
- Remote main was refreshed via gh, then git fetch. Open PR499 was at `b799e46…` (Davide, draft) and PR501 at `502b9d5…` (EdX2C/Luis). Existing source and effect owners were preserved. [Same heads at the 2026-11-09 ~20:35Z conflict check.]
- The first Claude assignment, INC00-CC-001, was prepared but never dispatched and never acknowledged. [Still never dispatched. It owns no writes. Superseded by the assignments above.]
- An existing native Claude prototype was inspected read-only; its permission display said bypass, and no work was dispatched there. [Preserved; not used.]
- A Chrome sign-in handoff from an earlier coordinator checkpoint was unresolved, and there was no Chrome interaction, release or paid test. [Not re-observed since; treat as unknown.]
- All 134 issued acceptance cases were `not_run`. There was no deployment, native qualification, merge or programme completion. [The issued CSV is unchanged. For the current register, see "Acceptance register".]
- INC00-DOC-001: the coordinator wrote the documentation installation and the initial source map, with no product implementation. Claude product work waited for owner sign-in, and the CLI reported `loggedIn: false`. No desktop token was read or copied. [Web delivery sign-in now works; product-native routes are still unqualified.]
- The designer was unassigned and no design candidate existed. [Superseded: see INC01-DES-001.]
