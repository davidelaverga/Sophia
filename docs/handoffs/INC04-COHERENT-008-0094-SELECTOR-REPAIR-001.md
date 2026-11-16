# INC04-COHERENT-008-0094-SELECTOR-REPAIR-001: attempt 1

Goal and attempt: INC04-COHERENT-008-0094-SELECTOR-REPAIR-001, attempt 1 (Root112).

- **What it is:** a test-registry repair to the coherent 008 candidate, so that the full SQL corpus can pass.
- **What it is not:** a product slice of INC-04, or its acceptance.

Human owner / executor resource: Davide (repository owner); a Claude Code cloud session (Routing17,
`https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`) as integration worker.  
Native session: not applicable (no native account or session is involved).  
Starting worktree/commit: new `/home/user/sophia-r112-0094-selector-repair` on new
`refs/heads/inc04-r07-coherent-008-selector-repair-001` at the Root110 handoff commit
`9ef5a6d29335ec6c700c748a1e9fa74967be6b5a`.

- Its tree is `1d70eb49`, with 4308 leaves.
- Its sole parent is the merge `03d54587`: tree `0d0f5441`, parents `[b871a6ac…, bd5fbfbc…]`.

Ending tree and changed files: an UNCOMMITTED candidate tree (temporary index, no commit). It changes exactly
`M db/tests/0094_api_contributions.sql` and adds this file. See Evidence.

## States, before the test edit

### The failure being repaired (Root110, actual)

- **Full SQL corpus:** on the merge `03d54587`, it failed with inner, caller and tool all 1.
  - All 112 migrations applied, and 6 SQL tests passed.
  - Then `db/tests/0094_api_contributions.sql` raised: "Unclassified runtime selector
    research_bound_emitter_consistent: decide whether it must exclude contribution resources".
  - The other 18 SQL test files did not run.
- **Full DB corpus:** on the same input it passed. 2167/2167, including the 4 readiness and 46 C2 cases.
- Both results stay recorded as they are in the Root110 handoff and its FINAL-A.

### The predicate and the helper (read under the registered bounded grant)

- **The 0094 selector-classification block** (lines 34–111 of blob `7ada57ae`):
  - It walks every `sophia` function whose body matches `(from|join)\s+sophia\.runtime_instances`.
  - Each one must be a picker (which must exclude contribution resources), a role-pinned picker, or in `scoped`.
  - `scoped` is "Selectors scoped to a binding, a token, a known resource or a runtime already chosen: they choose no
    runtime for new work."
  - Anything else raises the error above.
- **The 0113 helper** `research_bound_emitter_consistent(p_runtime uuid, p_route text, p_emitter text) RETURNS boolean`
  (lines 778–782 of blob `03da910d`):
  - It is `LANGUAGE sql STABLE`.
  - It reads `sophia.runtime_instances` only where `rt.id=p_runtime`: ONE runtime row, named explicitly by the caller.
  - It returns whether that row's role for `p_route` has a service executor bound to the same route and to the emitter
    digest `p_emitter`.
  - It chooses no runtime for new work and returns none; it only checks an emitter identity on a runtime already chosen.
- **Conclusion:** that is the existing `scoped` category, like the 0104, 0111 and 0112 entries. The helper is not a
  picker, so the contribution-resource exclusion rule does not apply to it.

### The repair (the only source change)

- **Change:** add `'research_bound_emitter_consistent'` to the existing `scoped` array, with a 0113 comment in the
  file's style.
- **Kept as they are:**
  - the unknown-selector refusal and the regular expression;
  - the `pickers` and `role_pinned` categories;
  - every other entry, fixture and assertion.
- **Not added:** no new exclusion, no rename, and no change to migration 0113 or any product code.
- This entry classifies the helper's selector shape only. It claims no authority for the helper and asserts nothing
  about its callers or grants. The rest of 0113 was outside this read grant.

### Expected positives (each to be shown by actual output)

- **Full SQL corpus with the fix:** the unchanged runner on a new owned PostgreSQL 16 on 55635 applies all 112
  migrations, then passes all 25 SQL test files.
  - The `db/tests/0110` body is run by the runner and never displayed.
- **Causal control:** remove ONLY the added entry, restoring the original test bytes (blob `7ada57ae`). The full SQL
  corpus must then fail at 0094 with the same "Unclassified runtime selector research_bound_emitter_consistent" error.
- **Restored fix:** put back the exact fixed bytes. The final full SQL corpus must pass all 25 files.
- **Candidate:** 4309 leaves; all 4308 precursor rows except the 0094 row are retained; only 1 modified and 1 added
  path.

### What the DB result means here

- The Root110 full DB pass is carried over by exact input identity only.
- All 112 migration files, all 107 DB test files and all application, domain, persistence and SDK sources, along with
  the package, lock, toolchain, configuration and test drivers, must be byte-identical. The only differences may be
  0094 and this file.
- It is not a fresh full DB run on this candidate.

### Old negatives that stay negative

- The Root110 full SQL failure (`b8z9p4l6n`, 1/1/1) is retained as it is.
- An earlier Prettier call that included `.sql` files exited 2: there is no SQL parser.
- Signer trust UNKNOWN.
- Old cluster 55611's normal stop is UNPROVEN.
- **C007-PROV-F01:** `8e323389` and `b871a6ac` carry Native1's `Claude-Session` trailer
  (`session_01FGXfrJoUMojmJSW3H7XfoG`), although Routing17 (`session_01FGXfrGsUA6jNm3sxRoSro2`) created them.
  - They are immutable and not rewritten, and no descendant corrects them.
  - The exception is carried under erratum `57b92c96` and Root `36ad893a`.

