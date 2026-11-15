# INC04-S03A-R07-C2A-REPAIR-001: repair of confirmed C2A defects F01, F02 and F03, plus the finite C02 proofs

**Status:** ACK/PLAN, written before any other edit. Work in progress. HOLD BEFORE COMMIT.

The old 7998 handoff (`docs/handoffs/INC04-S03A-R07-C2A-001.md`, blob `ef29f24d…`) is immutable history. It is not revised here.

## 1. ACK

| Item | Value |
|---|---|
| Worker | SAME Host18, Claude Code cloud session `session_01FGXfrGdEeRRkWqHnZfiF8C` (container-local; no user machine attached) |
| Human owner | the repository owner (davidelaverga). No new user permission is inferred: the earlier approval covered exactly the eb28/7998 local commit. |
| Task | `INC04-S03A-R07-C2A-REPAIR-001`: context zip 351414 B sha256 `3df28e7f…8226` (6 payloads, SUMS 6/6); TASK 9532 B `2ee6e535…257a`; PATH-LEASE 5157 B `0395690c…1335` |
| Root context read | `7998-EXECUTION-PRECISIONS.json` `83b204e0…`; `7998-ROOT-IDENTITY.json` `1f7822ec…` |
| Binding contracts | R1 `5c5f89ee…` and R2 `c2dde9b6…`, both read in full; they remain binding |
| Starting commit | `7998e3a0d37bcfba3ac912648337dcf0529094e0`, tree `eb28e0a2f76f609724b08c9f23092f18d508e5e5`, sole parent `d3e5ba9c…` |
| New worktree / branch | `/home/user/Sophia-c2a-repair-001` on `inc04-s03a-r07-c2a-repair-001`, a normal `git worktree add` at 7998. 7998 itself is never amended. The candidate will be ONE new signed sole child of 7998, made only after root's commit-ready instruction. |
| Preserved | 7998, the old worktree `/home/user/Sophia-c2a-001` (clean at 7998), all old refs (93 before this branch), the main index `27c4a08f`, FETCH_HEAD `2014c32f`, and the other worktrees. Adding this branch and worktree is the only change to the main repo. |
| Lease identities | **19/19** existing paths equal PATH-LEASE (mode, blob, bytes, sha256) at 7998; the new HDF was absent |
| Independent review | the full 334 CORE on 7998 is STILL ACTIVE and UNACCEPTED. No source acceptance is inferred, and no speculative extra fixes are made. |

**Corrections to my 7998 FINAL**, which root's precision record states and I accept:
- The raw inner log has NO independent exit footer. Only the caller-observed exit 0 is archived, so my "inner and caller agree" wording was an overclaim.
- The 7998 guard script only echoed the `pg_ctl` stop status. It did not propagate it as its own exit.

This repair's wrapper and guard fix both: the inner exit is written to its own file, separate from the caller exit, and the actual `pg_ctl` status becomes the script's exit.

## 2. Writable scope: exactly the 20 PATH-LEASE paths (22 after the extension in section 6a)

**Existing (19):**
- `db/migrations/0109_research_call_evidence.sql`
- `db/tests/0109_research_call_evidence.sql`
- `packages/contracts/amendments/A57-research-call-evidence.json`
- GEN outputs, through the normal full chain only:
  - `packages/contracts/openapi/openapi.json`
  - `packages/contracts/src/generated-types.ts`
  - `packages/contracts/src/generated/validators.js` and `.d.ts` (may stay unchanged)
  - `packages/dsh-bundle/src/runtime-wire-types.generated.ts`
  - `packages/dsh-bundle/src/runtime-wire.generated.ts`
- `packages/dsh-bundle/src/control-bridge.ts`
- `packages/persistence/src/research-call-evidence.db.test.ts`
- `packages/contracts/src/research-call-evidence.test.ts`
- `tests/integration/call-evidence.test.mjs`
- `tests/support/fixture-service.mjs`
- `tests/integration/research-tools.test.mjs`
- `tests/integration/usage-provenance.test.mjs`
- `tests/unit/design-meter.test.mjs`
- `config/runtime-unit.json` (only the Sophia bundle identity, via `artifacts:record`)
- `config/dsh/profile/pnpm-lock.yaml` (only the Sophia bundle entry)

**New (1):** this file.

**Read-only:**
- `docs/SOURCE_MAP.md`: blob `4270790c…`, FROZEN.
- `packages/dsh-bundle/src/index.ts`, `session-events.ts`, `executor-identity.ts`.
- The SDK, profile dependencies and workspace lock (SDK closure `c97621b4…`, workspace lock `7a500c03…` must stay unchanged).
- Migrations up to and including 0108.
- Every test outside these 20 paths, and `docs/pack/**`.

**GEN:** I am the sole GEN writer, under the existing unpublished 0109 and A57 IDs only. There is no new migration or amendment ID, no hand edit to generated output, and no forced validator export.

## 3. Plan per confirmed defect

### F01: the first overflow restricts

**Defect.** `research_call_retain` records `first_overflow_*` once `history_count>=16`, but `research_call_settle` restricts only when `disposition='conflict'`. A valid monotone or subsumed first overflow therefore never restricts.

**Repair, in `research_call_settle` (0109):**
- When retain reports an overflow, apply the same restriction as a conflict, whatever the disposition, using the original identity's scope:
  - genuinely account-null: `research_call_restrict_allowance` (the allowance row is already held);
  - account-backed: the original account's guard `UPDATE … WHERE NOT restricted`.
