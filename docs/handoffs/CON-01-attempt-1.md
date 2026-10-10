# Implementation-session handoff

Goal and attempt: CON-01, saved project conversations ([mission pack](../missions/2026-10-09-con01-conversations/README.md)), attempt 1

Human owner / executor resource:
- Davide (product, the saved-text policy, spend, merge, release).
- Implementer: Claude Code, cloud session `session_01KUDtFK9gWthsXSrepcLQz3`.
- Reviewer and operator: Codex, session `01a1224a-32b4-7222-a017-50a277572d95`.
- Luis owns the Studio's design and shared shell.

Native session: `session_01KUDtFK9gWthsXSrepcLQz3` (Claude Code on the web, a cloud container)

Starting worktree/commit:
- `/home/user/Sophia`, branch `claude/con01-project-conversations`, from `main` `4f7470c3ab7c158315934a11c8c620da663f4898`.
- `main` was merged at `8f5cbea` (`71dbea3e`), `7660c73` (`6744e78`), `5c3866a` (`6ef8d855`) and `7e21538` (`3e6d57b`, #203).

Ending commit/tree and changed files:
- The last gated source: `1f49c4fd38bfdff54a4b3097b3e731ff3d0ef7ec` (tree `cea781c2a1fa7f4fe339e4b7f74f83fb29cb97fc`), with its receipts at `715d2b1a1c677c46a9b168c30475c32d0a5f00bc` (tree `6053d6b5cf754d6709c8d1cab3168d6555155d74`).
- After it:
  - this handoff's first draft (`7d87dbdd`);
  - `f12786aa`, the interim `ConversationOpening.seq` alone, reverted at `69b0f586` because it did not block CX-0027;
  - `7969d40a`: the CON-01-CC-0023 correction, `messageSeq` with `lastMessage.seq` (CON-01-CC-0024);
  - `74a697b717ca48aa41511f3c3fd3276676e6bc17` (tree `f82d631e9b67d78484e2b8ddbd4f0a44b9ee8dbf`), CON-01-CC-0025. It closes three findings: Codex's CX-0028 P1 (a late list answer restored withdrawn words), its stale-notice P2, and the fallback-ordering P2. This is the source under its gate;
  - `4252cd74bca0ed18bc190d8832e98c75a920c7bf` (tree `9afcad10deb23f3f714bdeea09ad4df596f85d09`), CON-01-CC-0026. A late list snapshot no longer names a withdrawn writer or Sophia's part (bot P1 r4236040713). This is the source under its gate;
  - `5c4f1c0c364158192cdaada9e4c8b59cfd903b16` (tree `7538608d142be778e5c94840407b1ab49cd1a074`), CON-01-CC-0032: a withdrawal leaves no question projection standing (bot P2 r4237222580). This is the latest source ([receipt](../coordination/CON-01/receipts/5c4f1c0-checks.md)); no gate has run on it;
  - the binding's revisions 7 and 8 (`3c1158d`, `7abe81d`, `d92328d`, `7435627`), the receipts and this revision of the handoff, documentation only.
- 93 files differ from `main`: `db/migrations/0048_project_conversations.sql`, A16, the persistence and API conversation routes, the Studio's `features/conversations/`, its fixtures and specs, and the coordination records under [docs/coordination/CON-01](../coordination/CON-01/README.md).
- Draft PR [#199](https://github.com/davidelaverga/Sophia/pull/199); coordination issue [#198](https://github.com/davidelaverga/Sophia/issues/198).

## Outcome

**What works locally (L1: the real API, PostgreSQL 16 and the Studio; no provider)**
- Named project conversations with durable human messages. The first message is atomic, admission is idempotent (one key per intent), authorship comes from the server actor, and paging is stable (G1).
- Ask Sophia on or off: off records no inference or operational work.
- The saved-text notice; withdrawal and an admin's removal; an admin's whole-conversation erasure. Erasure is still subject to Davide's D-3.
- Erasure clears what the Studio keeps for that conversation (its draft, its held messages, its proposals' words) and its cached derivatives. This holds for an erasure by another client and for a list capped at the newest 200, and the cleared state is never revived by a late answer.
- Coverage words in summaries and context; drafts, retries under the same key, and return behaviour.
- A08 proposal and decision controls are kept as `main` owns them (#200, #203).
- Codex's rechecks on the actual local app:
  - CX-0019, CX-0021 and CX-0023 passed, each bounded to what it ran.
  - **CX-0025 failed** at `653fe9a`: StrictMode's second mount left the direct reads closed, so a capped list's erasure was never proved. It was corrected at `1f49c4f`.
  - CX-0026 passed, bounded: the capped crossing at `715d2b1`.
  - **CX-0027 is a P1 failure reproduced at `715d2b1`:** a list read after a withdrawal had its row overwritten by a delayed Send success while the thread's reads failed. CON-01-CC-0023 corrected it, and **Codex's CX-0028 passed** that crossing, bounded, at `7969d40`.
  - **CX-0028 found a new P1 failure at `7969d40`** on the actual app: a list GET that set out before a withdrawal answered after the thread's tombstone and said the words again. It also found two P2s: a thread's Try again cleared the failing list's notice, and the fallback ordering went back on receipts 3 then 2. CON-01-CC-0025 and CC-0026 are the corrections.
  - **Codex's browser rechecks at `b9815b1` passed** (CX-0029/CX-0030): the late send; the message-only retry keeping the list's notice; and the late list keeping the withdrawn words off, with the sole admin contributor absent and the eligible editor kept. A fresh read recovered the eligible preview. Bounded to what it ran.
  - **The bot's P2 r4237222580** (question projection after a withdrawal) was reproduced by Codex at `4252cd7`, L0. The correction at `5c4f1c0` awaits Codex's recheck.

**Not built**
- G2, the read-only native reply. **Davide accepted D-6 (option C) and B-1 (a throwaway harness home per reply) on 2026-10-10, as source design only**; OP-0001-r2 stays `draft_not_authorized`.
  - The binding is at revision 8. Codex judges it suitable for owner-coordinated implementation (CX-0030), which is not a G2 qualification.
  - It binds a reply child per reply with OS-enforced containment, an execution claim as the replay fence, crash recovery from the contained journal behind a full acknowledgment barrier, and a pidfd-signalled, identity-bound restart sweep.
  - **No reply route is bound.** The vendors' documentation rules out the pinned runtime using Davide's Claude subscription, and the hosted route through ChatGPT sign-in is unverified. There is no API or pay-as-you-go fallback (BINDING_MAP §8.4).
  - G2 still needs the shared-window acknowledgments from #190's owner and the runtime owner, and a named `main` window.
- Projections generated by G2, the quick asks' real answers, and `contextChanged` need G2.

**Failed or unverified**
- No head has a passing full Studio browser gate.
  - `447e7ae`'s scoped gate failed: 2 of 1131.
  - `82f812d`'s full run is invalid: its source was edited under it.
  - `a3422f4`'s full run failed: 4 of 1150, none in conversation specs; three reproduce on unchanged `main` here ([receipt](../coordination/CON-01/receipts/a3422f4-browser-gate.md)).
  - `715d2b1`'s full run failed: 3 of 1154, none in conversation specs. They are the same three that reproduce on unchanged `main` ([receipt](../coordination/CON-01/receipts/715d2b1-browser-gate.md)). Its focused gate passed (154).
  - `74a697b`'s full run failed: 2 of 1160, none in conversation specs ([receipt](../coordination/CON-01/receipts/74a697b-browser-gate.md)). Its focused gate passed (160).
  - `4252cd7`'s full run failed: 2 of 1160, none in conversation specs. `personal:382` also fails 1 of 3 alone on unchanged `main` `31dd587`; the other failure is C9 ([receipt](../coordination/CON-01/receipts/4252cd7-browser-gate.md)). Its focused gate passed (160).
  - `5c4f1c0`: no gate. A development run of the focused set passed (160).
  - GitHub Actions' `ci` workflow (every Studio spec included) succeeded on `715d2b1`, `f12786a`, `7969d40` and `74a697b`. That is another environment, and it is no local gate.
- **`pnpm check` passed at `4252cd7`** (not rerun at `5c4f1c0`, which changes two Studio files): exit 0, with its own skips (LiveKit, log-compat, and three crossings without a database).
  - With the disposable PostgreSQL set, `pnpm test:integration` passed (99 of 101, 2 skipped: log-compat).
  - So did every `*.db.test.ts` (627/627) and `pnpm test:sql` (46 migrations, 5 SQL test files).
  - Before that, `pnpm check` had last run in full at `a7cc081` (G1).
- PR #199 threads r4235629903, r4235862543, r4235976251, r4235976256, r4235976261, r4236040713 and r4237222580 are open until Codex reruns the affected evidence.
  - Their corrections are at `74a697b`, `4252cd7` ([fail-before](../coordination/CON-01/receipts/4252cd7-fail-before.md)) and `5c4f1c0`.
  - A residual is stated in BINDING_MAP §11.1: on its first read of a thread, a list read in flight may lose a writer whose words are only on pages not read here, until the list is read again.
  - The fail-before runs, on desktop, are in the [receipt](../coordination/CON-01/receipts/74a697b-fail-before.md).
- The cache purge rests on preconditions, not on proof of erasure everywhere. A thread read stays cached for 5 minutes against a list read's 30 s, and teardown on erasure or on an identity change takes both together. Only this Studio's query cache is covered ([BINDING_MAP §11.1](../coordination/CON-01/BINDING_MAP.md)).
- Whether any older CON-01 reader is enabled anywhere is UNVERIFIED. Such a reader rejects the new fields, so the Studio ships with or before the API ([BINDING_MAP §11.1](../coordination/CON-01/BINDING_MAP.md)).
- A30 (two hosted accounts, a native or provider answer) was not run.

## Evidence

- Gate receipts:
  - [447e7ae](../coordination/CON-01/receipts/447e7ae-scoped-gate.md)
  - [a3422f4](../coordination/CON-01/receipts/a3422f4-browser-gate.md)
  - [fail-before runs](../coordination/CON-01/receipts/fail-before-89eb-d130-653f.md)
  - [715d2b1](../coordination/CON-01/receipts/715d2b1-browser-gate.md)
  - [fail-before for CC-0024 and CC-0025](../coordination/CON-01/receipts/74a697b-fail-before.md)
  - [74a697b](../coordination/CON-01/receipts/74a697b-browser-gate.md), [4252cd7](../coordination/CON-01/receipts/4252cd7-browser-gate.md), [fail-before for CC-0026](../coordination/CON-01/receipts/4252cd7-fail-before.md), [5c4f1c0](../coordination/CON-01/receipts/5c4f1c0-checks.md)
- The full ordinary gate at `a7cc081` (G1), in [docs/progress/CON-01.md](../progress/CON-01.md).
- Every correction since G3 was published as its own source candidate on #198 (CC-0003 … CC-0020), with each check's exit from the shell. Codex's independent records are its CX messages there.
- Raw logs and traces stayed in the implementer's container. They are named in each receipt and were not copied.

## Decisions and changes

- **Option C for G2** (D-6, accepted as source design): reply-first branches with fail-closed guards; six functions are named for 0049. These are bound in [BINDING_MAP.md](../coordination/CON-01/BINDING_MAP.md) and not implemented.
- **B-1, the attempt home** (accepted as source design): BINDING_MAP §8.5, revision 8. Each of Codex's qualifications has its own mechanism and test.
- **The subscription direction:** BINDING_MAP §8.4 and §8.6.
  - The Claude subscription can't be used by the pinned runtime, per Anthropic's documentation.
  - ChatGPT sign-in is documented for user-operated open-source local and self-hosted VMs; a paid or remote service goes through OpenAI's partner process; today's hosted route is unbound.
  - The owner-native Claude Code and Codex connection is recorded as a dependency on `11_OMNIGENT_BINDINGS.md` and its SCM owners. CON-01 doesn't build it, and it is not CON-01's reply route.
- **A08:** CON-01's own receipt rewrite (`88ee51e`) was reverted in favour of `main` #203, whose proposal files are byte for byte `main`'s.
- **Erasure is settled only by proof:** its own receipt, a complete list read, or the API's 422 `not_found` on a direct read of a conversation a capped list left out (`probes.ts`: bounded, with deadlines, timer-driven). A capped omission alone proves nothing.
- **A row's order is its place, not its time** (CON-01-CC-0023):
  - `messageSeq` is the highest place taken, withdrawn messages included, and `lastMessage.seq` is the opening's own place.
  - A receipt goes on the row only below its watermark. The tombstone cleanup is exact, and limited to the conversation's own row in this account's list for this project.
  - `lastAt` is the fallback for an API that says no order. There, equal times keep the row.
  - The five invariants are in [BINDING_MAP §11.1](../coordination/CON-01/BINDING_MAP.md).
- **Withdrawn words leave the cached list reads, not only the screen** (CON-01-CC-0025, `withdrawn-purge.ts`):
  - A listener lives as long as the cache and runs on every list or thread update, reverting cancels included.
  - It replaces only the list read's data, so a failing list read still says so.
- **No new authority was used.** No hosted read or write, migration applied anywhere but local disposable PostgreSQL, deployment, provider call or spend.

## Remaining obligations

- **No head has a passing full Studio browser gate in this container.** Each full run since `a3422f4` failed on specs that also fail, or fail alone, on unchanged `main` here. Whether CON-01's full gate can pass needs another environment, or those `main` failures fixed. GitHub Actions' `ci` passes the same suite on every head since `715d2b1`.
- **`pnpm check`** at `5c4f1c0` is not yet run (it passed at `4252cd7`).
- **Local resources to clean up:** the PostgreSQL 16 cluster `/var/lib/postgresql/con01` (port 55432), and the worktrees `/home/user/sophia-g1-check`, `/home/user/sophia-g3-erase` and `/home/user/sophia-dev`. None holds anything hosted.
- **Open PR threads:** every PR #199 thread stays unresolved until Codex reruns the affected evidence.
- **Owner decisions open:**
  - D-1 … D-5, and D-4 not yet askable (no supported route);
  - D-7, the test project's second actual account (Codex's setup draft prepared; the mailbox, roles and subjects unbound).
  - D-6 and B-1 are accepted as source design only. No cohort, policy, allowance or batch is approved.
- **Shared-window acknowledgment:** #190's owner (#190 at `8a39b07`; Codex refreshed the request in `6096401122`) and the WBC-02/SDD-01 runtime owner, before any shared runtime write. Neither is inferred.
- **Integration with `main`:** `444235d` (#204–#208). Codex's read-only `git merge-tree` of `444235d` with `d92328d` succeeds (tree `e497aaee`) with no overlap in conversation source. That is a mechanical proof only: nothing is merged, and no G4 approval is implied.

## Next bounded action

1. Codex rechecks `5c4f1c0` (r4237222580) at its immutable commit.
2. Integrating `main` `444235d` must keep #204's fixture changes (`fixture-api.ts` and `room.tsx`: `coversHeld`, `hold=covers`, `releaseCovers`, staggered version reads) and #205–#208 beside CON-01's. That happens only when no browser run of mine is active.
3. G2's source starts only after the shared-window acknowledgments and a named `main` window, against the stub provider. No route is activated.
