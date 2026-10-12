# CON-01 source takeover 2 — 13 October 2026

Goal/attempt: CON-01, Codex source takeover 2. Human owner: Davide. Executor:
Codex desktop session `01a1224a-32b4-7222-a017-50a277572d95`, the existing owned
`sophia-con01-source-harness-review` worktree. No Claude workflow resumed.

## Authority and inputs

Davide approved the bounded source-only proposal at2026-10-12T22:34:06Z;
[approval record](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6133920949),
[fresh reservation GO](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6133983482).
Window ends2026-10-13T08:00:00Z. Codex is temporary sole source writer for the
reviewed r12 scope, the seven CON Studio paths/A15+A16 composition and separate
Q13A qualification. This expressly replaces missing owner-ACK/accepted-base
prerequisites for LOCAL authoring/draft publication only. Historical ACKs remain
at their actual pins; Luis integration/merge review and Davide acceptance remain.
An active overlapping writer or collision stops affected writes.

Fresh census:217origin refs,12open PRs;0049/0050 absent from published migration
trees,0053 only on the existing dispatcher branch. Relevant CON worktrees clean;
separate153e7b33 is a PR270/272 byte-backup/renderer audit, outside held CON paths.
No force-push/reset of another branch. Own branch:
`codex/con01-takeover-source-20261013`.

| Input/result | Commit | Tree |
|---|---|---|
| Fresh main base | 32854caf01e7d5e493e096baead019506b1d1de3 | 28a1dfd28e7680d0517a1eb2d05034105defa96f |
| Dispatcher imported unchanged from93e9313d | 17142c192bdea2d320f9b13d94304c8c52661c13 | 3ea8b3126da19ca04be464b0517b956c613f5b65 |
| UI2696e7/G1d527/kit composition | 3fac682943b5c26bcbbc81c1be4a0121516b6344 | 41030c861128b314b07142a6ecae00bdcdad5a1a |
| Retained dormant G2/docs2717e6 merged | 971793394fb2bf67b84f6daab2d2f3afbd43e6ea | 4d94a505bafef92eaf723b3964c1e1b110bdb660 |
| Focus correction source | 922773b27c252bec5d977c3d47c5c1cc9dcdef85 | b0d7ef0fba0e3fb4d4234c045dfb44cc95fed67d |

The publication receipt records the later docs commit/tree and exact review.
R12 scope is pinned at7e6bf86b/treeeecae567 with reservation SHA256
c0d428a077fd7bdcadfec1c794861b0e784c43a41ab95a7c4067e15290f05307
and research amendment SHA256
2a07104b1501fa7d33330e8dae2d9270df53314a2b09be2ceb738c1fdd27b114.

## Changes and preserved behavior

Dispatcher0053 is the prerequisite, retained byte-identical. Current main's
Studio is composed with the saved-chat/kit source. Only NewConversation imports
and conversation CSS conflicted: keep main's `sameQuestionLine` alongside CON's
`useKept`; retain Luis's newer relative-flow touch message acts rather than the
older fixed44px padding. Luis's199/6115106416,6118092274 and6120119263 choices
are retained: standard confirmation controls, distinct Remove/Withdraw words,
separate summary/questions coverage, withdrawal as the fourth row act, CON-only
navigation, next-ask/same-question wiring and A15+A16 generation together.

The new P2 fix addresses an opening-frame focus race. Previously, a hidden row
was sufficient to focus the title even after the reader reached the composer.
The callback now moves focus only from the body or that hidden row. A controlled
frame test activates the row with Enter, types before the opening callback, then
releases it; the original implementation fails at the final composer-focus
assertion. Normal phone title focus and late-erasure destination remain covered.
No test criterion was relaxed. A formatting-only blank line was removed from
the merge resolution.

No pre-existing OpenAPI route/schema value changed: the generated comparison
finds only the five CON routes and17CON schemas added. A04/A11, bundle, host,
runtime configuration and lock bytes are unchanged. `pnpm artifacts` reproduced
the existing combined WBC-02/SDD-01 unit, not a competing runtime. S1–S4 stay
dormant candidates outside migrations and shared persistence exports. S3's broad
`sophia_api` inheritance remains an explicit Q13 blocker until the separate
least-privilege slice is implemented and qualified. No native reply is enabled.