- The guard is still written LAST. No account, qualification or FK lock is taken after it, and the lock order stays allowance → reservation → truth → guard.
- The `first_overflow_*` fields stay write-once. History stays capped at 16, with one fixed truth row and write-once `first_conflict_*` fields.
- There are no counters, events, time growth or new money ledger.
- A valid complete post-cap fact still extends the fixed truth and runs the existing money transition exactly once.
- The restriction stays sticky through later facts and replays. Late Stop/revoke settlement is unchanged, because settlement never reads the guard.

**Causal regressions (real PG, both funding scopes: account-backed research, and account-null project-funded):**
1. Fill 16 history rows WITHOUT any conflict.
2. Send a first VALID overflow, including a complete-knowledge gain with its money.
3. Before any conflict exists, assert:
   - the guard or allowance restriction is set;
   - new paid work is refused (a new model reserve);
   - data stays bounded (16 rows, one marker);
   - the money moved exactly once;
   - repeats and late facts change nothing.

These must fail on unchanged 7998 because the restriction is actually missing, not because a feature is absent or an import fails.

### F02: an honest post-cap exact repeat

**Defect.** The fast path `t.digest=f.digest` answers `current` with `replay:true, capped:false` even when that input was never retained because of the cap. With a supported ID and a valid complete overflow, the merged truth equals the input, so an exact repeat takes this path.

**Repair:**
- In the fast path, a digest that is not in history once the cap is reached is treated as an unretained post-cap input. It goes through the normal capped tail: the first overflow is recorded if none exists yet, and the restriction from F01 applies.
- It answers stably and honestly: `disposition 'capped', replay false, capped true`.
- Retained digests keep returning their stored original disposition with `replay:true`.
- Known truth, the first overflow, the first conflict and money are unchanged; there is no re-spending.

**Below the cap, unchanged:** an input that equals a merged truth digest never itself retained still answers `current`/replay. That is outside the confirmed F02, so I report it here for root and leave it unchanged.

**Causal regressions:**
- An exact repeat of a supported-ID valid complete overflow.
- A retained intermediate and an unretained intermediate, each repeated after a later truth gain.
- Bounded growth: still 16 rows and one marker.

These must fail behaviourally on 7998.

### F03: mandatory C01 resource binding

**Defect.** The A57 binding fields, the required list, SQL `research_call_ack` and the bridge's `bindingProblem` all omit `resourceId`.

**Traced context:**
- `research_call_identities.resource_id` is already frozen from `execution_bindings` (`research_call_identify`).
- Every maintained `RuntimeCommand.binding` carries `resourceId` (`runtime-wire-types.generated.ts`, `RuntimeCommand`), and SQL dispatch writes it from the binding (0109 line ~1149).
- `RuntimeHelloReply` bindings do NOT carry it. I do not invent it there.

**Repair:**
- **A57:** add `resourceId` (uuid) to the closed binding object and to its required list. Then run GEN through the normal full chain.
- **SQL:** `research_call_ack` echoes `'resourceId', i.resource_id`.
- **Bridge (`control-bridge.ts`):** the attempt keeps the authenticated `resourceId` from each command accepted for it, as checked by `execute`: unit, attempt ID and the epoch not stale.
  - A command that names a different resource for the same attempt makes the attempt's resource context ambiguous. It stays refused and is never overwritten.
  - `bindingProblem` gains a closed problem `resource`: a binding without `resourceId`, an attempt with no resource context or an ambiguous one, or `binding.resourceId` different from the attempt's.
  - Every refusal happens BEFORE `next()`, across all three wrappers: research, design and source review. The original reservation, key and uncertain commitment are kept. There is no release, no new key and no legacy fallback.
  - The resource comes only from authenticated commands; there is no fake runtime or resource constant, and nothing the model supplies.
- **All other C01 checks are unchanged:** mode, contract, call, attempt, native session, project, unit, state, kind, purpose and amount.

**Edge reported, not written:** recovery after a restart has no durable resource carrier.
- The journal schema (`sophia/command` in `session-events.ts`) and `foldLog` are READ-ONLY in this lease, and hello bindings lack a resource.
- So an attempt reconciled only from hello has NO resource context until an authenticated command for it arrives. Until then, its tracked model calls are refused before any provider effect. This is the honest fail-closed answer.
- If root wants calls to continue after a restart without a new command, the single additional path needed is `packages/dsh-bundle/src/session-events.ts`: a `resourceId` field in the `sophia/command` record, folded by `foldLog`. I will not write it without a lease.
- If an existing out-of-lease test depends on such a continuation, I will report its exact name and edge instead of changing it.

**Causal regressions** (real runtime, fake Responses provider, all three wrappers):
- a correct positive;
- a missing resource: a valid old-shape ACK without `resourceId`, which on 7998 reaches the provider;
- a wrong resource.

Each asserts zero provider requests, a kept key and nothing released or settled. Contract/schema checks cover the required `resourceId`, and SQL checks confirm the ACK resource equals the frozen binding's resource.

## 4. Finite C02 proof obligations (real PG, two connections where a race is claimed)

The existing 14-case DB suite contains:
- a research positive;
- an account-backed design positive;
- an account-null review positive;
- an account-backed `openai-review` refusal that happens BEFORE the account guard.

That last one is not an account-backed review guard positive, and I will not call it one.

