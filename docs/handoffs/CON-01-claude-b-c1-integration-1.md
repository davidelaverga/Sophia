# CON-01 C1: the saved-conversation checkpoint integrated with current main

Goal and attempt: CON-01 C1 (FND-B1-CON-C1, packet v1), integration attempt 1  
Human owner / executor resource: Davide (product, runtime and spending authority); Luis (Studio integration and merge role). Claude Code worker B on Davide's existing coding account, named combined-source integration writer by coordinator P. No delegation and no other worker.  
Native session: Claude Code session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`, as P recorded it  
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-foundation-b`, branch `foundation/con-c1-20261016`, at the #273 checkpoint `f44133669add06c35af4cbd0bc9b57aaef1cb007` (tree `cdf03e89b29c5b4a815a28c8aac08ddabf7839fa`). The retained Codex author's handover (FND-CON-HANDOVER-01, 16 October) states that this head was clean and that no later private patch or reservation existed. No later private work was supplied, so none was recovered.  
Ending commit/tree and changed files: the merge of main `f6be9fa7cd7b83ca688878390d474f0f2899bf69` into that checkpoint. The exact commit and tree are reported in the PR and in B's handback.

## Outcome

#273's source now sits on current main with its history kept. It is a merge, not a rebase or a reset.

- **Saved, attributed conversations among members.** The project's members can see them; writers write; authors withdraw their own messages and admins erase conversations. Refresh and return work.
- **Ask stays off.** The served capability says `ask: unavailable` (`replies_not_enabled`). The runtime index keeps `replies:null` and launcher run/probe stays at 69.
- **The dormant C2 reply runtime is kept, not deleted.** That covers the reply child/plugin, context, ledger, fences and launcher.

Main's newer Studio behaviour is kept:

- the conversation in the address, `#conversation-<id>`;
- links in messages;
- the next ask's current, fresh and stale-list reading;
- «Earlier messages» staying inactive while the thread is read again;
- the phone's back to the list for a viewer's words;
- the served-views model (`viewsShown`/`shownView`) and every main fixture behaviour.

What this does not establish:

- that C1 has been deployed or app-verified. No hosted migration, flag, grant or signed-in two-account episode has run;
- any real Sophia answer (C2) or Personal adapter.

## Evidence

- The full `pnpm check` exits 0 locally:
  - toolchain, Prettier, type-aware oxlint, build, typecheck and contracts all pass;
  - unit: 2,998 tests, 2,928 pass, 70 existing skips, 0 failures;
  - artifact reproduction passes;
  - integration: 110 tests, 108 pass, 2 existing skips, 0 failures.
- The real-PostgreSQL suites (`test:sql`, `test:db`) **were not run locally**: this machine has no PostgreSQL and no container runtime. They run in the required CI PostgreSQL job on the pushed head. Read that job's result; this handoff does not claim it.
- The conversation browser specs were run locally against the fixture pages (Playwright, desktop and phone projects). The result is in B's handback.
- `pnpm artifacts:record` changed only the bundle identity: archive `c46468ef…d513d2`. The dsh pin, its release integrity and the workspace lock are unchanged.

## Decisions and changes

- **Namespace.** P's FND-P-NAMESPACE-01 revision 2 allocated these numbers:
  - `0048_project_conversations.sql` became `0063_project_conversations.sql`;
  - `0049_conversation_runtime.sql` became `0064_conversation_runtime.sql`;
  - `A16-project-conversations.json` became `A33-project-conversations.json`, with id `A33`;
  - `db/tests/0048_conversations.sql` became `db/tests/0063_conversations.sql`.

  Profile work keeps 0062 and A32 (worker C). Luis's open stack keeps 0058–0061 and A29–A31.

  Inside CON-01 source, comments and test names that named the old numbers now name the new ones. The SQL in the migrations is unchanged except for its comments. The historical `db/candidates/` files and the docs keep their original numbers as history.

  **Correction (FND-B1-REPAIR-01).** The first head, `cc79b739`, said the sealed baseline kept `0063` at its 0048 digest (`e3684304…`). That was wrong. The renumbering changed `0063`'s first comment line from A16 to A33, so its committed bytes hash to `0cda4f52…`. The CON candidate fixture rejected them as baseline drift. On CI PostgreSQL that failed 9 of 153 tests, which V reproduced independently, and the automatic review raised it as finding 4294147743.

  The repair records the actual digest in `packages/persistence/src/conversation-candidate-fixture.ts`. Every other sealed entry, `0053` included, already matched its committed bytes. Checksum enforcement is unchanged, and no applied migration was touched.
