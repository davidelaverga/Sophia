# INC04-R07-COHERENT-010-001: attempt 1

Goal and attempt: INC04-R07-COHERENT-010-001, attempt 1 (Root123, StageA). A LOCAL integration of current main, the
accepted coherent-009 source and the Host bound-output donor. It repairs the donor's two findings and wires the
maintained application with bound output default OFF. It is not INC-04 product acceptance, activation or a live
qualification.

Human owner / executor resource: Davide (repository owner); a Claude Code cloud session (Routing17,
`https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`) as the one writer of this composition.\
Native session: not applicable to this session.\
Starting worktree/commit: new `/home/user/sophia-r123-coherent-010` on new `refs/heads/inc04-r07-coherent-010-001` at
`90a0af7eb3d4d376e9a0d63c0e05def18ee79b36`. Then `git merge --no-ff --no-commit 9495c87f… 9dfeba7f…`: rc 0, no conflict,
prospective ordered parents `[90a0af7e, 9495c87f, 9dfeba7f]`.

Ending commit/tree and changed files: an UNCOMMITTED StageA tree. See Evidence.

## States, before the code changes

### Composition (done before this file)

- **Merge:** 60 staged paths: main's 43 with their exact `9495` blobs and Native's 17 with their exact `9dfe` blobs.
  0 unmerged. The octopus merge wrote 20 loose objects (its own trees).
- **dee7 delta:** 16 of its 23 paths already equal after the merge. The other 7 were copied from their exact blobs:
  - the W1 HTTP test;
  - the pure module and its test;
  - their plan and handoff;
  - the Map;
  - the coherent-009 handoff.
- **Host 24:** each `90a0` base blob checked as still current; each donor body checked by sha256 and blob. 24 of 24.

### Repairs and wiring (to do)

See `docs/plans/coherent-010-bound-output-integration.md`. In short:

- **F01:** the hook requires `profile.endpoint === model.api` before apply, and hashes `model.api`.
- **F02:** the new fixtures own each acquisition at once, attempt every cleanup, keep every error, and retain a scratch
  whose runtime stop failed.
- **App:** `AppDeps.boundOutput` (default false) is forwarded to all three factories; `/ready` requires the nine wrappers
  when it is on; `server.ts` gets `SOPHIA_BOUND_OUTPUT` (unset means OFF); the persistence index exports
  `BOUND_OUTPUT_V1`.
- **Crossings:** real research, design and source_review runs through the maintained app ON, with goal Hold, goal Stop
  and profile revocation between reserve and claim.
- **Map:** rows for the donor and integration paths.

### Expected outcomes (derived, not yet run)

| Case | Expected |
| --- | --- |
| research, design, source_review positive (app ON) | HTTP body `max_output_tokens` = P (777) < the route ceiling; one claim answered before arrival; outcome `sent`; settle on the same reservation; exact claim replay `sendPermitted:false, replay:true`, no resend |
| Hold, Stop or revoke after the reserve, before the claim | no claim row; zero HTTP |
| endpoint mismatch (real, and unit) | refused `endpoint` before apply; zero HTTP or zero client calls |
| F01 control: comparison removed | the mismatch assertions FAIL (an apply and a claim are made, and the unit hook returns a copy) |
| F02 injected failures | every acquired resource closed; primary and cleanup errors visible; a failed runtime stop keeps its scratch |
| app OFF | opted reserve 422 with no row; none of the nine paths registered |
| `/ready` | OFF ready without 0115; ON not ready without any one of the nine wrappers; both ready with 0115 |

### Limits that stay

- **Inherited:**
  - Host:
    - the archived C1 conditional mutant admission and its restoration mismatch;
    - the failed controls;
    - the absent per-phase status evidence and PG status 3.
  - dee7: its bounded lexical coverage, fixture limits and monitor limits.
  - Native: its fixture, foreign-key and role limits.
  - Provenance: C007-PROV-F01 and R112-E01.
  - Root110: the global listener state is UNKNOWN.
  - Root122: the census write-tree incident.
- **This crossing's own:**
  - the design and review attempts are LABELLED SYNTHETIC; a real admission is not exercised;
  - controlled software identities only, with no provider, account, owner or native qualification;
  - `model_requests` unsupported;
  - one HTTP request is not one model request.

## Evidence

Completed after the checks. Every physical run bound the states-first version of this file (blob `7b3cd9a5`).

### Composition and record

- **Merge and copies:** as in "Composition" above. The 60 staged paths are main's 43 and Native's 17; the 7 dee7 copies
  and the 24 Host copies all matched their pins.