**Account-backed review:** I will trace the current admitted review route, account provider, model and qualification constraints exactly.
- If a legitimate matching account-backed review positive exists in the current contract, I demonstrate its original funding, its guard and its adverses on real SQL.
- If the source cannot reach it, I return the exact unsupported edge and scope before changing any domain capability. The refusal stays honest; nothing unsupported is accepted just to get green.

**New two-connection crossings, at the writable last guard:**
- normal-funded AND rebuilt queued create/resume/steer;
- a conflict committed before, and after, the final guard wait;
- qualification revocation AND expiry AFTER the final guard wait (fresh instant);
- late known settlement after Stop and after revoke;
- cumulative exposure across distinct retry reservations;
- same account across projects, with no deadlock and no lost facts.

Existing focused positives are reused only with an exact source and case binding. There is no generic full-coverage claim.

## 5. Evidence plan and hold

- **Own PG:** a NEW PG16 on 127.0.0.1:55541, only after an actual census of port, process and directory shows it free and new.
  - Paths: `/var/tmp/c2a-repair-pg55541/{data,log,sock,secret}`; the secret root is 0700 and pw is 0600.
  - The old 55531 (unclean), 55535, 55537 and 55539 stay sealed and retained: no restart, repair, deletion or reuse.
  - The credential reaches only the child's connection environment; it never appears in logs, packets or model context.
- **Fail-before:** run on UNCHANGED 7998 with the new isolated regressions (feature present). Then run after, on the WIP. Every failed WIP or adverse log is kept.
- **Focused checks:**
  - the full SQL suite;
  - the affected DB, runtime and contract tests and the old fixtures, with no weakening, skips or deleted assertions.
  - The full `test:db` includes the known F1 obsolete fixture on this branch (a89 is separate). It is reported honestly and NOT patched.
- **Toolchain:** exact Node 24.21.0, pnpm 11.7.0, frozen lockfile, umask 022.
- **Restricted UID 65534 preflight:** imports the BUILT shipping modules and checks that the credential and data are denied. No direct TypeScript strip-load of parameter-property source; every attempt's failure is kept.
- **Artifacts:**
  - `build` and `artifacts:record` run only because the bundle changes.
  - The new Sophia bundle identity and the profile-lock entry are expected to change.
  - SDK closure `c97621b4…` and workspace lock `7a500c03…` must stay unchanged; all 8 identities are then verified.
- **HOLD BEFORE COMMIT** until root delivers the formal full 334 finding batch and a commit-ready instruction. All permitted WIP, focused checks and evidence are finished before the hold.
- **Later, only on commit-ready:** ONE normal signed sole child of 7998. No amend, reset, rebase, force, commit-tree, hook, key or permission bypass. If the automatic review rejects the commit, STOP and report.
  - Then EARLY, ONE ordinary run on the clean new head, the guarded stop, and FINAL.

## 6. Effects and holds

**Not done:** no push, PR, comment, CI action, merge, deploy, flag, Render, GHCR, provider, account, native or voice effect. No SOURCE_MAP writes and no new GEN IDs.

**Holds preserved:**
- accepted 8c default-off, the erratum and the 9ed cancel;
- GOV21, SEC null, Luis integration, RTA, the owner's 4 native pairs, deployed authorization, app 134, E1–E8;
- the full 18 AC-04, full R07, Personal 9e and the voice USER suspension.
- F2 stays UNKNOWN. Event lane 8055, F1 a89 and diagnostics 08475 stay separate LOCAL_PRE, not joined.
- Current d3e CI red stays failed.

Native 1 is read-only for C2B public SDK inspection, and Routing 17 is read-only prep. This session is the sole source and GEN writer.

## 6a. EXTENSION ACK: resource recovery (22 paths), written before either new path is touched

| Item | Value |
|---|---|
| Extension zip | `C2A-REPAIR-001-RESOURCE-RECOVERY-EXTENSION`: 3162 B, sha256 `afc13bba…41bf` |
| Contents | `EXTENSION.md` 4418 B `2a66d814…`, `BINDINGS.json` 658 B `2ca48440…`; SUMS 2/2 OK; both read in full |
| Root receipt | root received my ACK zip (9257 B, `4e12d2ca…`) and accepted the exact F03 restart edge |
| Granted | ONLY two more existing paths, each bound at 7998 and checked equal to `BINDINGS.json` (mode, blob, bytes, sha256), unchanged in this worktree until after this section |

The two granted paths:
- `packages/dsh-bundle/src/session-events.ts`: blob `de5f2de3…`, 14048 B, `24d27f7f…`.
- `tests/unit/bridge-core.test.mjs`: blob `e3005f89…`, 14036 B, `cde8d8db…`.

**Total: 22 paths.** Same parent 7998 and the same new branch. SOURCE_MAP stays frozen. GEN stays under 0109/A57 only. `index.ts`, `executor-identity.ts`, the SDK, profile dependencies, workspace lock and old migrations stay read-only.

### Plan: F03 resource recovery

**Persist.** The authenticated `resourceId` goes into the EXISTING `sophia/command` record. It is written only for a command that already passed `execute`'s unit, attempt-ID and epoch checks, through the existing `append` (written and fsynced before any native action).
- It is application resource identity only. No raw provider ID, header or credential.
- No new record types, per-call journal records, metadata bus or model-supplied actor.

**Fold (`foldLog`).** It derives the attempt's resource from those records, scoped to the journal's own attempt and native session.
- A record without the field (legacy) contributes nothing, so it reads as unknown. It never erases a known value.
- The first valid known resource is kept.
- A different known resource for the same attempt makes the state `ambiguous`. That is sticky across fold and restart: it is never cleared, never switched to the latest or first value, and never resets the epoch.
- A value that is not a valid wire resource ID is not adopted as one; it counts as ambiguous, so it fails closed.

