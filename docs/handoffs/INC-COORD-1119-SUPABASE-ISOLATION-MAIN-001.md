# INC-COORD-1119-SUPABASE-ISOLATION-MAIN-001

Goal: reuse the existing CI attempt isolation on main so the auth job can reach its tests after a runner port collision. This is a local source candidate, not live qualification.

Human owner: Davide. Author: existing Integration author, chat `01a1ebd7-0270-7d63-89c0-ab2865038629`. Native executor/session: not involved. Base: `c9c226c9463f0acc44727e0cc4e31096023f7a9e`. Ending identity: uncommitted staged tree, recorded in the source handback. No commit or publication is performed here.

## Existing repair and current boundary

The source is the existing [8e323 repair](https://github.com/davidelaverga/Sophia/commit/8e323389b9b0781ec39dbb951bc52c92e65f6313), sole parent `3a1e3538639cf3f9afc705d572cda0b0c5746e24`. Its [original handoff](https://github.com/davidelaverga/Sophia/blob/8e323389b9b0781ec39dbb951bc52c92e65f6313/docs/handoffs/CI-3A1E-SUPABASE-ISOLATION-REPAIR-001.md) and original authorship remain unchanged. Its old unit, mutation and CI results remain historical evidence.

PR525's natural auth job `135253228880` failed during setup with the selected address-conflict category at port 54322; auth assertions were not reached. This does not identify the port holder. PR519 has the maintained isolation and both auth jobs passed at `8f7770bf`, which is evidence for that source and those attempts, not for this candidate. The separate PR519 UML failure is unaffected.

## Five-path change

- `scripts/supabase-local.ts`: exact original blob `87b5f412234b89d22d669450f149e54f6f69d892`.
- `tests/unit/supabase-local.test.mjs`: exact original blob `187dea6ea44b88f38fdd769e6e480324296ffbd3`.
- `.github/workflows/ci.yml`: only the original auth-job hunk. It adds the run/attempt identity, names the start step, and appends the guarded final cleanup. Every unrelated workflow byte is preserved. Existing action pins, triggers, concurrency, other jobs and timeouts remain exact; the auth job retains its 20-minute bound and original cleanup its 3-minute bound.
- `tests/unit/ci-workflow.test.mjs`: reuses the original isolation lifecycle assertions, scoped to main's exact auth baseline and all unrelated main workflow bytes. It imports no PR519 integration runner. Adverse cases reject duplicate/moved/missing cleanup, bypassed auth, changed environment, action pins, timeouts and extra runtime preparation.
- This attributed handoff.

There is one maintained Supabase helper. Main's package, lock, runtime preparation, integration runner choice, fixtures and migrations are unchanged. Main's script and auth block matched the original repair's parent; the imported helper dependencies and committed Supabase config match by Git blob identity.

## Local verification on 19 November 2026

Node 24.21.0 and pnpm 11.7.0. Dependency installation used the existing frozen lock with lifecycle scripts disabled; all 698 packages were reused locally, none downloaded. No dependency or lock change.

| Check | Current result |
|---|---|
| Direct maintained helper suite | 28 passed |
| Main-scoped workflow contract and adverse cases | 22 passed |
| Combined final direct run | 50 passed, 9 suites, zero failed/cancelled/skipped/todo |
| Toolchain check | Passed |
| Scoped workflow/helper Prettier | Passed |
| New contract Prettier with explicit ignore override | Passed; the repository normally excludes tests from formatting |
| Helper type-aware oxlint | Passed |
| Scoped strict TypeScript helper/import check | Passed |

The first TypeScript command stopped with TS5112 because TypeScript 6 requires `--ignoreConfig` for an explicit file list beside a tsconfig. The final command used an explicit scoped NodeNext/ES2023 configuration, no emit, and succeeded. It is not the full project typecheck. The initial unit run also passed; the final run followed formatting of the new contract file. Both observations are retained separately.

The direct suite uses injected Docker/Supabase answers, fresh owned temporary files, and a local loopback listener. Its three real script-process cases take only the refusing/no-workdir `--stop` paths. Import gates and the script main guard were checked. No Docker, Supabase, PG or external service was started, no key was generated, and no development environment file was written. The closed 0110 fixture and aliases were absent from exact main metadata and excluded before checkout and test import.

## Remaining evidence and limits

The port probe remains non-atomic. Unknown or pre-existing Docker resources refuse startup and cleanup; unique-name and port checks have their original TOCTOU limits. This change does not promise that every later CI run succeeds or identify the original port holder.

Independent review, the full ordinary checks, actual natural isolated auth CI on the candidate and actual PR merge checkout, guarded cleanup evidence and Luis integration remain due. Historical results are not substituted. No manual run, CI trigger, commit, publication, merge, deployment, native/account/provider operation or activation is authorized by this handoff.

All programme approval and release holds remain, including current/historical GOV and formal finding dispositions, tenant admission, owner/native/App acceptance, catalog default-off and erratum, D1 off and Voice Lab suspension. No outcome O1–O7 is closed by local fixture checks.
