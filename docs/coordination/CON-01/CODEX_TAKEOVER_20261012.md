# Codex CON-01 takeover — 12 October 2026, Europe/Rome

Direct Davide authority: “Claude is approaching token limits, please you
continue the mission alone. Always check dor the codex automatic code review
after every push”. Codex now authors the mission's implementation; no further
Claude coding task. Earlier independent reviews remain scoped to their exact
candidates. Codex-authored fixes are not called independently validated.

After each push, request automatic Codex review, verify its exact commit and
read/resolve material findings before proceeding. No merge before the final
push's review. CI and automatic review are distinct from real-app acceptance.

## Source and pre-write scope

Observed preparation base0112445e71d38c3f70dae92659390b60257e6093,
tree78e787c87520a950c0895d7c4af5261ece9442da, Luis's ui/kit-with-con01.
It advances d96626ac through ui/next-ask-places. It is not an accepted release
base. PR199 remainsd527f385. Owned worktree formerly detached source-harness
review, now codex/con01-takeover-prep; no reset of another branch.

Writable: WithdrawHere.tsx, EraseHere.tsx, ConversationConfirmation.tsx, ProjectContext.tsx and
conversation-list.ts, their focused tests; the reviewed notice-only delta in
packages/persistence/src/conversations.ts and fixtures/conversation-wire.ts;
CON-owned documentation. Preserve Luis's prepared shared resolutions and
seven held files. No schema/contracts/runtime or unrelated vision changes.

The two confirmations keep their own receipt-aware state because the kit's
ConfirmButton closes on confirmation before an async receipt. Use the kit's
Button primitives for height/style, safe initial focus, pending guards and
consistent own/moderator action wording. Keep unknown retry under its original
key. Explicitly disclose conservative withdrawal of later Sophia answers in
the same conversation even if unused. Keep other human messages, conversations
and independently governed decisions intact. No regeneration.

Coverage labels distinguish summary from questions while keeping their own
range/completeness/stale/unavailable/privacy state. Accepted conversation-text-v1
notice for synthetic cohort only is reused from reviewed3878328f; provider
deletion disclosure/qualification remains before Ask.

Before-fix checks: safe second Enter, Keep/Escape/focus return, pending duplicate
press and dismissal, unknown same-key retry, Remove/Removing/unknown words,
desktop/phone controls, unequal coverage states and partial/private visibility.
Local fixture tests are L1 only. Results and exact candidate recorded below
only after execution.

## Authority and operations still held

Davide confirmed recorded foundation#14/research#31 owners as current and
authorized coordinating their handbacks. This confirms routes, not their
actual ACKs. Native Claude path currently has no accessible window; selecting
the installed app timed out. Direct IAB foundation session redirected to
involuntary logout. No bypass or old operation. Latest solo instruction means
no further Claude coding/review wake. Preserve actual shared owner ACK/base/
window gates and Luis integration authority.

Accepted prior decisions remain at reviewer recordceb4e14e:
conversation-text-v1 synthetic cohort, optionC, disposable isolated home,
Q13A and conservative withdrawal. Neither takeover nor source preparation
approves hosted migration/config/deploy/account/grant/provider execution.
OP0002r6 and OP0001r4 remain unbound/unapproved; Ask off, no compatible
subscription/quota route qualified, actual-app/provider evidence absent.
Davide retains product acceptance. No broader/other mission completion.

## Executed checks and acceptance limits

Attempt: CON-01 Codex takeover preparation 1. Human owner Davide; executor
Codex desktop in the existing owned source-harness-review worktree. Native
coding session identity unknown. Starting commit/tree recorded above. Ending
commit/tree will be recorded by the PR and mission comment after commit;
no self-referential source identity is asserted here.

Node 24.21.0 / pnpm 11.7.0; existing pinned Playwright 1.63.0 / Chromium1243.
No dependency or lock change. Actual checks:

- `node --test apps/studio/src/features/conversations/coverage-labels.test.ts
  apps/studio/src/features/conversations/conversation-list.test.ts
  apps/studio/src/features/conversations/held-write.test.ts`: 107 passed.
  The new coverage tests failed 3/4 on unchanged source before implementation.
- `pnpm typecheck`: passed all packages. Final
  `pnpm --filter @sophia/studio typecheck`: passed after the coverage-map refactor.