**Restore.** Reconcile and every other path that builds an attempt from the journal restore this private context.
- If the journal has no resource and hello cannot establish one, the attempt's resource stays unknown, so tracked paid model calls are refused before any provider effect.
- The refusal lasts until a legitimate, already-authenticated command for that attempt establishes the resource.
- Unknown is never broadened into authority, and a resource already known from the journal is never overwritten by a later command naming another. That makes it ambiguous and refused.

**Preserved.** Stop, hold, reconcile, late evidence/settlement and incorporation receipts are untouched. Resource ambiguity gates only NEW paid model reservations; it creates no paid retry or new key. Expected SDK, model, role and preset identity are unchanged.

### Tests

**In `bridge-core.test.mjs`**, through the real fold, journal append/read and restart restoration:
- the correct resource is restored;
- an old record with no field reads as unknown;
- a later record missing the field does not erase a known resource;
- a conflicting resource is sticky ambiguous;
- a mismatched attempt, or corrupt context, cannot become a valid resource.

All old assertions are kept. Expected closed shapes are amended only where the new field is intended.

**In the in-lease `call-evidence` real runtime with the fake provider:**
- the restored context after a restart;
- all three wrappers with a missing or wrong resource, refused before any effect with the original key kept;
- old records failing closed;
- Stop still working.

**Before-fix controls on UNCHANGED 7998:**
- the old carrier loses the resource on fold/restart;
- an old-shape ACK without a resource reaches the provider.

Each fails on its actual assertion, not on an unknown API or an import error. Synthetic and actual-server contexts are labelled.

**C02 review boundary (root confirmed):** the current review model is not admitted by the research-only contribution policy. The refusal stays, and its exact boundary is returned; no new provider, model or route qualification is invented.

## 6b. FORMAL FINDING BATCH ACK (written before any further write)

**Batch:** `C2A-REPAIR-001-FORMAL-FINDING-BATCH-001`, 409329 B, sha256 `1877c8dd…0e89`, SUMS 5/5.
- Read in full: FORMAL-BATCH.md (5296 B, `5a1ca6a8…`), the whole-334 CORE JSON (45824 B, `25aae236…`) with its MD, and ROOT-ADOPTION (2467 B, `46acb7a2…`).
- `7998-PROOF.json` (`e8769476…`) was received as inert data and checked by checksum only.
- **Verdict:** CHANGES_REQUIRED on 7998. This is a formal batch only: it is NOT commit-ready and no source is accepted.

**Stable IDs ACKed. There is no fourth production defect, and I make no speculative fixes** (no numeric JSON spelling change, no binding-fallback change). N01, N02 and N03 are recorded as non-findings and precisions.

| ID | Priority | Defect | Repair in this candidate | Required regressions (added to the plan) |
|---|---|---|---|---|
| C2A-F01 | P1 | the first valid overflow does not restrict | §3 F01 | account-backed AND account-null valid overflow before any conflict; tracked AND legacy new paid work refused with no effect; another account and another allowance unaffected (positive); the later complete known positive advances truth and money exactly once; bounded rows, immutable first markers, a repeat never double-spends |
| C2A-F02 | P2 | an unretained post-cap current digest returns a false replay | §3 F02 | post-cap current-digest repeats with a supported ID AND with an unknown ID; retained inputs keep their original receipts; unretained intermediates stay capped before and after a later truth gain; money exactly once; fixed bounds |
| C2A-F03 | P2 | the closed ACK omits the resource | §3 F03 and §6a | missing and wrong resource refused before any effect, and matching positives, for all three wrappers, including recovered session context; no new key, fallback or release |

**Dispositions:**
- **C2A-C02-01 (OPEN, not waived):** the current review route is `openai-review`/`gpt-6-luna`/high. The contributed tuple frozen by 0094 and 0104 is `research-sol-medium-v1`/`gpt-6.1-sol`/medium, the qualification is research-only, and the 0109 gate admits `openai-research` only.
  - The account-backed review refusal REMAINS. There is no new provider, model, owner or qualification capability, and no constraints are widened.
  - I make no claim that all three account-backed guards have a positive, that C02 is closed, or that full R07 is done. The exact unreachable boundary is recorded (0094:52–56 and 86–89, 0104:133–168, 0109:247–275).
  - If an existing guard branch can be exercised with a clearly labelled synthetic unreachable funding variant under current SQL without changing constraints, its exact setup and call path go back to root for disposition only.
- **C2A-C02-02:** expiry after the NEW LAST guard wait.
  - A second real connection holds the guard; the waiter is proved blocked by an actual lock observation (`pg_locks`/`pg_stat_activity`), not by sleeps.
  - After the expiry passes on the current DB clock, release, and the call is refused at `clock_timestamp()` after the wait.
  - A matched positive is included; the existing account and revocation interleavings stay.
- **C2A-C02-03:** the actual maintained dispatch/outbox with the original binding: normal-funded create, resume and steer, and rebuilt/unfunded reacquire.
  - A restriction committed before, and during, the guard wait results in no runtime command, no new paid claim and no reservation.
  - Unblocked positives are matched, and Stop, control and late facts stay available.
  - Not a private-helper-only test.
