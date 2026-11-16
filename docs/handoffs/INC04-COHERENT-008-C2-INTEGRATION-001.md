# INC04-COHERENT-008-C2-INTEGRATION-001: attempt 1

Goal and attempt: INC04-COHERENT-008-C2-INTEGRATION-001, attempt 1 (Root110). A LOCAL integration of the accepted
inactive C2 dimension-bounds core into the accepted coherent 007; not a product slice of INC-04 and not its acceptance.  
Human owner / executor resource: Davide (repository owner); a Claude Code cloud session as integration worker.  
Native session: not applicable (no native account or session is involved).  
Starting worktree/commit: new `/home/user/sophia-r110-coherent-008` on new `refs/heads/inc04-r07-coherent-008` at
`b871a6ac341f5f44e9174a4a3779e87b664ef166` (tree `b23ccd31`).  
Ending commit/tree and changed files: the merge
`03d54587b91b5967aae24010b89cfda6bf4004fd` (tree `0d0f5441cee226bac498d90e245248531959be71`, ordered parents
`[b871a6ac…, bd5fbfbc…]`), then one commit adding only this file. See Evidence.

## States, before the checks

### Inputs

- **First parent `b871a6ac`:** coherent 007.
  - Source accepted: SOURCE_CORE `b80f215d`.
  - LOCAL_PRE accepted (`74cc0f3d`), from one fresh canonical check: 8 identities reproduced; unit 5497 and integration
    265 with 0 failures, including 4 DB-backed call-evidence cases.
  - Not run in that check: the readiness DB tests, the full DB and SQL corpora, live, native or browser paths.
- **Second parent `bd5fbfbc`:** the inactive C2 core. Tree `bde6ffe9`, sole parent `a452010d` (an ancestor of
  `b871`).
  - Source accepted (`895b4733`) and local identity accepted (`cb461171`).
  - It adds 8 paths:
    - migration 0113 and its SQL test;
    - the domain codec and Rule K module, its unit test and fixtures;
    - private persistence wrappers and their DB test;
    - its handoff.
  - Its own focused checks: 112 migrations plus the 0113 SQL test, 46 DB, 21 unit, and 20 killed controls plus 1
    informational one.

### The integration

- Git merged without a conflict or a source edit.
- Tree `0d0f5441`: 4307 leaves. All 4299 `b871` rows are retained, and exactly the 8 Host paths are added, each with its
  accepted mode and blob.
- No other path changes, apart from this handoff, in a separate commit.

### Expected positives for this attempt (each to be shown by actual output, not assumed)

- **Full SQL corpus** (`pnpm test:sql`, the unchanged runner) on an owned PostgreSQL 16 (55633).
  - Every migration applies in order, through 0112 and then 0113: expected 112 migration files.
  - Then every SQL test file passes: expected 25, the accepted 24 plus 0113.
  - The `db/tests/0110` body is executed by the runner and never displayed.
- **Full DB corpus** (`pnpm test:db`, serial) on the same cluster: all files pass.
  - That must include the 4 readiness cases (`apps/api/src/readiness.db.test.ts`) and the 46 C2 cases
    (`packages/persistence/src/research-dimension-bounds.db.test.ts`).
- **Statics and unit:** Prettier, type-aware oxlint and typecheck clean for the introduced paths; the 21 domain unit
  cases pass.

### Old negatives that stay negative

- The published `3a1e` CI (16 SUCCESS, 3 FAIL).
- The old failed and no-verdict runs, 9ab6 and `132c`.
- Old clusters 55611, 55619 and 55621, whose normal stop is UNPROVEN.
- Signer trust UNKNOWN (no allowed-signers file).
- `8e323389` and `b871a6ac` carry another session's `Claude-Session` trailer (Native's). It was copied by mistake in
  Root107 and is retained, not rewritten.

### Open mission gates (not addressed here)

- An ordinary or canonical check of this exact candidate (after SOURCE_CORE).
- CI, publication and review coverage of the introduced commits (GOV, exact head); Luis and human approval; RTA.
- Personal 9e; 8c default-off and its erratum; 9ed cancellation.
- Native, provider, route or profile qualification of any bound (the C2 core is software mechanics only); deployed owner
  and application acceptance; the full mission.
- Native Root87 (`0114`) is a separate, independent writer and is not integrated here.

## Evidence (actual results)

**Overall: the full SQL corpus FAILS on this candidate; the full DB corpus passes.** This merge is not a clean candidate
until the 0094 classification below is repaired and the full SQL corpus is rerun.

- **Intake:** `bd5fbfbc` sits on `refs/intake/r110-c2-bd5f-001`.
  - Raw commit 1699 B, `d72a21b9…`, byte-equal to the accepted one.
  - Tree `bde6ffe9`, sole parent `a452010d`.
  - 4287 leaves equal to the accepted inventory; all 8 pins exact; 20 objects.
- **Merge:** `03d54587b91b5967aae24010b89cfda6bf4004fd`.
  - Tree `0d0f5441`, equal to the prospective tree; 4307 leaves; all 4299 `b871` rows retained; only 8 added paths.
  - Ordered parents `[b871a6ac…, bd5fbfbc…]`.
  - Signed (trust UNKNOWN: no allowed-signers file). Trailer `Claude-Session:
    https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`, this executing session.