- **Applied migrations.** No applied migration was edited. `0053_runtime_outbox_reconcile.sql` is byte-identical on main and on the checkpoint (SHA-256 `bf403b7e…`), so #256's accepted correction is consumed once and is not duplicated.
- **Order checked.** Neither CON migration redefines a function that main's 0046–0057 define. Neither of main's amendments A16–A28 touches a schema that A33 replaces (`RuntimeWorkBinding`, `RuntimeServiceBinding`, `RuntimeCommand`, `RuntimeHelloReply.bindings`, `RuntimeReady.unrecovered`).
- **Generated files** come from one combined source. The OpenAPI, the generated types, the validators and the runtime wire were all produced by `pnpm --filter @sophia/contracts generate`, then `pnpm artifacts:record` was run. None was merged by hand.
- **Studio gating.** `viewsShown(vision, conversations = vision)` and `shownView(view, vision, conversations = vision)` keep main's served-views rule. `VITE_SOPHIA_CONVERSATIONS=1` (app/vision.ts `CONVERSATIONS`) shows Conversations alone; it does not show Updates or Resources. Under the vision flag every view shows, as before. A new route test covers this.
- **Studio conflicts.** These were resolved in nine files:
  - `ConversationsView.tsx` and `OpenConversation.tsx`: CON's reader, fence and withdrawal model, plus main's address, `useThread`/`nextOf`, `LinkedText` and the busy «Earlier»;
  - `next-ask.ts`, `next-ask.test.ts` and `useNextAsk.ts`: main's logic, with the conversation types now taken from the real `api/conversations.ts`;
  - the fixtures (`fixture-api.ts`, `room.tsx`): the union of both sides' switches;
  - `route.ts` and `ProjectShell.tsx`: the gating above.
- **Lint fixes.** `useTranscript`'s feed callback joined its `on` object (max-params). The fixture `messagesRead` split out `unreadable` (complexity). No rule was weakened.

## Remaining obligations

- **#382 (Luis, open; its browser job was failing at packet time)** touches `ConversationsView.tsx`, `OpenConversation.tsx` and `fixtures/room.tsx`. Once its accepted head is on main, B merges main again in the final shared Studio slot. Luis then accepts the shared Studio resolutions. Neither #382 nor Luis's branch was merged or edited here.
- **Still to do before activation:** V's independent source check, the CI PostgreSQL job, Luis's acceptance of the Studio resolutions, and the merge role.
- **Not done:** no hosted migration (0063/0064), no `SOPHIA_CONVERSATIONS`/`VITE_SOPHIA_CONVERSATIONS` flag, no grant and no deployment. Those belong to V's production queue, under its own approval.
- **C2 is still pending.** D-REPLY is decided only as a direction: the source moves to an already allowed, explicitly selected normal dsh service route, with no fallback, and BYO is qualified separately. There is no operational grant. Before any provider call, the C2 route, account, recipient, payer and finite cap manifest goes to V.
- **Unchanged:** the acceptance ledger (18 partial_L1 / 3 passed_L1 / 15 not_run). There is no deployed, app_verified or owner_accepted claim.

## Next bounded action

1. Push this branch.
2. Open a scoped review PR for C1 from it. Main stays the base, and #273 stays the canonical history.
3. Request the automatic review once for the exact head.
4. Hand back to P.

After that, the final Studio slot follows #382's accepted head, and then comes the C2 route manifest for V. No further C1 source changes are planned unless review finds a defect.