- **C2A-C02-04 (real PG):** distinct retry reservations under the original authority count cumulatively, with the first one uncertain. A cap refusal never reprices, falls back or releases the first. Later known facts after Stop or lease expiry land exactly once, with no new paid action and no auto-release.
- **C2A-K03-HTTP:** a targeted loopback crossing THROUGH the existing authenticated runtime HTTP route with real PG at the actual body limit.
  - A supported, escape-heavy, 8192-byte UTF-8 ID is accepted.
  - A multibyte ID one byte over is classified before the wire, its known usage retained, and refused with a fixed input error that does not echo the raw ID.
  - No leak into the journal, member readout or log.
  - It is hosted in existing in-lease DB, runtime or contract tests. No production route, body-limit or security change.
  - If a test-support path outside the 22 is needed, its exact caller, helper and source identity come back BEFORE writing.

**Precisions kept:**
- The A57 `maxLength` counts characters, not UTF-8 bytes; the byte policy is enforced in the bridge and SQL.
- Known complete-zero, failed-usage and late facts are never erased.
- Successor evidence records the actual executed source identity and per-command exits.
- The repair wrapper records the actual inner exit plus a separate caller exit, and the guard propagates the stop status.
- SOURCE_MAP `4270790c`, the SDK `c97621b4` and the lock `7a500c03` are unchanged.
- No C2B carriers, new GEN IDs, UI or real provider capability.

**Scope:** still exactly the 22 paths (§2 plus §6a); this batch adds none.

## 7. Progress log

(Updated as the work proceeds; nothing below this line is written before the ACK above.)

### WIP changes (uncommitted; 7998 untouched)

**0109:**
- **F01:** the settle tail restricts on `disposition='conflict' OR capped`. That is the allowance restriction (account-null), then the original account's guard LAST, `WHERE NOT restricted`. No new lock or ledger.
- **F02:** at or past the cap, the `t.digest=f.digest` fast path no longer answers `current`/replay. It takes the capped tail (`subsumed`, so the answer is `capped`, replay false, capped true), recording the first overflow if none exists.
- **Below the cap:** `current` is unchanged (observation reported, not fixed).
- **F03:** `research_call_ack` echoes `resourceId` (the frozen `resource_id`). The header comments were updated.

**A57 and GEN:**
- A57 adds the closed `binding.resourceId` (the command `resourceId` pattern) and makes it required, with a "why" line.
- The normal full GEN chain wrote the openapi, generated types and both runtime-wire files. It reported the validators up to date, so they are unchanged.

**F03 resource recovery (§6a):**
- `session-events.ts`:
  - an optional `resourceId` on `sophia/command`;
  - the exported `ResourceContext`, `UNKNOWN_RESOURCE` and `foldResource`;
  - `foldLog` returns `resource` and scopes it to the first resource-bearing attempt; another attempt or an invalid value is ambiguous.
- `control-bridge.ts`:
  - the attempt's `resource`, restored in `newAttempt` from its own journal (another attempt's records count as ambiguous);
  - `append` folds and journals the command's binding resource before any native action;
  - all three wrappers call `resourceReady` (`ResourceRefused`: unknown or ambiguous) BEFORE reserving, and `bindingProblem` returns `resource` when the ACK names no resource or another one.

**Artifacts:** `artifacts:record` changed only the Sophia bundle identity (`2bbf971a…` to `c75c2484…`) and its profile-lock integrity. The SDK closure `c97621b4…` and workspace lock `7a500c03…` are unchanged.

### C2A-C02-01: exact unreachable boundary (OPEN, not waived)

- **Contributed tuple:**
  - 0094:52–56 and 86–89 freeze connection and grant routes to `research-sol-medium-v1`/`gpt-6.1-sol`/medium;
  - 0104:133–168 makes qualifications research-only;
  - the 0109:270 gate (`contribution_model_reserve`) refuses any provider other than `openai-research` with `provider_not_contributed` before any account work.
- **The admitted review route** `source-review-luna-high-v1` uses the provider alias `openai-review` (config/runtime-unit.json:199–203).
- **So:** no current account-backed review can reach the writable account guard. The refusal is kept and covered by the existing 14-case test "an account-backed review on another provider is refused before any effect".
- **Still useful positives:** the account-null review positive and the labelled synthetic shared-allowance design positive.
- **Not returned:** I found no synthetic variant that would exercise the guard branch for a review without changing a constraint or the claimed route, so none is offered.

### Focused WIP results on the own PG 55541 (exact toolchain, exit codes from the wrapper)

| Check | Result |
|---|---|
| `test:sql` | 108 migrations, 21 files, exit 0 |
| DB `research-call-evidence` | 27/27 after one test-only fix round, exit 0. The first run had 22/27: two wrong column names in my queries and an account cap in my own setup |
| Contracts test | 6/6 |
| Unit `bridge-core` + `design-meter` | 20/20 |
| K03-HTTP (usage-provenance, real API and PG) | 3/3, after two expectation corrections to the MAINTAINED answers: 422 `invalid_request` for a SQL evidence refusal, and 400 `malformed` for a body over the limit |
| Lint, format, typecheck, `contracts:check` | exit 0 |


### Final focused verification (author evidence; NOT commit-ready; HOLD BEFORE COMMIT)

**Source-review snapshot.** `C2A-REPAIR-001-PRECOMMIT-SOURCE-EARLY` (sha256 `20db7980…8a3b`) froze the production and test bytes at WIP tree `372c4469…`. Only this HDF changed after it.

**Full integration on the WIP** (handle `b2g6s9qm7`, inner exit 1, captured correctly):
- 254 tests, 250 pass, 2 fail, 2 skipped.
- The 2 failures were my count assertion: design and review send 4 transmissions of ONE reservation key. The test was corrected to assert one key, and the corrected F03 cases pass 9/9.