### Open mission gates (not addressed here)

- Whole SOURCE_CORE of this candidate.
- An ordinary or canonical check.
- CI, publication and review coverage (GOV, exact head).
- Luis and human approval; RTA.
- Personal 9e; 8c default-off and its erratum; 9ed cancellation.
- Native, provider, route or profile qualification.
- Deployed owner and application acceptance; the full mission.
- Native Root87 (`0114`) is independent and is not integrated.

## Evidence (actual results)

**Overall: with the fix, the full SQL corpus passes (112 migrations, 25 of 25 SQL test files). The control without the
added entry fails at the intended 0094 assertion. The restored fix passes again.** The Root110 full DB pass carries over
by exact input identity only. The candidate is UNCOMMITTED.

- **Read register:** two entries, 7407 B in all, registered before the semantic read at 11:51:06Z.
  - The 0094 DO block: lines 34–111, 6924 B, `d3d12c22…`.
  - The 0113 function: lines 778–782, 483 B, `565789c2…`.
  - The earlier bounded reads in Root110 (about 11:17Z and 11:18Z) keep their real timing.
- **Edit:** 0094 goes from blob `7ada57ae` to `14ab004f` (26195 B to 26522 B, sha256 `51dedc5c…`), mode 100644.
  - The patch (`25304bcc…`) removes 1 line and adds 5: a comma after `'record_research_late_facts'`, a 3-line 0113
    comment and `'research_bound_emitter_consistent'];`.
- **Toolchain and statics:** Node 24.21.0, pnpm 11.7.0. One frozen install into the owned store, exit 0, lock `ca833c49`
  unchanged.
  - `pnpm format:check` 0; Prettier on this handoff 0.
  - The SQL is checked by PostgreSQL itself. No TypeScript changed, so no lint, typecheck or unit credit is claimed.
- **Owned PostgreSQL 16 on 55635** (`/var/tmp/coherent-008-r112-pg55635`):
  - Two fresh censuses found it free.
  - Postmaster pid 8159, start ticks 256813.
  - 8 of 8 auth and census expectations held, 0 failures; wrong-identity stop canaries all 70.
  - Child canary: inner, caller and tool all 7.

| Phase | 0094 blob | Inner / caller / tool | Result |
| --- | --- | --- | --- |
| Fixed | `14ab004f` | 0 / 0 / 0 | 112 migrations, **25 test files passed**, 0 FAIL |
| Control | `7ada57ae` (exact original) | 1 / 1 / 1 | 112 migrations, 6 tests, then **FAIL 0094** |
| Restored fix | `14ab004f` | 0 / 0 / 0 | 112 migrations, **25 test files passed**, 0 FAIL |

- **The control's failure:** "Unclassified runtime selector research_bound_emitter_consistent: decide whether it must
  exclude contribution resources". This is the same assertion as Root110's failure, so it is a real kill, not a setup
  failure.
- **0110:** the `db/tests/0110` body ran in the fixed and restored runs, and was not displayed.
- **Bound paths:** in every phase they were equal before and after; 0 client backends were left behind.
- **Stop:** readers settled (runner and child absent, 0 client backends) and canaries returned 70.
  - ONE guarded stop: inner 0, caller 0; `pg_ctl status` 3.
  - Reaped on poll 3. Listener 0 in the IPv4 table (this container has no IPv6 table), Unix socket 0, socket file and
    pidfile absent.
  - Data (57 MB), logs and secrets are retained.
- **Resources:** 90 samples, 0 unknown, 0 guard events. Minimum available space 27.68 GB. `/tmp/sophia-*` stayed at 160.

### The DB result carried over (not a fresh full DB run)

- **What carries:** the Root110 full DB run (`bviood3zo`).
  - Inner, caller and tool all 0; 2167 of 2167 tests in 560 suites; 0 fail, 0 cancelled, 0 skipped.
  - Readiness 4/4 and C2 46/46.
- **Its input:** tree `0d0f5441` plus the untracked INITIAL Root110 handoff.
- **Delta from that input to this candidate:**
  - `M db/tests/0094_api_contributions.sql`;
  - `A` this handoff;
  - `A` the committed Root110 handoff.
- **Byte-identical to the DB-run input:**
  - all 112 migrations;
  - all 107 DB test files that Node's glob expands;
  - `apps` (1416), `packages` (423), `scripts` (59), `config` (11), `tests` (83) and `patches` (5);
  - the lock, `package.json` and workspace files;
  - the drivers `scripts/db-test.ts` and `scripts/with-postgres.ts`, and the `test:db` script;
  - Node and pnpm versions.
- **Name-level check:** none of the DB test files or `with-postgres.ts` names `db/tests` or the 0094 file.
- **Handoffs, scoped separately:**
  - The DB run's bound paths included the INITIAL Root110 handoff (sha256 `3941e93c`).
  - The committed version (`fa4b6c74`, blob `76239aee`) is a separate post-check document, not a test input.

### Precision carried from Root114

- Root110's final preservation census (`journal/92`) printed an empty `listen_556xx` after the tool failed: `ss` is not
  installed, and the awk fallbacks failed. **Global 556xx listener absence at that time is therefore UNKNOWN, not 0.**
  - The Root110 FINAL-A JSON value `"listeners_556xx": 0` overstated it.
  - That original record is unchanged; this note corrects how it may be read.
- The owned-55633 post-stop point absences (`journal/80`: listener 0, Unix 0, socket and pidfile absent) remain valid.