- Targeted type-aware oxlint on changed product files: passed. An initial
  complexity finding was corrected by the coverage-copy map, then rechecked.
- `pnpm exec prettier --check` on the ten changed/new source/test files:
  passed; `git diff --check HEAD`: passed.
- `pnpm toolchain:check` and `pnpm contracts:check`: passed. No contract edits.
- `CI=1 pnpm exec playwright test e2e/conversations-confirmation-kit.spec.ts
  e2e/conversations-removal.spec.ts --workers=2 --global-timeout=240000
  --reporter=line`: 47/49 passed. One old assertion expected the destructive
  initial focus; its expectation now requires Keep it, preserving the rest of
  the scenario. The other failure is the phone late-erasure focus case below.
- Final focused browser run of the two specs with
  `--grep="confirmation kit|Keep it and Esc keep the conversation" --workers=2
  --global-timeout=90000 --reporter=line`: 7/7 passed, including six new cases.
  Before the fix, desktop safe focus, pending wording/guard, unknown wording,
  erasure focus and coverage labels failed. The phone harness was corrected to
  select the conversation and tap to expose its existing touch action; after
  that correction the unchanged source failed the safe-focus assertion.
  The earlier phone navigation/hover errors are harness errors, not defects.

`pnpm check` and full CI have not been claimed passed. These scoped checks do
not qualify PostgreSQL, native isolation/cleanup, a provider answer or hosted
acceptance. The earlier G3 context privacy failure also remains open.

### Existing preparation-base focus failure remains open

`conversations-removal.spec.ts` phone case “an erasure's late reply doesn't
take focus from another conversation's draft” fails at the editor focus
assertion around line242. On the changed candidate it failed in the 49-case
run. Independently, the **unchanged preparation base0112445e** was checked in
the existing owned all-context-review worktree with
`CI=1 pnpm exec playwright test e2e/conversations-removal.spec.ts
--project=phone --grep="an erasure's late reply" --repeat-each=3 --workers=1
--global-timeout=90000 --reporter=line`: one pass, two failures. It is an open
P2 integration finding; cause is not established. Do not weaken the criterion
or force focus in the test. Shared OpenConversation arrival-focus behavior
needs a separately recorded write scope before correction. This patch does
not clear G3 or authorize integration.

## Browser evidence and cleanup

The built-in browser exercised the actual changed local Studio fixture at
`room.html?place=conversations&conversations=1`, with its explicit
“Fixture — no API, no call” banner. Desktop1280×800 and phone390×844 showed
the full conservative disclosure, safe Keep focus and no horizontal overflow.
Enter kept the message; Escape dismissed and returned focus. Standard button
heights were28px in this fine-pointer browser. The Playwright coarse-pointer
phone check separately measured danger40px/ghost36px. Do not call a viewport
resize a touch test. The full accepted notice fit in the phone new-conversation
form. Screenshots and read-only measurements are in
`evidence/20261012-codex-takeover/`; only synthetic content is included.

The owned local Vite session was stopped; ports49832/5198/5199 were verified
closed. Temporary browser tab29 is closed and the viewport override reset;
the existing hosted tab is retained for later work, without a hosted-test
claim. The temporary foundation tab28 is also closed. Baseline worktree was
restored to detached d527f385. Private synthetic failure logs/traces remain
outside Git in the operator journal. No runtime, hosted account, database,
provider, or operational effect was started; spend0, provider calls0, no
uncertain external effect from this patch. Rollback is omission/reversion of
this source patch; it requires no data migration.

Source readiness is scoped to this patch; local verification passed its
focused checks with the existing integration failure explicitly retained.
Independent pre-push review and the post-push automatic review are recorded
in the PR/mission thread. Authorized/deployed/app_verified/owner_accepted are
not advanced. OP0002r6/OP0001r4 stay draft_not_authorized.

Next bounded action: publish the scoped draft patch against the prepared
ui/kit-with-con01 branch and obtain the automatic review for its exact head;
then resolve findings and reconcile the held integration failure with Luis.

## First push review and bounded correction

First push a063457e9ea5e518d02fbb97015927b2ead8c5da,
tree8c4cbbd339c865493f94620e10aa86f34fdd715c, is draft PR269 against
Luis's preparation branch. Remote target advanced969f34bc before publication;
the patch's source paths did not change there, but shared CSS/ProjectShell did.
The reviewed/tested base stays011244; no latest-combined qualification is
inferred. PR199/main remain untouched. Independent pre-push whole-diff review
found no actionable new defect and separately ran107/107 focused unit tests.