**Unit tests:** 5340 tests, 5273 pass, 0 fail, 67 skipped. **Exact exit UNKNOWN** (see the errata below).

**Full `test:db` on the WIP** (handle `ba1b5bilw`): **NEGATIVE**, 2081 tests, 698 pass, 54 fail, 1329 cancelled. **Exact exit UNKNOWN**; the log ends with ELIFECYCLE exit code 1.
- **First cause:** `apps/api/src/selection-installation.db.test.ts`, setup `allBut('0105')`, fails at the 0109 rollback because `sophia.api_contribution_claims` does not exist.
- **Cascade:** the leftover assembler role caused the 0070 setup failures in every later file.
- **Classification:** the first cause fails identically when run alone on unchanged 7998 and on the WIP. Its relation to a89 F1 is UNPROVEN.
- **Cleanup:** only my own cluster 55541's leftover disposable test databases and roles were dropped. There were no live client backends, and the before and after states are logged.

**The 102 other DB files on the clean cluster** (handle `btak8eg01`, inner exit 1, captured correctly): 2031 tests, 2023 pass, 3 fail, 5 cancelled. Each failing file was run alone on unchanged 7998 and on the WIP:

| File | Behaviour |
|---|---|
| `selection-observations.db.test.ts` | 3/4 on both trees. It expects only `[0107 applied]` and gets 0107, 0108 and 0109: pre-existing at 7998 |
| `contribution-installation.db.test.ts` | 1 fail, 5 cancelled on both trees: `allBut('0105')` plus the 0109 type, pre-existing at 7998 |
| `presence-order.db.test.ts` | 5/5 on both trees. Only the sweep raised its "asynchronous activity after the test ended" flag; not reproduced, and unrelated to C2A |

All three are out of lease, with blobs identical in both trees. Their relation to a89 F1 is UNPROVEN. None was edited.

**The C2A DB file in the clean run:** every case passes, including F01, F02 and C02-02/03/04.

**Errata:** the w21 and w22 `.meta` "inner-exit" values are the exit of `$(date)` inside the same `echo`, so they are invalid. Neither run was repeated just to produce an exit footer. The later ONE ordinary run will capture the real inner exit and a separate caller exit.

## R1: ACK/PLAN (code successor), appended before any other R1 write

Everything above this heading is the byte-exact prior HDF history: the final 0393 HDF, blob `a1f80a4b…`. It differs from the 372c seed HDF (blob `5b88bd3f…`) only by its final-verification section. The old history is not revised.

**Inputs:**
- R1 context zip: 24674 B, sha256 `ad425ffb…753d`, SUMS 4/4.
- TASK `552977a0…`.
- Whole-337 CORE `0ea7e89f…`, verdict CHANGES_REQUIRED, source review only.
- PATH-LEASE `0395690c…` and the extension bindings `2ca48440…`.
- All read in full. The writable scope is the same exact 22 paths.

**Worktree:** the R1 worktree `/home/user/Sophia-c2a-repair-001-r1` on branch `inc04-s03a-r07-c2a-repair-001-r1`, a normal worktree at exactly 7998.
- 7998, 372c (`372c4469…`), final 0393 (`03930478…`) and the old repair worktree stay immutable.
- This new tree is NOT 372c.

**Restore:** after this HDF, the 18 frozen 372c source and test bodies are restored from my own sealed EARLY packet `source/`, excluding the HDF.

**Prior packets:**
- Final verification packet: sha256 `47e1975f832c5cb62212aff22f77ceee3591149e8f3460e57c6f25ef9309329d`.
- Old 102-file run `btak8eg01`: terminal, inner exit 1, 2023 pass / 3 fail / 5 cancelled; it qualifies the old source only.
- Old own PG 55541: terminated by the container restart at 14:51:32Z, not stopped by me. The pidfile still names 776 and `pg_controldata` says "in production". The identity guard refused every mode with exit 11 (pid absent) before any action. It is retained untouched: data, stale pidfile, socket, log and credential. No restart, repair or deletion.

**Precision:** the HDF plan above said `resourceId` was a uuid. The actual A57 and RuntimeCommand wire shape is the opaque64 pattern `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`, and that is what is implemented.

**Plan:**
- **F04:** the resource-owner attempt provenance is kept independently of the last metadata `attemptId`.
  - `foldLog` returns every attempt named by the journal's attempt-bearing records.
  - The resource is ambiguous when more than one attempt appears.
  - The bridge restores a resource only when every record names the requested attempt.
  - Meaningful controls go through the real Journal and `ControlBridge`.
- **V01:** a printable sentinel goes inside the 8192-byte supported ID, its absence is scanned across tables, the log and the returned bodies, and a synthetic JSONB sensitivity probe proves the scan works.
- **C02-02, 03 and 04:** the finite reachable edges listed in the CORE.
- **C02-01:** OPEN and unsupported.
- **Verification:** fail-before on an unchanged 372c export.
- **Own PG:** a new PG on 55545.
- **HOLD BEFORE COMMIT and ordinary.**

### R1 outcome (author evidence; SOURCE REVIEW ONLY, NOT commit-ready; HOLD BEFORE COMMIT)

**Identity:** the seed tree `73b6735f…` (the 18 bodies equal 372c; HDF-only difference) became the R1 evidence tree **`dd85c8c4…`**. It was unchanged before and after the final evidence run. This HDF-only append makes a later tree, reported with its delta.