## Executed evidence

Node24.21.0/pnpm11.7.0, Playwright1.63.0/required Chromium revision1243.

- Dispatcher17142: real owned PostgreSQL17.6, `node --test
  packages/persistence/src/runtime.db.test.ts`:23/23pass. Omit0053 for the
  controlled fail-before: four assertion failures, incorrect count2 and
  starvation counts2/50 instead of1. Restore exact migration afterward.
  Independent complete two-file source review found no actionable issue;
  reviewer ran no tests/providers.
- Source922773b2, real owned PostgreSQL17.6, serial `node --test` over
  `conversations.db.test.ts`, API `conversations.db.test.ts`,
  `conversation-{reply-states,ledger,assembly,fences}.db.test.ts` and
  `runtime.db.test.ts`:172/172pass,0fail/skip/cancel. `node scripts/db-test.ts`:
  47migrations/5SQL files passed. These exercise actual authorization, lost
  response/idempotency, ordering, human-only zero operational growth and dormant
  ledger/context/privacy fences; they do not qualify Q13 or a native answer.
- Initial composed `pnpm check` exited0, but the focus source changed while it
  ran, so it is not an exact-candidate gate. Its 2353unit passes/70explicit
  environment-platform skips and86integration passes/2compatibility skips
  remain diagnostic only. The first attempt failed merge formatting and is
  retained. Final pinned922 gate is running at preparation; its exact terminal
  result goes in the publication receipt.
- Controlled focus fail-before1failure; after4/4affected cases pass. Broader
  affected browser run:73/73pass across conversations-panes, context-fence,
  confirmation-kit, project-conversation-writes, same-question and ask-instead.
  This includes the unchanged privacy-frame criterion; a passing run does not
  erase earlier failures or qualify all possible privacy interleavings.
- Actual built-in browser on the local labelled fixture at1440x900 and390x844:
  three panes, same-question shortcut opens the existing conversation with
  title focus, phone unsent draft returns after leaving/reopening. Synthetic
  content only; no Send/Ask, invitation, account or live operation submitted.
  Private screenshots retained; viewport restored. Not signed-in app evidence.

The four previous CI areas were rechecked on922773b2: eyebrows, press-answers,
resources and task-keys,119/119browser cases pass, including their phone cases.
Earlier CI failures remain recorded at their original source. No full Studio
suite pass is inferred.

Both owned PostgreSQL instances were fast-stopped, PID absent, ports closed and
clusters removed. Logs/receipts remain outside Git. Complete combined independent
review is in progress; no push before it, no automatic result inferred.

## Readiness, operations and next action

`source_ready`/`locally_verified` apply only to the named imported/fixed slices
and actual checks above. Combined `reviewed` waits on independent whole-diff
review; `authorized` applies to this source window only. `deployed`,
`app_verified`, `owner_accepted` remain unestablished. Retained36-case ledger:
18partial_L1/3passed_L1/15not_run, unchanged. Davide makes the product decision.

OptionC, throwaway home per execution attempt, Q13A, conservative same-conversation
withdrawal and conversation-text-v1 test cohort remain settled. Cleanup failure,
uncertain execution and cumulative accounting must remain unresolved rather
than reset. No automatic regeneration of withdrawn answers.

OP0002r6 setup/human-chat and OP0001r4 Ask remain draft_not_authorized, approval
reference null. No merge, hosted migration/config/deploy, account/member/grant,
database privilege/connection termination, credential read/copy/transfer,
provider/native Ask or subscription spend authorized/performed. Askoff. No PAYG,
credits, provider switching, account rotation, hidden reset or monitor. Actual
serving app/API/runtime tuple, two-account episode and supported subscription
route/quotas remain unqualified. Existing stopped-workflow subscription deduction
remains unknown, not reset by this attempt. Other missions remain open.

Local rollback is omission/reversion of this own candidate; no hosted rollback
was needed. Future rollback must preserve saved governed data and outstanding
cleanup/accounting. Next bounded action: terminalize checks, independent
whole-diff review, draft publication and exact-head automatic Codex review;
then implement the separately identifiable Q13A/dormant G2 slices in the reviewed
dependency order within the same finite source window. Hosted batches still
require complete exact candidates/artifacts/targets/roles/references/caps/expiry
and separate Davide approval.