Automatic Codex review was explicitly requested after this push in
PR269 comment6127738011 and completed for a063457e at15:55:40Z.
Review5493173077 raised P2r4249962031: in a moderator removal, saying
“Other people's messages stay” could include the chosen target. Accepted.
The warning now says **“All other human messages, other conversations and
recorded project decisions stay.”** This excludes the selected message and
continues to distinguish other human messages from the later Sophia answers
that conservative withdrawal can remove. No receipt or permission change.

The desktop and phone assertion was added before source correction: both
failed with the old words (exit1). After correction, all six cases in
conversations-confirmation-kit.spec.ts passed (exit0). Final Studio typecheck
and changed-file Prettier passed. Built-in browser independently displayed
the corrected warning, Keep focus and Escape return in the three-pane fixture;
desktop-confirmation-review-correction.jpg is the new source's screenshot.
Earlier screenshots remain evidence of the first push only. Tab30 and owned
Vite session were closed, viewport reset; no hosted effects.

### First-push CI failure retained

Both observed workflows' runtime-unit jobs failed in ordinary unit testing:
2437 tests,2369 passed,1 failed,67 skipped. The failure is
apps/studio/src/features/work/planning/fixture-boundary.test.ts:43, which
reports features/work/GoalList.tsx as a production plan-seed offender. Real
CI job114892411422 supplied this diagnostic. The browser jobs were cancelled;
SQL/API, local Supabase auth, LiveKit and PDF jobs passed on this head.
This is not green CI or evidence of running hosted acceptance.

The same two-case fixture-boundary test was run on **unchanged0112445e** in
the owned baseline worktree:1 passed/1 failed, exit1, same GoalList offender;
the worktree was restored to d527f385. Neither path changes in this patch.
No weakening of the fixture boundary or unrelated Tasks fix is included.
Luis's lane needs to reconcile this base issue before a safe merge.

The correction requires another exact-head automatic review after its push;
the first review cannot clear the changed source. Its result and final source
tuple will be recorded in PR269/mission198, without another docs-only push.
Retained ownership requests were now posted directly to recorded foundation
issue14 (6130159389) and research issue31 (6130159732), source handback only.
No response or writer window is inferred. No Claude coding run was started.

## Second push review and pending-control correction

Second push956cf90f5721af809eb803ec938dcdb60c6a254b,
tree393da4b9ae6c7c2c3316181c053b94acd409604b, received its explicit review
request6130204818. Bot review5494645707 completed18:32:57Z with a new
P2r4251190947: Keep used the ghost kind, whose aria-disabled state had no
muted appearance and still changed on hover. Accepted. The kit's existing
neutral pill at size sm now supplies the disabled appearance and hover guard;
no shared theme/conversations CSS edit. Aria-disabled keeps focus stable and
the existing guard ignores pending presses. Both withdrawal and erasure use
the same helper. Default desktop height stays28/28; touch now40/40. Earlier
phone36px Keep measurement belongs to the earlier source only.

The pending style assertion failed before correction (opacity1 rather than
0.45, exit1). After correction, all six confirmation browser cases passed,
including muted opacity/default cursor/unchanged hover and ignored Keep;
safe-focus and touch-control expectations also pass. Studio typecheck and
targeted helper lint passed. Prettier initially flagged the expanded browser
assertion; formatted it and reran the changed-file check successfully.

Built-in browser showed actual local fixture Removing/Keep controls muted
and marked disabled, with focus retained on Removing. The captured
desktop-pending-controls.jpg is the latest helper source. Synthetic fixture
settlement was observed afterward, then tab31 and the owned Vite server were
closed and viewport reset. This is not a real withdrawal/provider acceptance.

Latest-head CI runtime-unit job114951506103 again failed the same untouched
GoalList fixture-boundary assertion; other jobs were still in progress at
that checkpoint. No all-green claim or CI rerun/cancellation. The wording
thread was resolved after its source correction; the new style thread waits
for the next exact-head review. Final tuple and third-push review result go
in PR269/mission198. All earlier integration/ownership/operation holds stand.