**C2A-REPAIR-F04 (`session-events.ts`, `control-bridge.ts`):**
- `foldLog` keeps a bounded owner: the first owner-typed record's attempt, plus a sticky `ownerMismatch`.
- Owner types are command, fence, stash, unstash, resume-recovery, epoch and identity. Audit-only records are not owners.
- A mismatch makes the resource ambiguous.
- `loggedResource` restores only when the owner is the requested attempt and there is no mismatch. Provenance never comes from the last row's `attemptId`.
- Unchanged: the opaque64 shape, same-attempt legacy absence, sticky ambiguity, Stop and settlement.

**C2A-REPAIR-V01 (`usage-provenance` K03-HTTP):**
- The supported ID is a printable sentinel plus `\u0001` filler, exactly 8192 bytes and escape-heavy.
- The sentinel is absent from every table except `research_call_truth`, from the API log and from the returned bodies.
- A SYNTHETIC JSONB probe proves the sentinel scan finds a copy that the old raw-control-character scan misses.

**C02 (real PG, maintained paths):**
- **C02-02:** admission and dispatch each blocked at the last guard (proved by `pg_blocking_pids`); qualification expiry passes on the DB clock, so there is no admission, command, claim or reservation; matched positives. After a committed revocation, the NEXT admission is refused (`account_unqualified`) and the NEXT dispatch is refused at its readiness predicate ("not dispatched: its contribution's account is not currently qualified").
- **C02-03:** funded steer and resume, and the rebuilt successor's reacquire, each blocked at its own final guard while a restriction commits: denied or cancelled, with no command, claim or reservation. The create-during-wait case now asserts reservation conservation on both ledgers.
- **C02-04:** the reserving runtime lease expires by the DB's own state and clock (`runtime_unavailable`: "waiting for Sophia's runtime to reconnect", no column touched). The exposure is kept with no auto-release; the superseded old lease is not authority; late facts land once under the current lease; no new reservation.
- **C02-01:** stays OPEN and unsupported, with no widening.

**Before-controls on UNCHANGED 372c** (a `git archive` of 7998 plus the 18 frozen bodies, all 4256 leaves equal to 372c, artifacts reproduced):
- F04, fold and restart: `actual {known, res-B}`, expected `ambiguous`; the restart path does the same.
- Matched F04 controls pass.
- The R1 C02 proofs (9/9) and V01 K03-HTTP (3/3) pass on 372c. They prove existing behaviour and a test correction, not a production defect.

**Final complete direct evidence files on R1 tree `dd85c8c4…`** (own PG 55545; each inner exit recorded right after its own command):

| File | Result | Inner exit |
|---|---|---|
| `test:sql` | 108 migrations / 21 files | 0 |
| DB `research-call-evidence` | 37/37 | 0 |
| contracts | 6/6 | 0 |
| `bridge-core` + `design-meter` | 23/23 | 0 |
| integration `call-evidence` | 34/34 | 0 |
| integration `usage-provenance` | 32/32 | 0 |
| integration `research-tools` | 6/6 | 0 |

The caller exit was 0.

**R1 test-fixture corrections** (failing logs kept): the revocation-dispatch reason text, the rebuilt case's extra claimed Stop row, a shadowed variable, and the F04 matched control's structural `owner` check replaced by its behavioural restore check. A restart-path-only F04 case was added.

**Old own PG 55541:** ended EXTERNALLY and uncleanly by the container restart at 14:51:32Z. It gets no guarded-stop or canary credit: the guard refused all modes with exit 11 because the pid was absent. Its data, stale pidfile, socket, log and credential are retained untouched.

**Errata to the 0393 history above** (additive; the history is unchanged):
- `presence-order`'s cause is UNKNOWN: a 57P01 administrator termination after 5 passes, and 5/5 when isolated twice. The words "unrelated to C2A" were an overclaim.
- The "known inherited F1" wording in the w26 meta is superseded: these are fixture failures pre-existing at 7998, and the a89 relation is separately established by root only for the `selection-observations` class.
- The unit and full `test:db` exits remain UNKNOWN.

## R2: ACK/PLAN (finite correction), appended before any other R2 write

Everything above this heading is the exact 38140-byte e743 HDF (blob `4df64551…`, sha256 `c8c35a29…`), and that history is not revised.

**Inputs:**
- R2 context: 26567 B, sha256 `7a9a31e4…`, SUMS 6/6.
- TASK `c0ad712d…`.
- Whole-337 CORE `84cb1334…`: CHANGES_REQUIRED for one bounded residual, `C2A-REPAIR-F04-R1-NULL-OWNER`.
- Effective-readiness additive `bbbc8d63…`.
- FOCUSED-PG-STOP-BEFORE-HOLD `03349d83…`, binding.
- All read in full. The writable scope is the same 22 paths.

**Worktree:** the R2 worktree `/home/user/Sophia-c2a-repair-001-r2` on branch `inc04-s03a-r07-c2a-repair-001-r2`, at exactly 7998.
- e743 (`e743aa86…`), dd85, 73b6, 372c, 0393 and 7998 are frozen.
- The 18 bodies are restored from my own sealed e743 packet (`6c46d7a9…`), excluding the HDF.
- The new tree is never called e743.

