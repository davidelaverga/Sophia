# CON-01 source takeover 3 — Q13 local qualification

Owner Davide; sole source author/operator Codex desktop session `01a1224a-32b4-7222-a017-50a277572d95`. Existing owned worktree `sophia-con01-source-harness-review`, branch `codex/con01-takeover-source-20261013`. Same bounded source-only approval and GO as [takeover 2](CON-01-codex-source-takeover-2.md), ending 2026-10-13T08:00Z. No hosted or provider authority added.

## Exact source and review

Draft [#273](https://github.com/davidelaverga/Sophia/pull/273) first published `d06f98a136173827bba1243ac8b4f3278eb6ddc1`, tree `35c0533caa29e0e8c928e31ddf01a6a521e922e1`, against main `32854caf01e7d5e493e096baead019506b1d1de3`. Independent whole-diff pre-push review cleared it. Required automatic Codex review completed at 2026-10-12T23:02:58Z: [bot receipt](https://github.com/davidelaverga/Sophia/pull/273#issuecomment-6134283460), no major issues, exact reviewed commit `d06f98a136`. Final pinned executable-source check `922773b2` passed: 2,353 unit passes/70 explicit skips, 86 integration passes/two explicit skips. The final documentation delta changed no executable source.

Q13 source changes atop that draft:

| Candidate | Tree | Meaning |
|---|---|---|
| `8bd9d7c26c782292232236d8ac81c852724e1bd0` | `211e1a1fe3d851a791330a164c170fa73086fe6e` | Bare assembler and claim-bound reads; activation semantic guard |
| `0c6bfbc58e6dc3cb7110f949f5d67d7ae95b2538` | `1ad57c2c4e450227b00646565ecd411e1986dd33` | Trigger registration checks; owned SQL run failed syntax 42601, not qualified |
| `0d1d3a2af77967e8f4cde562d30bc0a91664d9ef` | `6a854f5d69402e7800d23a2ea7997309f3c9937e` | Corrected one statement terminator; exact independently reviewed executable source |

No applied migration, existing shared predicate/body, runtime bundle, execution host, runtime configuration, lock, model route or credential changed. S3 remains a dormant candidate outside the migration runner. The assembler has no parent role; it cannot inherit or assume API/worker authority. The shared read grants use unchanged predicates plus restrictive claim/actor/project/transaction/lease policies. A found role with any cluster-wide dependency or member refuses installation rather than adopting or normalizing authority.

The read-only activation query requires zero holds, `search_path=pg_catalog`, PostgreSQL 16/17 and the reviewed `postgres` installation owner. It checks effective PUBLIC/default authority, other database admission, pre-existing sessions, all 38 read policies, row security and owners, view settings, 27 assembly/context/shared-helper function definitions and owners, and ten required scrub/kept trigger registrations/enabled states. The S3/S4 kept-trigger definitions are explicit reviewed alternatives. A check is a point-in-time qualification, not a defense against subsequent privileged changes. [States and exact limitations](../coordination/CON-01/Q13_SOURCE_STATES.md).

## Findings, commands and actual results

Independent pre-push review identified and withheld clearance for:
- P1: name/ACL allowlists missed disabled RLS or replaced policy/function/view semantics. Real owned-PG fail-before returned no hold after disabling project row security. Corrected semantic and owner checks pass the adverse cases.
- P2: function hashes missed disabled/dropped/rebound trigger registrations. Real owned-PG fail-before returned no hold after disabling both scrub triggers. Corrected required-trigger checks pass.
- The trigger patch accidentally terminated the SQL statement before its final UNION. Owned SQL execution failed 42601 and independent review caught it; the final source fixes the terminator.

At exact clean `0d1d3a2a`, fresh owned loopback PostgreSQL 17.6:

```text
node --test --test-concurrency=1 --test-timeout=120000
  packages/persistence/src/conversation-assembler-admission.db.test.ts
  packages/persistence/src/conversations.db.test.ts
  apps/api/src/conversations.db.test.ts
  packages/persistence/src/conversation-reply-states.db.test.ts
  packages/persistence/src/conversation-ledger.db.test.ts
  packages/persistence/src/conversation-assembly.db.test.ts
  packages/persistence/src/conversation-fences.db.test.ts
  packages/persistence/src/runtime.db.test.ts
node scripts/db-test.ts
```

179/179 tests passed, zero failure/cancellation/skip. All 47 migrations and five SQL test files passed. The opt-in admission suite first verifies the explicit exclusive-cluster marker, loopback server, owner-controlled 0700 directory and zero other clients. It proves actual fresh admission/denial, local-only PUBLIC remedy, a pre-existing connection still alive after revocation, voluntary settlement and a zero-hold control. Its privilege and semantic drift cases run in rolled-back transactions; the S4 composition control also returns zero holds. Normal ordinary-check runs skip this cluster-wide suite; they do not qualify admission.

Five new isolation/authority regressions fail against the original `d06f98a1` S3 in a private source copy; no live source was reverted under review. Existing lifecycle/compiler/privacy checks remain. Concurrent real logins cannot assume each other; a revoked login creates no new claim. Operational calls/direct writes/sequences are denied and synthetic table-content digests stay unchanged. These are local L1 evidence, not hosted activation.

The final ordinary `pnpm check` on executable source `0d1d3a2a` is running at document preparation; the terminal result is recorded in the publication receipt before push. Earlier `8bd9d7c2` ordinary run exited zero but preceded the trigger correction and is retained as diagnostic evidence. Static independent whole-diff review cleared exact `0d1d3a2a`; the final documentation delta also requires review. No push occurs before required checks/review, and every push requires its own exact-head automatic review.

All owned diagnostic and final clusters were fast-stopped, with PID absent, ports closed and directories removed. Logs, source manifests, failures and receipts remain private under the operator journal. No unrelated process or connection was terminated.

## Acceptance, operations and recovery

G0 decisions unchanged. G1/G3 evidence remains the prior 172 PostgreSQL/API cases and 73 affected plus 119 preservation browser fixtures; Q13 adds the named local crossings above. G2 native runtime/host-copy/provider qualification remains incomplete. G4 source is locally reviewed subject to final checks and exact pushed-head automatic review. G5 serving app/API/runtime tuple remains unverified; G4 integration/merge and Davide acceptance remain separate. The broader 36-case ledger remains 18 partial_L1 / three passed_L1 / 15 not_run, not promoted by these local tests.

`source_ready`, `locally_verified` and `reviewed` apply only to named source and evidence. `authorized` covers this source window only. `deployed`, `app_verified`, `owner_accepted` remain unestablished. Ask stays disabled.

No new operation request/approval exists. OP-0002r6 setup/human-chat and OP-0001r4 Ask qualification remain draft_not_authorized. They need separately exact candidates/artifacts/target identities, immutable two-account roles, credential references, finite payer/allowances/expiry, ordered effects, concurrent-live-work handling and recovery before approval. This source approval permits no hosted migration, account, membership, grant, deployment, credential transfer or provider execution. No PAYG/credits/switching/rotation/hidden reset. Provider/native resource use this slice: zero; earlier stopped workflow subscription deduction remains unknown.

The real target's template1 admission constraint is still held; local permission denial does not settle it. No native answer, host-copy cleanup or subscription route is newly qualified. Rollback of this unpublished source is by a reviewed revert; governed hosted data was untouched. Future live rollback must disable Ask, retain compatible readers and preserve all governed conversation/accounting/cleanup records.

Next bounded action: implement Phase B step 1 under the same approved writer scope and fresh migration/overlap census, preserving the seven shared function bodies outside named reply insertions and testing mixed research/goal behavior. Exact integration/hosted approvals remain separate. Stop writes at window expiry or an affected ownership/number collision.
