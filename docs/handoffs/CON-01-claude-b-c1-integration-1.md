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

  **Second repair (CI on `7520df7a`).** With the digest fixed, CI's PostgreSQL job reached the candidate suites, and 65 of 949 tests failed. All were in `conversation-assembly.db.test.ts` (22) and `conversation-fences.db.test.ts` (43). The sealed baseline still held only the checkpoint's subset: 0001–0045, then `0053` and `0063`. Main's persistence code, which those suites call through `readMissionContext`, reads columns that only main's 0046–0057 add, so the database answered `42703`. One example is `decisions.proposed_by_name`, from 0049. The assembler then reported `retry` where `recorded` was expected.

  The baseline now seals main's accepted-source migrations 0046–0057 in migration order, each at main's own bytes. These are source files, not a claim about production: the live ledger is at 51, and 0051/0052/0054–0057 were pending at V's census. That makes the baseline every accepted source migration through 0057, with `0053` once, then `0063`: the real source order before `0064`'s runtime promotion. The fixture still verifies every entry before it creates a database. No migration file changed.
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

## Shared integration slice (FND-B1-SHARED-INTEGRATION, packet v1)

- **C's profile API is in.** C's exact API head `0a21925e` (#386) is merged into this candidate. It carries Luis's open stack (0058–0061, A29–A31) and C's 0062/A32.
  - Every number is kept: B's 0063/0064/A33 included.
  - Contracts were regenerated once from the combined source, and artifact identities reproduce unchanged.
  - The candidate fixture now seals every source migration before 0063 (0001–0062, `0053` once), because CON's readers now call 0062's `actor_label`.
- **Names.** CON readers name members through `actor_label` for messages, contributors and the last message. A withdrawn message names nobody. CON writers keep `nameActor`'s display name, never the raw token name. An address is therefore never served as a name, legacy rows included.
  - New real-PostgreSQL regressions are in `packages/persistence/src/conversations.db.test.ts` and `apps/api/src/conversations.db.test.ts`.
  - The dormant C2 context still quotes raw `author_name`: 0064's compiler and `conversation-assembly.ts`'s renderer, which must change together. That remains a gate before any C2 provider call.
- **Ask off.** The New conversation form says «Sophia doesn't answer here yet: the question goes to the team.» while «Ask Sophia» is checked and the list's capability says Sophia doesn't answer. The fixture switch `ask=off` serves that; the new spec is `e2e/conversations-ask-off.spec.ts`.
- **Signed-in browser failures (`e2e/app-auth.spec.ts`), classified from existing evidence:**
  - Three palette cases pressed `Control+k`. The app binds the palette to ⌘K on a Mac (`src/app/shortcuts.ts`: `onMac ? metaKey : ctrlKey`), so they failed only on macOS. The spec now presses `ControlOrMeta+k`, as `palette-knows.spec.ts` does.
  - The two Account-button cases time out while the page shows only the splash. Their trace has no Auth or API request at all, just the cold dev-server module load (about 470 requests). That points to first-load timing on a cold server, not an account-isolation fault.
  - Main's Linux CI passes all of `app-auth`. Both explanations still need confirming in a B browser slot.

## Common browser gate (FND-B-CON-CI-INTEGRATION-02)

- **Merge.** One normal merge of #392's sealed `355039d9`, which carries main `e1cc4b4d`. No conflict. It brings:
  - main's day-pill test fix;
  - the Home and room-task read-versus-write test corrections;
  - the browser job's 90-minute deadline (same tests, two workers, retries and per-test bounds);
  - the activity case's `fastForward` clock.
  - C1's own long-name activity case is kept beside it.
- **Personal draft ordering** (`personal.spec.ts`, "a send that fails comes back beside words another tab kept meanwhile"). On C1's cancelled CI run, tab B's intermediate check saw `From A.\nFrom B.` instead of `From B.`. Locally, on cold servers with two workers:
  - the original case passed 20/20 together with its neighbour. With a temporary timing probe, B was checked 505–550 ms after A's Enter, and A's failure landed at 1794–1839 ms: the fixed 1500 ms delay was the only thing ordering the two tabs;
  - with B mounted on time but first checked 1.5 s later (temporary probe), the original assertion failed 3/3 with CI's exact value. Both drafts were kept, so this is no data loss;
  - the fix is a fixture barrier, not a product change: `holdSend=1` holds A's send until `window.personalFixture.releaseSend()`, and the case releases it only after B's words are checked. The intermediate check and the final both-draft and storage assertions are unchanged;
  - after the fix: 20/20 (both failed-send cases ×10), and 3/3 with the same 1.5 s late check.
- **Activity.** The file passed once on the integrated source: 6/6, with case 59 at 1.6 s. No new timing campaign. The earlier 10+10 measurement shows lower clock cost; it is not a reproduction of the CI timeout.
- **Not shown:** the full browser suite was not run locally. The required CI on the integrated head is still owed.

## Served path (FND-B-C1-SERVED-PATH-01)

The fixture pages run with VISION on and answer from the Studio's fixture API. This check runs the served path instead:
the normal Studio dev server (`vite.config.ts`, VISION unset, `VITE_SOPHIA_CONVERSATIONS=1`) through its `/api` proxy
to the real API (`apps/api/src/server.ts` on its restricted role, `SOPHIA_CONVERSATIONS=on`, no companion, no reply
grant) over a local PostgreSQL 17.11. The data comes from `apps/api/scripts/dev-db.ts --json` (synthetic HS256
identities, one project), with that project's conversation setting enabled by `set_conversation_settings`.
`apps/studio/playwright.served.config.ts` starts both servers; `e2e-served/c1-served.spec.ts` holds 5 cases, run by hand
(not in the default suite):

- VISION off: the tab reads the real A33 list (`GET /api/v1/projects/<id>/conversations`), and the project search, a
  VISION control, is absent.
- A conversation started with Ask checked is kept and found again after a reload. No reply is awaited, and no replies
  or runtime path is called. The database recorded the ask as a blocked reply (`no_grant`).
- An admin erases a conversation: it leaves the list and stays gone after a reload.
- «Your name» is saved (`PUT /api/v1/me/profile`) and read back after a reload. Another member sees the chosen name; a
  member without one shows as A member; no address appears on either page.
- Someone outside the project: corrected after R-C1-SERVED-01, see below.

The first two runs failed in the test itself: a row shows its words twice, and the database outlives a run (the same
name already saved leaves Save unavailable). The third run passed 5 of 5 with a row locator and words of its own.
Conversations have no rename in the Studio, so none is checked.

The outsider case as first written could pass without any denial (R-C1-SERVED-01). It checked
`responses.every(403|404)` over a list that could still be empty, since an empty list's every is true, and checked a
title's absence while the page could still be loading. So its pass in the third run, 162 ms, is not a served denial
witness, and that run's served acceptance is four positive cases. No access bypass was found or claimed: the API and
fixture permission tests keep their scope. The case now waits for the project's own refusal, `GET
/api/v1/projects/<id>/snapshot` answered 403, which is the read the shell makes first and denies on before any
conversation mounts. It then waits for the settled closed door ("No access to this project", "Outsider isn't a
member.", Back to projects), with no conversation list or open conversation behind it. Only then does it check that no
conversation's words show and that every project read this person made was refused (at least one, none answered). It
asks for no conversations read the shell never makes. This is a local served check with synthetic identities,
not hosted Auth or production acceptance.

## Current main 968631e7 (FND-B-C1-MAIN-ANCESTRY-01)

#389 landed on main as a merge of afbbed33, which C1 already carried, so C1 and main had two best common ancestors
(afbbed33 and 25f207f0). From the single base 25f207f0, GitHub found the recorded bundle identity in conflict
(`config/runtime-unit.json` and the profile lock: C1's e956 against main's 730) and could not build the PR's merge.
One normal merge of exact main 968631e7 now gives C1 that ancestry. With both bases, merge-ort combined it with no
conflict. It brings only #400 (report page font and windows: `packages/report`, the artifact reader styles, their tests
and records). `pnpm artifacts` reproduces the same bundle from the combined bytes,
`sha256:e956becce942134a52d81286709b8d84262a3d80a7c6d96a63ea163673aa0a36`: #400 is outside the bundle, and 730 was R1's
before C1's own bundle inputs were added. Format, lint, typecheck, contracts and contract regeneration pass with no
drift; unit tests 2961 passed, 0 failed; #400's tests 29 of 29. No SQL, contract, API, worker or bundle source changed,
so the database and browser checks were not repeated.

## Provider name fallback (FND-B-C1-PROVIDER-NAME-01)

The automatic review of 0186305a (4300538474) found that `providerName` (apps/api/src/auth.ts) gave up at the first
provider claim that couldn't be a name. A token with an address as `full_name` and a usable `user_name` was seeded with
no name, and its contributions read as "A member" until the person chose one. It now skips such a claim and takes the
next usable one in NAME_KEYS. With none usable there is still no name; an address, a name over 60 characters or the
contact itself is never taken; a chosen name stays chosen. No key, policy, SQL or UI changed.

Before the fix, the new unit case failed (null for `luis`, 7 of 8), and so did the real path: `GET /api/v1/me/profile`
on the API's restricted role and PostgreSQL seeded `displayName: null` where `luis` was expected (9 of 10). After it:
8 of 8 and 10 of 10, and the other name-reading DB files (access, conversations, mission) 47 of 47. Unit tests 2963
passed, 0 failed; the bundle still reproduces (e956, the API is outside it). The review's other finding (4300538470,
the reply supervisor's sweep before releasing an exhausted lease) is not changed here; its reach in C1 is being mapped
separately.

## Current main 14e65afc (FND-B-C1-CHAT-INTEGRATION-02)

One normal merge of main 14e65afc (Luis's #381, #384, #397, #401, #403, #404, #406, #414, #415 and #419: Studio and
docs). Only `OpenConversation.tsx` conflicted. #384 renders a member's words with RichText (bold, code, quotes and
links, in place); C1 renders them through MessageWords, which also shows a withdrawn message as withdrawn. MessageWords
now uses RichText for a member's words, and main's Turn layout was already inline in C1's message item. The held-read
gate still decides whether any words render. A new case in `conversations-removal.spec.ts` composes the two:
- a formatted message shows its marks;
- refused, neither its words nor its bold or code show;
- given back with the reads held, the cached formatted words stay hidden until a read since answers, then render with
  their marks.

Checks on the merge:
- Source: format, lint, typecheck and contracts pass, and contract regeneration has no drift. Unit tests 2984 passed,
  0 failed. The bundle reproduces unchanged (e956).
- Fixture browser: 262 of 262 for the conversation specs, the profile editor, the account menu, message format, links
  in place, message links, room return and skip link. The failed-send barrier passed 6 of 6, and the new case 3 of 3.
- Served (normal Studio, real API, restricted PostgreSQL, VISION off): all five cases again, 5 of 5.

## Current main 21516687 and projection read bounds (FND-B-C1-CURRENT-MAIN-03 v2, READ-BOUNDS-01)

**The merge.** One normal merge of main `21516687`, the combined source window Luis acknowledged, onto `2c60b408`, in
its own worktree. Three conflicts:
- **AccountMenu:** main's one-sheet-at-a-time model (Settings and its hand-offs, sign out of all devices) with C1's «Your
  name» as one more sheet. It carries the account it was opened for (`name:<account>`) and shows, keyed by it, only
  while that account is signed in, so no draft crosses accounts. C1's chosen name stays in the head.
- **ProjectShell:** C1's conversations layout flag, independent of VISION, inside main's ViewFailed boundary.
- **fixture-api:** one tokenAnswer, and main's archive answer, closed.
SignedIn, the room fixture, app-auth.spec and the media-bridge test combined automatically and were inspected: C1's
account-keyed remount and account cache stay, beside main's sign out of all devices and the view-failure hooks. API,
SQL, packages, config, worker, execution host, locks, scripts and workflows equal C1's, except main's media-bridge test.

**Projection read bounds.** The snapshot and discussion routes called `withActor` with no control, so a read had no
server deadline and no cancellation of its own.
- `withActor` now takes an optional `ServiceControl`, passed to the existing `transaction()`. Every other caller is
  unchanged, and the verified actor and REPEATABLE READ READ ONLY are as before.
- The two routes pass a control with a 20 s deadline (`PROJECTION_READ_MS`) and an abort when the response closes
  before it finishes.
- With it, the transaction retires its connection (never back to the pool) at the deadline or on the abort. On the
  server, each statement of the read is bounded by what remains of that deadline (see the correction below).
- 20 s is under the Studio's 30 s read, so the server answers «unavailable, ask again» first. A timed-out read answers
  503 `unavailable`, retry `safe_read`, with the existing message.

**One bounded episode, owned test cluster, real API.** An owner session held ACCESS EXCLUSIVE on `contributions` for
40 s, so the real snapshot read blocked. Request A aborted client-side at 5 s; request B waited. Backend PIDs were
mapped to the API process by their socket ports.
- **Before:**
  - A's backend stayed active in the lock wait at every sample (t+3 to t+32 s), then committed when the lock released
    (t+39 s).
  - B got no answer within 35 s, and its backend did the same.
- **After:**
  - The API retired A's connection at once: its socket was gone by t+8 s. But A's backend was still active at t+8 s
    and t+15 s. PostgreSQL cancelled it by `statement_timeout` 20 s after its BEGIN, and it exited, client gone.
  - B answered 503 at 20.0 s; its backend was cancelled the same way.
  - Both backends were gone by t+24 s; a fresh snapshot and discussion answered 200.
- So this is SQL retirement bounded by the 20 s server deadline, not an immediate cancellation caused by the HTTP
  abort: retiring the socket alone does not settle the database work. At this head the timeout was set once, so a
  statement started late could run on the server for up to a whole 20 s from its own start (R-C1-READ-BOUNDS-01,
  corrected below).
- A DB test covers it: a controlled actor read keeps its actor and read-only mode, a blocked query is retired at its
  deadline, its backend leaves, and the one-connection pool recovers.

**Checks.**
- Format, lint, typecheck and contracts (unchanged; no regeneration) pass. Artifacts reproduce C1's `e956becc`; main's
  runtime record is not taken.
- Units: 2990 passed, 0 failed, 70 skipped.
- Focused DB: 119/119 (access, API, media, profile, rooms, runtime, room conversations, service control); saved
  conversations and their fences 70/70.
- Served real App: 5/5. Case 1 first failed (run 29) with the list visible before any request was recorded; it now
  waits for the A33 response before its unchanged assertion.
- Affected fixture journeys across 37 files: 524/524.

**Still open, not touched:** the discussion query's cost, and C4's 510-message A34 journey; its slowness appeared with
fresh statistics missing, which is an association, not an established cause. This change bounds a read's lifetime; it
does not make a slow read usable.

**The remaining budget, statement by statement (FND-B-C1-READ-BOUNDS-CLOSURE-01, R-C1-READ-BOUNDS-01).** The
`statement_timeout` above was set once, after BEGIN and the actor's setting, to the time left then. That bounds one
statement, not the read: if an earlier statement used 18 s of the 20, a later one began near 18 s with the same ~20 s
of its own, and could hold its backend until near 38 s, long after the API had retired its socket.
- Now a controlled read's client (`budgetedRead`, service-control.ts) checks the deadline before each statement, the
  actor's setting included, and starts none after it. It sets `statement_timeout` to what remains, less 100 ms
  (`READ_SETTLE_MS`) for PostgreSQL's cancel, its error and the retirement, before every statement. A statement begun
  late is ended by PostgreSQL itself within the read's 20 s.
- BEGIN itself is not bounded on the server: it takes no lock and reads no data. The client-side retirement at the
  deadline still covers it.
- Unchanged:
  - Writes, controlled or not, keep their one bound, and COMMIT uncertainty (`outcome_unknown`) is untouched.
  - Uncontrolled callers get no new policy. The pool's 10 s acquisition stays inside the 20 s, not added to it.
  - The actor UUID check, the transaction-local actor, REPEATABLE READ READ ONLY, RLS, the error mapping, and the UI
    and its name and privacy guards.
- One restricted-PG case in the service-control test, a 2 s read: the first statement sleeps 1.2 s; the second begins
  late, at 1204 ms, on a table an owner session holds locked. That session is itself bounded at 5 s idle in
  transaction. The old backend PID is watched from another session until it leaves, before the lock is released.
  - Before, at `f2953616`: the backend was seen waiting on the lock and was still on the server 708 ms after the
    deadline (its own timeout would end it near 3.2 s).
  - After: seen waiting, then gone 82 ms BEFORE the deadline, ended by PostgreSQL ahead of the API's own retirement.
    The one-connection pool's next actor read keeps its actor and read-only mode on a new PID.
  - The earlier 150 ms actor case still starts its statement and sees it cancelled on the server. A first margin of
    500 ms refused that statement before it began, so the margin is 100 ms.
- Checks: service control 8/8. Focused DB 234/234 (API access, API, media, profile, rooms, runtime, conversations;
  persistence service control, persistence, room, conversations, conversation fences, races). Served real App 5/5.
- `pnpm check` passes: units 2990 passed, 0 failed, 70 skipped; integration 108 passed, 2 skipped. The artifacts
  reproduce C1's unchanged (`e956becc`, lock `b868da08`, darwin dsh `e24cb887`).

**The real LiveKit job on `85a6db00` (FND-B-C1-LIVEKIT-CONTRACT-FOCUSED-02).** CI's media-bridge job (check 117354277610)
failed 1 of 6: the screen share stopped again expected `true`. That expectation is main's older contract, kept when
main's screen case came in with `21516687`. C1's own muteSources returns true only when it muted a track, so a repeated
or retried act that changes nothing is not recorded (Codex P2 on #385). The microphone case already expected `false`.
- The test now expects `false` for the repeated stop, and checks that both screen tracks are still muted.
- The first stop's assertions are unchanged: both tracks muted on the server, and the sharer's client told. So are
  the other cases. No API code changed.
- Locally the LiveKit suite is skipped (no server here); its real run is that CI job on the next pushed head.


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