**Plan:**
- **F04 null owner.** An owner-typed record whose `attemptId` is not a string (explicit null included) makes the owner sticky-invalid (`ownerMismatch`) BEFORE any adoption, so later valid rows never initialize over it. A known restored resource requires `owner === requested attempt` and no mismatch. The causal controls go through the real Journal and a `ControlBridge` restore, on unchanged e743 and then R2.
- **C02-04 labels.** The test proves readiness/liveness STALENESS (effective `runtime_unavailable`, 0094:1122–1130, `seen_at` older than 90 s), then SUPERSESSION of the old lease by a new hello (`runtime_authenticate` and `runtime_lease`, 0012:373–395, have no TTL). It is not a time-expired authentication. Labels and comments are corrected; there is an erratum below.
- **Fixture waits.** `untilDbPast` and the staleness loop get finite budgets, so a missing predicate fails loudly. The DB clock and state stay the only authority; a timeout never proves expiry or releases exposure.
- **Own focus PG16 on 55549:** a census first. After every reader is terminal: an AUTHENTICATED pre-stop census (child environment only), a positive identity canary, then the wrong-argv and wrong-start canaries, then the guarded normal stop with the actual `pg_ctl` exit propagated, reap, point absences, and the data and secret retained. All BEFORE the source packet and HOLD.
  - Old 55545 and 55541 (externally ended, unclean) and 55531 and 55539 stay untouched.
  - A later ordinary uses NEW 55553, and only after commit-ready.
- **Runner:** it records each rc immediately AND aggregates failures into its own exit, and records the source tree and status BEFORE and AFTER the run.
- **Artifacts:** normal build, `artifacts:record` (Sophia identity only), then the actual current all-8 VERIFY.
- **No:** GEN, SDK, new IDs, push or commit. HOLD BEFORE COMMIT and ordinary.

**Erratum (e743 history):** in the R1 C02-04 test name, comment and HDF text, "the reserving lease EXPIRES (DB clock and state)" overstated the proof. The actual scope is readiness/liveness staleness plus hello supersession, not time-based authentication expiry.

### R2 outcome (author evidence; SOURCE REVIEW ONLY, NOT commit-ready; HOLD BEFORE COMMIT)

**Trees:**
- Seed `dd58284d…`: 7998 plus the 18 e743 bodies plus the R2 ACK HDF; its only difference from e743 is the HDF; outside the 22 paths, 4234/4234 equal 7998.
- Evidence tree **`16d19a28…`**, recorded BEFORE and AFTER the final run as two raw points.
- This append makes a later tree.

**C2A-REPAIR-F04-R1-NULL-OWNER:**
- In `foldLog`, an owner-typed record whose `attemptId` is not a string (explicit null included) sets the sticky `ownerMismatch` BEFORE any adoption.
- `loggedResource` restores a known resource only when `owner === requested attempt` and there is no mismatch.
- Kept: the O(1) state, the typed-valid B/A refusal, same-attempt legacy absence, audit-only text, Stop and late facts.

**Causal before-control on UNCHANGED e743** (all 4256 leaves equal, only the R2 `bridge-core` copied in):
- The four null-owner cases (N0 alone; N1 then an A legacy command; N2 then an A fence; N3 then an A epoch) each fail at `actual {known, res-B}`.
- The typed-valid F04 cases and the matched controls pass.
- The sticky case passes on e743 incidentally: it is a positive control, not causal.
- On R2 the file passes 23/23.

**C02-04 labels and wait budgets:**
- The test is renamed to "goes STALE (readiness/liveness) … a new hello SUPERSEDES its lease", per the effective `runtime_unavailable` (0094:1122–1130); no TTL.
- `untilDbPast`, the inline expiry wait and the staleness loop now have finite budgets that only fail the test; the DB clock and state remain the authority.

**Final R2 evidence on tree `16d19a28`** (own PG 55549; the runner records each rc immediately and aggregates them into its own exit):

| File | Result | Inner exit |
|---|---|---|
| `bridge-core` + `design-meter` | 28/28 | 0 |
| DB evidence | 37/37 | 0 |
| integration `call-evidence` | 34/34 | 0 |
| integration `research-tools` | 6/6 | 0 |
| integration `usage-provenance` | 32/32 | 0 |

- Aggregate failures 0; caller-observed runner exit 0.
- Tree BEFORE = AFTER = `16d19a28`, with head 7998 and 19 status entries at both points.
- `test:sql` and the contracts test are unchanged by R2 (`0109`, `A57` and the contracts test are byte-equal to e743). Their e743 evidence (e01 108/21 exit 0; e03 6/6 exit 0) applies by that exact file binding.

**Artifacts:** build, `artifacts:record` and the actual current all-8 VERIFY each exited 0.
- All 8 match.
- SDK `c97621b4…` and workspace lock `7a500c03…` are unchanged.
- The Sophia bundle is `9c9c5e6d…`.
- Format, lint, typecheck and `contracts:check` exit 0. No GEN.

**Own focus PG 55549 lifecycle (binding stop-before-HOLD):**
- Census-first creation: pid 760, start ticks 20125, argv `92f09c01…`.
- After the readers were terminal: an AUTHENTICATED census (child-environment credential) showed 0 other client backends and only the `postgres` database.
- The positive identity canary passed (marker only), then wrong argv (exit 12), wrong start (exit 13) and wrong values in stop mode (exit 12).
- The guarded normal stop: `pg_ctl` exit 0, propagated as the script's exit.
- Reaped, with 0 zombies; the listener, pidfile, socket and lock are absent; `pg_controldata` reports "shut down".
- The data (700 postgres) and the secret (0700/0600) are retained.
- 55545, 55541, 55531 and 55539 are untouched.
