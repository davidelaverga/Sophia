# COHERENT-008-CAPACITY-TIE-REPAIR-001: attempt 1

Goal and attempt: COHERENT-008-CAPACITY-TIE-REPAIR-001, attempt 1 (Root120). A distinct repair to the pure capacity
module of the published coherent 008 candidate. It is not an INC-04 product slice or its acceptance.\
Human owner / executor resource: Davide (repository owner); a Claude Code cloud session (Routing17,
`https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`) as worker.\
Native session: not applicable.\
Starting worktree/commit: new `/home/user/sophia-r120-capacity-tie-repair` on new
`refs/heads/inc04-r07-capacity-tie-repair-001` at `90a0af7eb3d4d376e9a0d63c0e05def18ee79b36` (tree `c2c2b887`, 4309
leaves).\
Ending commit/tree and changed files: an UNCOMMITTED candidate tree. Its four paths are:

- `M packages/domain/src/capacity-exposure.ts`;
- `M packages/domain/src/capacity-exposure.test.ts`;
- `A docs/plans/capacity-tie-reconciliation-repair.md`;
- `A` this handoff.

See Evidence.

## Outcome, stated before the change

- **Finding:** Codex review 5920809739, comment 4586355991 (P2). An independent review confirmed it and Root adopted
  it (`22b9ec83`, `6c8bd83c`).
  - `selectTop` treated equal-as-of readings as equivalent on a five-field signature and returned the first
    projection by id.
  - So the canonical `projection` could claim complete coverage, no reasons, no lower bound and a narrower exposure
    interval, while a tied reading lacked them.
- **The repair:** a tie is `known` only when the projections are identical. Every other tie is `tie_bounded`, with every
  projection retained.
- **Expected positives:**
  - the new regressions fail on the old module and pass on the new one;
  - a causal control (old signature only) fails them again;
  - the existing frozen vectors, including `P-TIE-EQUIVALENT`, still pass unchanged;
  - format, lint, typecheck, build and the 8 artifact identities are unchanged.
- **Not claimed:** no live HTTP, admission or financial effect was ever observed. The W1 consumer is not changed or
  exercised here.

## Evidence

Node 24.21.0, pnpm 11.7.0. One frozen install: exit 0, lock `ca833c49` unchanged; the shared store went from 268 to
269 top entries with unchanged bytes. All runs are `node --test packages/domain/src/capacity-exposure.test.ts`.

| Run | Module | Result |
| --- | --- | --- |
| Fail-before | old `64157197` | 124 tests, **5 fail**: the three mixed ties and the two witness checks get `actual: 'known'`, expected `tie_bounded`. 119 pass |
| Fixed | new | 124 / 124 pass, including `P-TIE-EQUIVALENT` and all 64 frozen vectors and five FG witnesses |
| Causal control | final module with only the old five-field signature body | **5 fail**, on the same assertion |
| Restored | final `d0d082fe` | byte-exact; 124 / 124 |

- **Fail-before:** this was the intended semantic failure, not a syntax, import or setup error. The true-equal positive
  and the immutability test passed on the old module too, as expected.
- **First fix iteration:** it used `k as keyof Projection`. Type-aware oxlint refused it (`no-unsafe-type-assertion`,
  exit 1). The final form, `Object.entries(p)` sorted by key, needs no assertion. Lint then exits 0.
- **Repeated control:** the fixed run and the causal control were repeated on that final form.
- **The 5 new regressions** use inline synthetic fixtures:
  - the remaining witness and the consumed witness from the review;
  - a flag-only difference;
  - each over both id assignments and both input orders, asserting `tie_bounded`, conservative bounds and every
    reading's own projection retained;
  - two witness detail checks (the incomplete reading stays incomplete; both exposure intervals and the lower bound are
    kept).
- **Two further tests** pass on both modules: a truly identical tie stays `known` with complete diagnostics, and a tie
  neither mutates its inputs nor returns anything unfrozen.
- **Final checks:** toolchain, Prettier on the four paths, `format:check`, type-aware oxlint, domain typecheck, the full
  pure unit file, build and `pnpm artifacts` with all 8 VERIFY ran once on this exact frozen tree. Their results are in
  this attempt's FINAL-A, not here, because recording them here would change the tree. An earlier run of the same set
  passed everything except that lint finding; it is kept with its outputs.

## Decisions and changes

- **Scope:** the plan explains the choice (`docs/plans/capacity-tie-reconciliation-repair.md`). Only the four leased
  paths change.
- **Not touched:** the frozen fixtures `capacity-exposure.fixtures.json` (`32d52974`), the W1 consumer, Native or Host
  work, SQL, the lock and the runtime identity.

## Remaining obligations

- Whole SOURCE_CORE of this candidate, then commit, ordinary checks and publication, each under its own lease.
- The next coherent integration must exercise W1's handling of a real mixed consumed tie, with the existing Native and
  Host work.
- All GOV, current CI, Luis, RTA and application holds remain.

## Next bounded action

HOLD for the same whole SOURCE_CORE review of the uncommitted tree.