- **Statics** (Node 24.21.0, pnpm 11.7.0, frozen install, lock `ca833c49` unchanged):
  - Prettier on the TS, JSON and handoff paths: 0.
  - Repo-wide `pnpm format:check`: 0.
  - Type-aware oxlint on the 5 TS/JSON paths: 0.
  - Domain and persistence typecheck: 0.
  - Domain unit test `research-dimension-bounds.test.ts`: 21/21.
  - A first Prettier call that also passed `.sql` files exited 2 ("no parser"). That was my invocation error, not a
    source finding.
- **Owned PostgreSQL 16.15 on 55633** (`/var/tmp/coherent-008-r110-pg55633`):
  - Census found it free twice before it was created.
  - Postmaster pid 9045, start ticks 33541.
  - Asserted auth with 0 failures: TCP positive 0; wrong and absent password 2; root on Unix peer as postgres 2;
    postgres UID on Unix peer 0.
  - Wrong-identity stop canaries: 70.
  - Exit-7 child canary: inner 7, caller 7, tool 7.
- **Full SQL corpus** (`pnpm test:sql`, unchanged runner): **FAILED**, inner 1, caller 1, tool 1.
  - All 112 migrations applied in order, through 0112 and then 0113.
  - 6 SQL test files passed (0001, 0036, 0037, 0043, 0063, 0093).
  - Then `db/tests/0094_api_contributions.sql` failed: "Unclassified runtime selector
    research_bound_emitter_consistent: decide whether it must exclude contribution resources".
  - The runner stops at its first failure, so the remaining 18 SQL test files (0095–0113, including 0110) **did not
    run**.
  - The 0110 body was neither read nor displayed.
- **Full DB corpus** (`pnpm test:db`, serial, unchanged script; it builds `dsh-bundle` first): **PASSED**.
  - Inner 0, caller 0, tool 0.
  - **2167 tests in 560 suites; 2167 pass, 0 fail, 0 cancelled, 0 counted skips**.
  - 107 files, as Node's own glob expands.
  - The 4 readiness cases (2 suites) and the 46 C2 cases (13 suites) are all present and passing.
  - 5 suite-level skip markers: four Q13/0084 owned-cluster suites and one scale probe that needs
    `SOPHIA_UPDATES_SCALE`.
  - All 34 bound source paths are byte-identical before and after.
- **Owned PG stop:**
  - Readers settled: runner and child absent, 0 client backends.
  - Canaries 70.
  - ONE guarded stop: inner 0, caller 0; `pg_ctl status` 3. Reaped.
  - Listener, socket and pidfile absent; 108.7 MB of data, plus logs and secrets, retained.
- **Resources:** 782 samples, 0 unknown, 0 guard events. Minimum available space 27.73 GB.
  - `/tmp/sophia-*` grew from 105 to 160 directories, left by test fixtures, retained.

## Root cause and the proposed narrow repair (not made here: outside this lease)

- **Cause:** 0094's architecture assertion classifies every `sophia` function whose body reads
  `sophia.runtime_instances` as a picker, role-pinned or scoped. 0113 adds `research_bound_emitter_consistent(p_runtime,
  p_route, p_emitter)`. It reads exactly ONE runtime row, by the explicitly given `p_runtime`, and returns a boolean
  emitter-consistency fact.
  - It chooses no runtime for new work and returns none, which is the existing "scoped" category, like the 0111 and 0112
    entries.
  - It is the only 0113 function matching the 0094 selector expression.
  - The Host's focused checks ran only the 0113 SQL test, so they could not see this crossing.
- **Repair:** in `db/tests/0094_api_contributions.sql`, add `'research_bound_emitter_consistent'` to the `scoped` array,
  with a 0113 comment, and change nothing else.
  - Then rerun the full SQL corpus, with a control that removes only that entry and must fail at the same assertion.
  - The 0113 function itself is not changed.

## Provenance corrigendum (C007-PROV-F01)

- **Affected commits:** `8e323389b9b0781ec39dbb951bc52c92e65f6313` (raw 2516 B, `0c7b4882…`) and
  `b871a6ac341f5f44e9174a4a3779e87b664ef166` (raw 1864 B, `b3d02b7c…`). I created both in Root107 as Routing17.
- **Wrong trailer:** both carry `Claude-Session: https://claude.ai/code/session_01FGXfrJoUMojmJSW3H7XfoG`, which is
  Native1's session.
- **Correct session:** `https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`. This session's own `get_session`
  reports that id; there is no other contemporaneous authenticated URL proof.
- **Records:** the Root107 command records (scripts, logs, message files, ACK) are bound in this attempt's FINAL-A.
- **Author's account of the cause:** I copied the value from the supplied Native raw commit.
- **No rewrite:** the old commits are immutable and are not rewritten, amended or re-signed. This descendant does not
  correct their trailers, and no actor attribution may be drawn from them.
- **Exception:** erratum `57b92c96` and Root `36ad893a` carry this as an explicit exception.
