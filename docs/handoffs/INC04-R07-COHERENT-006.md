# INC04-R07-COHERENT-006

Local coherent composition of two separately reviewed sources. This is a source-integration record only. It is not a canonical check, LOCAL_PRE, CI, publication, native or deployed acceptance, and it does not complete the mission.

- Task: INC04-R07-COHERENT-006-STAGE-A
- Session: https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2

## Inputs

| Role | Commit | Tree | Parent |
| --- | --- | --- | --- |
| First parent: fixture resource repair | `9965816d7c707970bccc4af57947ffaa9a3c65d7` | `dc4a58e268c16a13d1e0b1338b72c36b32c89197` (4291 files) | `6f449ee94595cc3e8102fd90b6a41e7be6dc1d76` |
| Second parent: pure capacity reflection and exposure (R1) | `61f4c0c0e1956f1b8c54ef564eccfa5a7418b18b` | `4786da2692bb535a15a67908319b8838e5096b98` (4278 files) | `e9ec44753f1a1c0e5e4040cc250287aa775ce610` |

Both commits are signed. Normal `git verify-commit` reports that no allowed-signers file is configured, so signer trust is not established here.

## Integration steps

1. The second parent was taken from its verified local bundle into a private ref. Its raw commit, tree, 4278-row inventory, 4-path diff and 4 file bodies matched the accepted identities.
2. A new branch `inc04-r07-coherent-006` was created at the first parent.
3. `git merge --no-ff --no-commit` of the second parent ran from merge base `e9ec4475`. It merged without conflict.
   - Union tree: `e070aa89f68968519dec1f1bf32341a87806622b`, 4295 files. That is the 4291 fixture rows unchanged plus the 4 added paths:
     - `docs/handoffs/INC04-R07-C4-C5-PURE-001.md`
     - `packages/domain/src/capacity-exposure.fixtures.json`
     - `packages/domain/src/capacity-exposure.test.ts`
     - `packages/domain/src/capacity-exposure.ts`
4. This handoff is the only new file. Nothing in the sources was edited, resolved or regenerated. No runtime artifact, lock, configuration, API or product code changed.

The final merge commit and tree identifiers are recorded outside the repository, because this file is part of that tree.

## Evidence carried forward (not re-executed here)

- Pure capacity component: 117 targeted tests passed, with 15 detected-and-restored causal controls, at its source stage. The component is not imported anywhere and adds no package export.
- Fixture repair:
  - A focused run of `tests/integration/call-evidence.test.mjs` passed 43 enabled tests.
  - The file's four PostgreSQL cases sit in one suite guarded by `SOPHIA_DISPOSABLE_DATABASE_URL`. They were omitted in that run and are unverified, not counted as skipped tests.
- SQL and database qualification: the existing 111 migrations, 24 SQL tests and full DB run (2120 passing) are historical results for the earlier source. This composition changes no migration or SQL test, and no new SQL claim is made.

## Open items

- The canonical ordinary run (`pnpm check`) has not been executed on this composition.
- The last canonical ordinary run on `6f449ee9` remains failed: the integration stage hit ENOSPC and the run's handle reported 1, with inner and caller exits unknown. That run's PostgreSQL normal stop and its fixture-folder cleanup are unproven.
- All approval, publication, native-owner, deployed, application and mission holds remain.
- Next: an independent source-integration review of this commit, then one canonical ordinary run with its own PostgreSQL lifecycle and resource check.
