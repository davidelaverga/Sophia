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

## Saved-text policy accepted for the test cohort (2026-10-12, decision 8)

This section and the two after it are current at 2026-10-12. The sections after those still describe 2026-10-10.

**What is settled.** Davide answered: "Accept this policy for the test cohort". This is decision 8 in [`OWNER_DECISIONS_20261012.md`](https://github.com/davidelaverga/Sophia/blob/74826cb9e9c22b8d446390f7fb80bc5f31d4513d/docs/coordination/CON-01/OWNER_DECISIONS_20261012.md), recorded by Codex's CX-0174 at `74826cb9`, with #198 comment 6119717658 updated. It settles D-1, D-3 and Q-1 for the initial synthetic test cohort, under `conversation-text-v1`:
- submitted titles, messages and published Sophia replies are visible to current project members;
- they are kept for the project's life until withdrawn or erased, and stricter organization rules win;
- authors withdraw their own messages; admins remove messages and erase whole conversations; editors write but can't erase other people's content;
- drafts stay in browser memory;
- backup and provider deletion limits are disclosed.

D-9's conservative rule stays binding: later Sophia answers in the same conversation go, every other human message, conversation and independent decision stays, and nothing is regenerated automatically. The decision is recorded in [BINDING_MAP](../coordination/CON-01/BINDING_MAP.md) §5, §13 and §14. It is not reasked.

**What the current contract already matches** (read on this ref, on #199's `d527f385` and on Luis's `d96626ac`):
- members-only reads, and project-lifetime retention (A16's `audience: project_members`, `retention: until_withdrawn_or_erased`);
- author-or-admin withdrawal (0048:354-356) and admin-only erasure (0048:380). Editors can't remove anyone else's content;
- drafts in memory only: no `localStorage`, `sessionStorage` or IndexedDB in the conversations code at either pin;
- the server's withdrawal reach. 0048:246-249 removes every Sophia answer in the same conversation from the withdrawn message on, whether or not it used it, and touches nothing else; S1 keeps that rule;
- the erase confirmation, which claims nothing beyond the app.

**Remaining discrepancies, each with its owned correction location:**
1. **The served notice omits what decision 8 requires.** `CONVERSATION_NOTICE` (`packages/persistence/src/conversations.ts:29-30`, served as A16's `policy.notice` and shown again in the context's help) says only "Messages here are saved for this project and can be read by its members. Live room audio is not saved here."
   - It doesn't state the retention, the controls, the backup retention or that a delivered copy can't be made unseen. BINDING_MAP §5 now lists what it must say.
   - The fixture copy, `apps/studio/fixtures/conversation-wire.ts:94-95`, mirrors it. No test pins the text.
   - Both files are CON's. Their correction is one CON source pin, made only within CON's permitted scope and reviewed. It isn't made here, and no window is opened.
   - The provider part names its recipient only once D-4's route is bound, before Ask is activated. Ask is off, so nothing is sent to a provider today.
2. **The withdrawal confirmation still says "Sophia's answers that read it"** (`apps/studio/src/features/conversations/WithdrawHere.tsx:175`, at both pins). It should state D-9's conservative rule.
   - The reviewed correction is `635a3ef2`, CON's correction 4.
   - It waits on Luis's Studio handback, so there are no concurrent Studio edits.
3. **No correction, recorded only:** mission pack 03 §3's "editors/admins may moderate" is a frozen, hash-pinned input. Decision 8 supersedes it, and the pack isn't edited.

**Not changed:** the reservation request stays byte-identical to revision 10 (`90ea5a52…`). There is no deployment, migration, configuration, account, grant or spend approval. `conversation_settings.approval_ref` is set only by an approved operation (OP-0002-r6 is `draft_not_authorized`). Ask stays off.

## G2 Phase B reservation request: reviewed at revision 10 (2026-10-12, CX-0169)

This section records review outcomes only. The request's bytes are not changed by it, and no revision 11 is made for bookkeeping.

**The reviewed pin:** [`G2_SHARED_RESERVATION_REQUEST.md`](../coordination/CON-01/G2_SHARED_RESERVATION_REQUEST.md), revision 10.
- Commit `91110fdda17dab26b8b7b1a6f1026060d888fa7c`, tree `f2dd38e07fe672592b59987dd8dabfa68c97955b`.
- Document SHA-256 `90ea5a52a1a292deb847d55d329d4fcd131538d4a0125507837b96d0f84973df`, 953 lines.
- Its receipt is CC-0187 (#198 comment 6121167710).

**Accepted, each within its own scope** (Codex's [CX-0169](https://github.com/davidelaverga/Sophia/blob/247de63ef6b9d9a0b9111fdae1883491e8cd4778/docs/coordination/CON-01/CX-0169.md) at reviewer `247de63e`; #198 comment 6119717658, rewritten as the consolidated CX-0169 packet):
- **Root review:** PB9-A3-FALLBACK-TERMINAL-WRITER is addressed at proposal scope, and there is no new blocking finding.
  - Raw bytes unchanged from revision 9: A-1/A-2 (`8195bd82…`, by Codex's boundary), §3.1(b) (`43d026b4…`) and §3.2/§3.3 (`66362753…`).
  - It is not an executable-source, SQL, process, provider or product acceptance.
- **K-1c, supplied for exact revision 10 only:** `BOUNDED_AFFECTED_CONSUMER_COMPATIBILITY_ACK_EXACT_PHASE_B_R10_K1C_ONLY_NO_WRITE_GO`, with no findings and no qualification gaps.
  - The joint consumer's turn was `01a12f5f-e587-7d22-9fb8-01d04f489ae1`.
  - Original record SHA-256 `2b993015c112a030…`. The safe record [`joint-r10-review.safe.json`](https://github.com/davidelaverga/Sophia/blob/247de63ef6b9d9a0b9111fdae1883491e8cd4778/docs/coordination/CON-01/evidence/20261012-cx169-r10/joint-r10-review.safe.json) has SHA-256 `91bc40cc1bb6d0af…`, re-hashed here.
  - Codex verified 67/67 Git inputs, 67/67 extracted copies and 5/5 supporting evidence hashes.
  - It is a consumer compatibility ACK. It is not K-1b, and not a write GO. The exact-revision-9 changes-required record stays as history.
- **K-2d, supplied for exact revision 10 within the owner's remit:** [#198 comment 6121233960](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6121233960), from the retained WBC-02/SDD-01 owner `session_0155SjcXhv87RErnWEBWxfBM`, with no new condition.
  - The owner's safe record is `actual-owner-r10.safe.json` at `247de63e` (SHA-256 `90b7a816…`, computed here).
  - The remit is the owner's three bodies (`dispatch_runtime_outbox`, `capture_native_result`, `native_delivery_ineligible`), the helpers and dispatch.
  - D1 to D5, C1 to C4 and N1 stand, as §3.1 writes them, to be proved by §3.1(b)'s preservation test.
  - The owner excludes A-3's own-state conditions, the choice to refuse, and the `55000` name. Those are CON's, K-1b's and S1-05A/BASE's.
  - The owner attests no source write in flight and an unchanged freeze, and appoints no substitute. The owner's revision 9 disposition is 6121108035.
- **K-3:** not extended. §3.2 and §3.3 are byte-identical to revision 5's, and K-3 still covers only the overlap and the order.

**Optional notes, not conditions.** None is acted on, and none starts a new revision:
- **The retry wording.** Revision 10 says "D1's lease-expiry step, then 0053's reconcile". On observed `main`, the step that moves a refused row is the worker's own pass:
  - the worker counts the raise as `lost` and never resends that row (`apps/worker/src/runtime-dispatch.ts:53-57`);
  - its per-pass `expire_dispatch_leases` (`:42`; 0004:19-23) moves the row to `outcome_unknown`;
  - reconcile then maps the row by its runtime-command evidence. With no command for that row, it returns to `pending` and is claimed again, and the dispatch refuses again: one refused dispatch per lease period, with `attempts` growing and no other row changed. A seeded case with a command for that row need not return to A-3 at all.
  - **No automatic retry, liveness, repair or cleanup is claimed.**
- **The owner's revision 9 P3 notes** stay optional.

**The outstanding boundary.** Nothing in Phase B is written until each of these is recorded:
1. **K-1b:** the retained core and runtime owners, for §2's B-1 to B-6 and addenda A-1, A-2 and A-3. That includes A-3's own-state conditions, its refusal and its error name (S1-05A/BASE).
2. **K-2a, K-2b and K-2c:**
   - S1-02 (Luis): §3.1(a), and B-2's `commands` and `outbox` rows and keys;
   - S1-05A/BASE (Davide/Luis): the 0012-foundation rows, the five entry points and their ACL, the settle recovery, `runtime_commands.kind`, B-3's cursor, A04 and the route registration;
   - the current SMC-M03 implementer: `runtime_hello` and `runtime_record_observations`.
3. **K-4:** Luis's accepted base, an exact commit and tree including the accepted Phase A (#256, a draft at `93e9313d`) and G1, or a named composition.
4. **Luis's Studio handback:** the seven shared paths and the contracts (next section). His prepared `d96626ac` is evidence, not a transfer.
5. **K-5, Codex's:** the fresh census, the atomic number and path reservation, and the sole writer, start, expiry and return.

Until then: no executable Phase B source, SQL or test, no shared window, and no new source or owner authority is inferred. No merge, deployment, hosted migration or configuration, account, grant, provider call, authentication change or spend. Ask stays off, and OP-0002-r6 and OP-0001-r4 stay unapproved drafts.

## Studio reconciliation at Luis's `d96626ac` (2026-10-12, CX-0165)

This section is current at 2026-10-12. The sections after it still describe 2026-10-10. G2's state since then is in the section above. Nothing here widens an earlier acknowledgement.

These facts are source-only. Their sources:
- Codex's [CX-0165](https://github.com/davidelaverga/Sophia/blob/f95c32d0fe19f28112a02c183656f12e82fbc3c3/docs/coordination/CON-01/CX-0165.md), at reviewer `f95c32d0fe19f28112a02c183656f12e82fbc3c3`;
- the [reconciliation on #199](https://github.com/davidelaverga/Sophia/pull/199#issuecomment-6116157885) (6116157885, as updated at 08:15Z) and the [mission record on #198](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6119717658) (6119717658);
- EdX2C's [integration update](https://github.com/davidelaverga/Sophia/pull/199#issuecomment-6120119263) (6120119263).

**What Luis prepared**
- `ui/kit-with-con01` is at `d96626acdc514eabbdf20667725e28a2279dfeba` (tree `ee484c024b79e952e3d6f44ec979102fda0ee3f8`). It adds the intelligence PRs #262–#268 to the prior `e160c5b7`: 54 files, +2437/−92.
- It is integration evidence only. It isn't the accepted combined base or the handback, and it implies no merge permission or shared-file transfer.
- `main` stays at `3c40b1c6`, and PR #199 stays a conflicting draft at `d527f385`.
- The `e160c5b7`→`d96626ac` delta changes only `apps/studio`, `packages/ui` and docs. It changes no API, generated-contract, database or runtime path.
- It touches five of the shared Studio paths (my read of the file list):
  - `ConversationComposer.tsx` (+128/−25), `ConversationsView.tsx` (+59/−13) and `NewConversation.tsx` (+27/−3), the three that needed real conflict resolutions;
  - `OpenConversation.tsx` (+1: the composer's `next` prop) and `conversations.css` (+22: the quick-ask row's minimum height and the new "Already asked here" line, `.conv-same`).
  - `ConversationRows.tsx` and `ProjectShell.tsx` are unchanged in it.

**Luis's resolutions, to preserve**
- The real API imports (`api/conversations.ts`), the saved-text notice and the disabled-answer line ("Sophia doesn't answer here yet").
- The Composer's guards: its suggestions and question shortcut stay quiet where answers are unavailable or a send is held or busy. This is source evidence only, because the existing fixture always advertises an available Ask.
- The View's reader, fence, erased note and `Middle` pane; arrivals that wait for the membership; `openOne` clearing the erased note; the original open semantics plus arrival focus.
- NewConversation's matching against the visible conversation list for "Already asked here".
- The null-text guard: withdrawn messages stay out of asked history and message acts.
- The original acts-row quote/propose/withdraw union, tombstones and coarse-pointer rules, and ProjectShell's `CONVERSATIONS` flag with the current membership.

**CON's four remaining corrections, mine only after the explicit handback**
1. Kit confirmation controls in `WithdrawHere` and `EraseHere`, keeping focus, Escape, Keep, busy and the original retry semantics.
2. Remove/Removing used consistently for the moderator's pending and unknown states, with the uncertain-retry words.
3. Distinct summary and question coverage, without merging unequal ranges, states or privacy.
4. `635a3ef2`'s reviewed conservative disclosure. `d96626ac` still says "answers that read it" (`WithdrawHere.tsx:175`). The settled policy:
   - removes later same-conversation Sophia answers, even unused ones;
   - preserves other human messages, other conversations and independently governed decisions;
   - never regenerates automatically.

**Review debt in Luis's lane, before the handback**
- Four PR #262 P2s, confirmed in `d96626ac`'s source:
  - [r4245177559](https://github.com/davidelaverga/Sophia/pull/262#discussion_r4245177559): dismissed asks return as quick actions, because `quickAsks` gets the asked history and the current suggestion but not what was put away. Reproducer: dismiss a quick-ask suggestion.
  - [r4245697647](https://github.com/davidelaverga/Sophia/pull/262#discussion_r4245697647): the dismissal maps are keyed by conversation only, so another account signed in on the same page inherits them. Scope them to the trusted account, never a display name or email. Reproducer: switch account on the same page and conversation.
  - [r4245697636](https://github.com/davidelaverga/Sophia/pull/262#discussion_r4245697636): the rationale is only in an `aria-hidden` tip. Associate it with keyboard and assistive-technology focus. Reproducer: focus the composer by keyboard or AT.
  - [r4245177568](https://github.com/davidelaverga/Sophia/pull/262#discussion_r4245177568): recency comes only from the loaded message pages, so "the last six viewer messages" depends on opening older history. Reproducer: open older history after an earlier viewer ask.
- PR #266 r4245693025 (long matched-title wrapping) and PR #267 r4245691964 (reused-form focus) still need the UI owner's correction and an adverse browser check. The matched-title control is the unbounded `inline-flex` `.conv-same .text-button`, in `conversations.css`, one of the shared paths.
- The other #263, #264 and #268 findings stay with their owners. There is no blanket kit clearance.
- `useAskSophia` (`features/studio/project-go.tsx:33`) gates on `VISION`. So a real CON-only build (`CONVERSATIONS` on, `VISION` off) has no ask-instead affordance. Align it with the real Conversations surface if it ships there; never enable unrelated vision proposals to expose it. No Ask, runtime or provider permission is implied.

**Codex's independent checks at `d96626ac`, bounded**
- Node 24.21.0 and pnpm 11.7.0. The focused next-ask, new-conversation and next-ask-key unit tests pass 23/23, and all five contract generators match.
- In the in-app browser, on the synthetic fixture with no API call:
  - desktop: "Sum it up" gets its synthetic reply in the same thread, and Tab accepts the next ask, selects Ask Sophia and keeps focus;
  - phone: the saved-text notice (12px, third ink) sits inside the viewport;
  - "Already asked here" opens the existing conversation and focuses its heading.
- Not qualified: combined G3 or G4, live Ask, a real provider or native answer, a disabled-capability fixture, the long-title and reused-form adverse passes, phone late-erasure, touch and clipboard, and two real signed-in accounts.

**The hold I keep**
- The shared handback boundary is now seven Studio paths plus the contracts:
  - the original four: `ConversationRows.tsx`, `OpenConversation.tsx`, `conversations.css`, `ProjectShell.tsx`;
  - newly shared: `ConversationComposer.tsx`, `ConversationsView.tsx`, `NewConversation.tsx`;
  - A15 and A16, regenerated together.
- I write none of them before Luis's explicit handback. It has to name the exact accepted combined base, the authoritative branch or PR, the sole writer, the order and the return boundary.
- The order:
  1. Luis's relevant kit corrections and their landing review;
  2. Luis's exact accepted combined base, with A15 and A16 regenerated together;
  3. that explicit handback;
  4. CON's four corrections, as one correction pin;
  5. Codex's independent checks of the affected combined browser, contract and current-`main` crossings.
- No reviewer feature fix, new writer window or new session comes with this, and I don't duplicate Luis's work.
- No shared UI or runtime edit, merge, CI rerun, deployment, grant, account, provider execution or spend. Ask stays off. OP-0002-r6 and OP-0001-r4 stay unapproved drafts. Davide keeps final product acceptance.

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
- **Owner decisions open** (as of 2026-10-10; D-1, D-3 and Q-1 have since been settled for the test cohort by decision 8, in the section at the top):
  - D-1 … D-5, and D-4 not yet askable (no supported route);
  - D-7, the test project's second actual account (Codex's setup draft prepared; the mailbox, roles and subjects unbound).
  - D-6 and B-1 are accepted as source design only. No cohort, policy, allowance or batch is approved.
- **Shared-window acknowledgment:** #190's owner (#190 at `8a39b07`; Codex refreshed the request in `6096401122`) and the WBC-02/SDD-01 runtime owner, before any shared runtime write. Neither is inferred.
- **Integration with `main`:** `444235d` (#204–#208). Codex's read-only `git merge-tree` of `444235d` with `d92328d` succeeds (tree `e497aaee`) with no overlap in conversation source. That is a mechanical proof only: nothing is merged, and no G4 approval is implied.

## Next bounded action

1. Codex rechecks `5c4f1c0` (r4237222580) at its immutable commit.
2. Integrating `main` `444235d` must keep #204's fixture changes (`fixture-api.ts` and `room.tsx`: `coversHeld`, `hold=covers`, `releaseCovers`, staggered version reads) and #205–#208 beside CON-01's. That happens only when no browser run of mine is active.
3. G2's source starts only after the shared-window acknowledgments and a named `main` window, against the stub provider. No route is activated.
