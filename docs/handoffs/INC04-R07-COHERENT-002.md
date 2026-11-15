# INC04-R07-COHERENT-002: local integration of published C7, the C2A repair 412b and the installation fixture 302a

Goal and attempt: INC04 R07 coherent integration, task `INC04-R07-COHERENT-002`, Stage A, attempt 1. This is a new bounded local integration candidate.  
Human owner / executor resource: Davide (owner); Root coordinator; SAME Routing17 Claude Code implementation worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new worker, reviewer, tester or coordinator.  
Native session: none. No native, provider or account session is used.  
Starting worktree/commit: new worktree `/home/user/Sophia-r07-coherent-002`, new branch `inc04-r07-coherent-002`, at published C7 `c7efd878e0d46e3d9ff129782116409bff7e7fd2` (tree `ef3e42e882d669fd7ad967cea7ba3ec0477d6f7d`), with 0 status lines.  
Ending commit/tree and changed files: two normal signed local merge commits, recorded in the external EARLY packet.

## 1. ACK and plan (written before any merge or source change)

**Inputs** (actual Git; accepted components only).

| Input | Commit | Tree | Parents | Notes |
|---|---|---|---|---|
| **C7** (published PR519 head) | `c7efd878` | `ef3e42e8` | [`08475efe`, `a89a67ed`] | SOURCE_FINAL `f6403f63` and CI_FINAL `9803579b` are accepted for C7 only; they do not transfer to a new head |
| **412b** (the actual signed C2A owner-authorized retry) | `412ba2d8166f6470ed516658262ced667e729c2b` | `f05a115b57013a739bb4393cb918cb7f4e8e86fd` | `7998e3a0d37bcfba3ac912648337dcf0529094e0` | LOCAL_PRE `1289518a` / Root `4be8086c`; the retry grant is fulfilled and is not reused here |
| **302a** (the accepted installation fixture) | `302af00b596a5c79a8295c03ce4148dbd954f8ba` | `67765a13f6a0dd35bf72e1109c16544de222fac4` | `c15ec10735e930ec6e63ea7d4251df9e41bdeae5` | LOCAL_PRE `596504d5` / Root `1d91cbd4` |

**How 412b was taken in.** The normal bundle `e1faa79b…` (inside C2A FINAL `874f6586…` → EARLY `67838f84…`), whose only prerequisite is 7998, was fetched into the private ref `refs/r07c2/c2a-412b`. Its tree and its 4,256-leaf `ls-tree -z` inventory (`9275342e…`) equal the accepted component.

**Merge-bases:** C7 with 412b is d3e; C7 with 302a is d3e; 412b with 302a is 7998.

**Scope.**
- **Manually writable: exactly two paths.** `docs/SOURCE_MAP.md` (the overlap resolution) and this NEW handoff.
- **Brought in only by normal Git merges**, with no hand edit: every other change, namely the accepted component bodies (412b's delta from d3e: 25 paths, including its SDK, workspace, profile and runtime identities and the closed A57/0109 consumers; 302a's 3 fixture paths via c15).
- **Unchanged:** no production, runtime, schema, package, lock, GEN, SDK or test rewrite; no record; no C2B source or IDs; no new upstream reliance. Every C7 mode and blob outside the accepted payloads and these two docs is kept.

**SOURCE_MAP.** Base `cfa715c3` (d3e), C2A `4270790c` (412b, and 7998/302a), C7 `06bfeff0`. Both insert before §3. The resolution keeps C2A **§2s** (its 2 source IDs) **then** C7 **§2t** (its 6 F2T IDs), in order, with every earlier row and limitation. Neither side is chosen globally.

**Order.**
1. Merge 412b into C7, resolve the Map, ONE normal signed merge commit.
2. Merge 302a, finalise this handoff, ONE normal signed merge commit.

No reset, amend, rebase, force, commit-tree or cherry-pick. **If automatic review denies a commit:** STOP with the exact reason, tree and parents; no retry or bypass. **Another conflict, or a real incongruence:** seal a finding and HOLD.

**Stage A checks** (run after the merges, on the frozen candidate):
- Node 24.21.0, pnpm 11.7.0, a frozen offline install, umask 0022;
- `prettier` on the two owned docs;
- `contracts:check`;
- `pnpm artifacts`, verify only, 8 identities, no record;
- the normal complete `test:sql` and `test:db`, ONCE each, against a NEW own PostgreSQL 16 on 127.0.0.1:55561, after a fail-closed census, with credentials only in the child environment.

Then an authenticated census, the correct-identity canary first, the wrong-identity canaries, and a guarded normal stop of only that cluster. The results go in the external packets; this handoff is not edited after the final merge.

**Runtime unit:** `sophia-runtime-wbc02-dev` at C7. Any change from 412b's accepted `config/runtime-unit.json` comes in through the merge, not by hand.

**Stop and holds.**
- **Not in Stage A:** no ordinary, PRE, push, publication, PR metadata, comment, bot, CI, main merge, deploy, configuration, migration, secret, flag, account, provider, native or voice effect.
- **Owner holds:** Personal9e stays unjoined and owner-held. Old C2A full-DB negatives stay negative until this composition's own checks.
- **Still open:** GOV introduced-commit coverage, Luis integration and merge, RTA (96b91), the four native owner/account pairs, deployed authorization and the app, and full R07 / C2B–C6.
- **Product holds:** 8c stays default-off with its verification erratum; 9ed keeps its explicit cancellation.
- **SEC null** is information only.