- **Install:** one frozen install, lock `8c1ed766` unchanged.
- **GEN:** reproduces the donor's four generated files byte for byte; `contracts:check` passes.
- **Artifacts:**
  - With the donor's exact `control-bridge.ts` bytes, all 8 identities reproduce on this composition. So the only
    identity change comes from F01.
  - One `pnpm artifacts:record` changed exactly the three `sophia_bundle` fields of `config/runtime-unit.json` and the
    profile lock's integrity line (bundle `e656d445` → `2ee4c789`). `pnpm artifacts` then shows 8 of 8.
  - The runtime tree is unchanged, so the C1P/C2B runtime pins are untouched. This is software identity, not provider
    qualification.

### Statics

All 0:

- toolchain, format, the repository's type-aware lint (after splitting `buildApp` and `schemaReady` for its length and
  complexity limits), build, typecheck and contracts;
- `pnpm artifacts` 8 of 8, none recorded;
- **`pnpm test`: 5648 tests, 5581 pass, 0 fail, 67 counted skips.**

### Controls and the new tests

- **F01 control:** the comparison statement was removed from the built `dist` module only.
  - The first attempt deleted only the `if` line, which made every call refuse. It is invalid and kept on record.
  - The corrected attempt fails only the F01 unit test ("Missing expected rejection: endpoint mismatch"). Exact bytes
    were restored, then 10 of 10 pass.
- **F02:** three proofs on real servers:
  - a failure after the provider and proxy were acquired;
  - a cleanup failing after its real close;
  - a runtime stop that rejects or is unconfirmed, whose scratch is retained.

### Owned PG16 on 55647

- **Setup:**
  - Two clean censuses (IPv6 tables absent).
  - The postmaster is pid 6600, start ticks 150646.
  - 8 of 8 auth and census expectations hold.
  - The positive identity check ran first; four wrong-identity probes each returned 70.
  - The exit-7 canary gave 7/7/7.
- **Runs:**

| Phase (internal / caller / tool) | Result |
| --- | --- |
| int1 (1/1/1) | 25 of 30. Five design/source-review failures came from my synthetic fixture's binding copy (no native session, then a copied delivered state); fixed, then a direct debug run passed 6 of 6 |
| Full SQL (0/0/0) | **114 migrations in order (…0113, 0114, 0115); 27 of 27 SQL test files** |
| Full DB (1/1/1) | **2199 tests, 2198 pass, 1 FAIL**: `selection-exposure.db.test.ts:1022` expects the upgrade to apply only 0114; it applied 0114 and 0115. The test assumes 0114 is the newest migration; its last lines did not run here. OPEN; repair proposed, not applied |
| intfinal (0/0/0) | **30 of 30**: research, design and source_review positives; Hold, Stop and revoke between reserve and claim; F01 real mismatch; F02; app OFF/ON |
| Readiness (0/0/0) | 8 of 8, including the new 0115 switch block |
| Regressions (0/0/0) | 84 of 84: request-shape, call-evidence, route-ceiling, usage-provenance |

- **Stop:**
  - Readers absent and 0 clients; the probes returned 70.
  - ONE guarded stop: inner 0, caller 0, status 3, reaped on poll 3.
  - No listener, socket or pidfile remains. Data, logs and secrets are retained.
- **Resources:** 2882 samples with 0 unknown and 0 low-space, Git-lock or STOP events. Minimum free space 22.39 GB.
- **0110:** the runner executed `db/tests/0110`; its body was never displayed.

### Studio

- **Full suite:** INCOMPLETE and FAILED.
  - The harness stopped the run's handle at its 30-minute background cap at 21:42:34Z.
  - Result: 889 passed, 1 failed, 1834 not run; no exit files.
  - The failure is `[desktop] app-auth.spec.ts:729` at line 750: `signedInAs` returned `""` after the "another subject at
    the same address" change, with each 1000 ms Account click timing out.
- **Quiet diagnostics (Root126):** ONE run each on r123 and on clean `9495` (one worker, zero retries, timeouts
  unchanged). Both **passed**.
  - This supports, but does not prove, a load-sensitive test timing.
  - The finding stays OPEN.
- **Plan:** a six-shard plan covers all 2724 cases (exact union). It has not been executed.

### Coverage of T-C2-41/42/44

These identifiers are not in the repository. Mapped by the Host review's description to the real maintained research,
design and source_review crossings, all three pass through `buildApp` with the switch on. No live qualification.

## Remaining obligations

- The full-DB failure (selection-exposure 0114 upgrade assertion) needs a separate repair lease, then the owning file and
  full DB again.
- The complete Studio set needs the sharded run; the `app-auth.spec.ts:729` finding stays open.
- SAME whole-source review of this StageA.
- Then, under separate dispatch, a normal signed local commit and ONE fresh cold ordinary check.
- All holds remain: Luis, GOV, current CI, RTA, Personal 9e, the 8c default-off catalog and its erratum, 9ed, native,
  deployed authorization, application acceptance and the full mission.
- D1 is disabled and VoiceLab is USER-SUSPENDED.

## Next bounded action

HOLD for SAME whole-source review of the StageA tree.
