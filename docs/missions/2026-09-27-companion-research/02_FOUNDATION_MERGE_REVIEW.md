# R00 — Land the working foundation, without conflating merge and release

**Assessment date:** 27 September 2026. **Recommendation:** proceed toward integration; the temporary brief interaction is not a product reason to hold this foundation open. **Not an unconditional merge certification:** this pass did not review every changed line or independently verify hosted services and blocking review resolution.

## 1. Current evidence

| Fact | Observed value | Source/status |
|---|---|---|
| PR #13 | Open, draft, mergeable into its current base | Fresh GitHub metadata, SRC-01 |
| Head | `2911b037c9703703f2ae33955123d434797e3155` | Fresh source metadata |
| Base | `studio/qol@d18e171df15d53d4c1ff6044e90bd29bdcf60ece` | Not `main` |
| PR #12 | Open, draft; head `studio/qol`, base `studio/precise` | Fresh metadata, SRC-02 |
| `main` | `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3` | Earlier S1-03 merge, SRC-03 |
| Exact-head CI | Run `36281456865`, run number 187, completed/success | Fresh GitHub Actions read, SRC-04 |
| Hosted processes | PR reports `2d59884`, migrations 0001–0016 | Report only; Codex must refresh |
| OP-0009 | Apply 0017 and release Studio/media bridge at `00a16c2c26634695527d59ff19eb6ef9a2e7f1ce` | Existing request has no approval; SRC-05 |

The `mergeable` field is not approval, and it only describes the current PR base. Merging #13 as currently targeted does not alone put the whole stack on `main`. Sources: [register](SOURCE_REGISTER.md).

## 2. Two gates, not one long redesign

**Source integration gate:** reviewed dependency history, no blocking unresolved review findings, required exact-candidate checks, no known critical control/privacy defect, and a safe plan for any deployment triggered by branch updates. Brief UI replacement, mission memory and research belong to later PRs.

**Exposure/release gate:** actual target tuple, matching schema, safe old/new writer handling, current rollback compatibility, and tests covering the functions exposed to real users. An untested guest privacy path is not silently certified by a successful single-member voice test. Keep the affected path disabled/unexposed or finish its bounded test before exposing it.

A source merge may precede full product acceptance when its limitations and disabled/unqualified surfaces are explicit. Do not waive a known blocking security defect, and do not mark the whole S1-05A acceptance suite passed merely to close the PR.

## 3. R00 goals

### R00-G1 — Reconcile stack and review

Claude reads current `AGENTS.md`, PR #13, its actual base, relevant earlier PRs and latest reviews/checks. Build the actual ancestry/PR graph, including any superseded PRs; do not assume every number from #3 to #12 needs a separate merge. Confirm that the cumulative source contains Luis's intended work and current main. Record exact candidate/base identities and all unresolved review findings.

Prefer bottom-up integration of reviewed dependent PRs, retargeting descendants deliberately as necessary, with checks on the intended combined main candidate. Coordinate any alternative cumulative integration with Luis/Davide so earlier work is not orphaned or duplicated. Preserve author history and avoid force/reset/reconstruction of the stack.

**Deliver:** `docs/progress/R00-foundation.md` with graph, candidate, review/check evidence and proposed merge order. No merge yet unless the launched session has matching explicit authority.

### R00-G2 — Operations preflight

Codex reads the real Render/Vercel source-branch and auto-deploy settings before any source merge can release intermediate older code. Read actual five-process deployment tuple, runtime binding/active work and schema checksums. Verify whether OP-0009 already ran; an older PR body is not the operations ledger. Do not repeat applied migrations or recreate services.

**Deliver:** compact baseline and safe integration/release procedure. If branch merges would auto-deploy intermediate revisions, first request an approved temporary deployment freeze or exact-source rebinding. Preflight is read-only; changing auto-deploy is an effect.

### R00-G3 — Integrate and settle the existing release

After owner approval, integrate the reviewed stack into main under the recorded plan. Record the actual integrated commit. Re-run affected checks after retargeting or conflict resolution. Do not confuse the original PR's synthetic merge SHA with an already merged commit.

Treat OP-0009 as a separate existing operation. If still needed and approved, use its exact source/hash/effect scope or issue a superseding reviewed request tied to the integrated candidate. Existing 0017 source hash recorded by CC-0033 is `0d0b929f8648ee26281799b9de3cf4f89a4b109e0733912bdeffd67d83ba2742`; verify actual file and hosted ledger before acting. Do not silently substitute a different commit under an old approval.

Record and execute the short affected smoke checks. Keep still-unverified Stop/Hold/Resume, two-member/guest, reconnect and longer-reply cases in a named acceptance table with an owner and next bounded test. The user's report that voice works is meaningful user evidence, not a fabricated instrumented test receipt.

### R00-G4 — Establish the new mission base

Publish the integrated source and actual hosted tuple; identify any intentional split deployment. M01 and M02 start from this integrated main, not the old authoring-time main. Existing brief tasks/results remain intact. End the closeout session when evidence and next actions are recorded; no idle soak or broad new feature work.

## 4. Completion criteria

R00 is complete when the intended foundation is integrated into the actual main lineage, checks and review disposition are recorded, merge-triggered deployment risks are settled, and the release/remaining test status is explicit. Source integration can be complete while narrower hosted acceptance remains pending; that distinction must be visible rather than hidden behind one green label.

No source merge or operation was performed by the author of this packet. Start with [Claude](launch/R00_CLAUDE.md) and [Codex](launch/R00_CODEX.md).
