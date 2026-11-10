# Implementation-session handoff — INC01-DES-001

Goal and attempt: INC01-DES-001, revision 3 (r2 `changes_requested` by Davide's iteration pack), attempt 1 (INC-01)  
Human owner / executor resource: Davide / the dedicated Claude Code designer (cloud session, Auto mode)  
Native session: `session_01FGXfrKKdKs2Y9XbfrHzs3s`; coordinator Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81`  
Starting worktree/commit: `/home/user/Sophia`, branch `claude/determined-ritchie-eujmht` at `main`
`953e5dc3d4c88e491517f3f0d0eaa18216fea98f` (clean, equal to `origin/main`)  
Ending commit/tree and changed files: one local, unpushed commit; its hash and tree are in the exported manifest (a
commit can't name its own hash). r1 was `face27996b5702f8586640238ec39ab168b37396` / tree
`6d682af05b33f4040a9f61bcd887c61d13fd6c70`, kept in the r1 export; r2 replaced that unpublished commit
(`00d8193c56ac42d2cc8ee31a4f96a0c479141c5f` / `c1a1f0d09aedf346d48b12e2d2d55ed983eca5ab`, kept with its export). r3 is
one publication commit on the base, its r2-based work commit kept on a separate local ref (manifest). Changed:
`apps/studio/src/features/resources/{ResourceSheet.tsx, ResourceTile.tsx, resource.ts, resources.css, status-words.ts,
status-words.test.ts, receipts.ts, receipts.test.ts, SessionActs.tsx, work-control.ts, work-control.test.ts}`,
`apps/studio/src/features/work/planning/{actions.ts, actions.test.ts}`, `apps/studio/fixtures/{resources.tsx,
work.tsx}`, `apps/studio/e2e/{resources.spec.ts, resource-control-status.spec.ts, work.spec.ts}`,
`docs/plans/inc01-resource-control-truth.md`, this file,
`docs/coordination/SOPHIA-INC-2026-11/DESIGN_RESOURCE_CONTROLS.md`.

Assignment: `INC01-DES-001.md`, SHA-256 `9ef27aeadf95641ad400d1d13eb15ced00d3a09951a77e734d71695fafdbff38`. Pack read
without merging at `afe68b679722e28471dcdf6222d519759cd78c49` (README, MISSION, INC-01 module, C01, C02,
DESIGN_APPROVAL). Runtime unit `sophia-runtime-wbc02-dev` (`config/runtime-unit.json`), untouched. r2 repair:
`INC01-DES-001-r2-REPAIR.md`, SHA-256 `6aea5dfffc8a3053e0460d3d44f2c6c3e9fd63e3794f8003c4cf50e55d3d1808`, on review
`INC01-DES-001-r1-SOURCE-PRE-PUSH-001` (SHA-256 `0e32fc91a64c80c688cb9f7aeba3e6d406adeb63b5472c6013df45ea6f41376d`),
which also assigned `apps/studio/e2e/work.spec.ts` to this session, only for the shared Hold assertions. r3: Davide's
`Sophia_INC01_DES_001_Iteration_Pack_v1_2026-11-09` (ZIP SHA-256
`363564bf24864b8e0158df7871345789e73f2534eeb978584565cb4d9eca1c98`; the ZIP never reached this session: its nine text
files arrived separately and match its manifest byte for byte; its four images arrived re-encoded as WebP, so they
served as visual references only), with the coordinator's grant of `fixtures/work.tsx`, `TaskActions.tsx`,
`TaskSheet.tsx`, `actions.ts` and `actions.test.ts` for this shared state and navigation correction.

## Outcome

On the existing tile → ResourceSheet path, an owner and a teammate can now tell a host seen online from a ready tool,
see which controls the route qualifies in words, and read that a control sent is a request until its runtime confirms
it. The Stop tip's promise `Ends its work at once, whatever else is waiting` is gone. The receipts already kept request,
delivery and settlement apart. In r2, a settled Hold says only what its evidence proves, `Held. Its runtime confirmed
the hold.`, in Resources and Tasks alike; it no longer promises `Work and remaining allowance are retained.`
States and copy: [the plan](../plans/inc01-resource-control-truth.md) and
[the review record](../coordination/SOPHIA-INC-2026-11/DESIGN_RESOURCE_CONTROLS.md).

In r3, held work reads as held and its next action is Open work: a Resources row whose Hold its runtime confirmed says
**Held** (neutral), "Its runtime confirmed the hold." and offers **Open work** to the same work in Tasks; it is offered
no second Hold, nor guidance. A Hold on its way says **Hold requested**; a lost or unknown one **Hold not confirmed**,
its Try again the same operation. The state comes from the one store Resources and Tasks share, for the exact
execution; Tasks draws no second Hold either, nor names H for one. Readiness opens on request, fact by fact, the
unknown ones said as not reported. Control support uses the pack's words.

State: `awaiting_design_approval` (revision 3, repair 2), and awaiting the independent whole-diff review of repair 2.
r3 repair 1 (`9c1ee251…`) was reviewed NEEDS_REVISION (DES-R3-REPAIR1-F05…F07; F01–F04 closed), kept as history.
r3 (`848f1105…`) was reviewed NEEDS_REVISION (DES-R3-F01…F04) and is kept as history. Not approved, not
pushed. r2 is `changes_requested`.

## Sequence, as it happened

1. Setup: identities checked, pinned Impeccable fetched and verified, engine verified, `impeccable context` run once.
2. Read the incumbent source (sheet, tile, panel, capacity, receipts, SessionActs, fixtures) and the issued pack.
3. *Before* captures on unchanged source: 13 states, as 26 PNGs in 13 before/after pairs, desktop 1280×800 and narrow
   390×844. (The r1 text said 12 states; the Stop confirmation is a 13th.)
4. Code: `status-words.ts` and its tests, the sheet, the tile, CSS, the spec updates and the new spec. **The states plan
   required before code was not written first**; it was written after implementation began, at the coordinator's
   process correction, and says so.
5. First browser run: 106 passed, 2 failed. One was an existing description assertion that still pinned `Online`; the
   other was a bug in the new spec (it read the hidden step label `Stopped` as said text). Both were fixed, then passed.
6. *After* captures showed three defects, all fixed: the online dot had lost its colour (state class moved off the
   dot's parent); `HOST STATE UNKNOWN` truncated the tile's tool name (the tile now says `Host unknown`); a fixed 9.5em
   label column left a wide gap (now `max-content` columns shared across rows).
7. A recapture was stopped mid-run by the coordinator. Davide then rescinded the stop. Four partial captures from the
   stopped run were set aside in scratch (the r1 text said they were in the r1 export; they were not; r2's export
   carries them under `r1-history/partial-interrupted/`), the fixture server (gone by then) was restarted, and all 13
   after-states were captured again.
8. One scoped detector run, then the full `pnpm check`, then the resource browser specs again. r1 exported.
9. r2, from review DES-R1-F01: the settled-Hold words in `receipts.ts`; the unit tests in `receipts.test.ts`, which
   now check the claim against the receipt's evidence and every unsettled Hold path; the four `work.spec.ts`
   assertions; a settled-Hold check through ResourceSheet. Both new guards were mutation-checked: the old promise put
   back, and a control said settled on delivery alone, each failed them (unit and browser), and the file was restored
   byte-identical. The affected browser suites ran on r2: 316 passed, 1 failed, UI-04 in `work.spec.ts`, a lane read
   once without retry right after load (empty array); it involves no Hold, receipt or control, passed 5 of 5 alone and
   in r1's run, and is left as is (outside this file's assigned Hold assertions). Captures of the changed state were
   taken. The first r2 `pnpm check` failed at lint: a helper in the new unit test captured nothing from its scope
   (`unicorn/consistent-function-scoping`). It moved to module scope, the unit mutations were run again (still caught),
   and the second `pnpm check` passed: unit 4,192 tests (4,125 pass, 67 skipped), integration 140 (138 pass, 2 skipped).
   The browser run above predates only that test-file move and these docs; `receipts.ts` is byte-identical since.

## Evidence

Commands and results are in the export manifest (`MANIFEST.json`, `pnpm-check.log`, Playwright output). In summary:
unit tests for `status-words.ts` (host words, grouping, every note branch); `e2e/resource-control-status.spec.ts` (owner
vs teammate; unknown/offline/online host with the readiness line; Stop by keys alone stays "requested" without
settlement and Escape returns focus to its tile; `settle=unknown` vs `confirmed`; lost Hold retried on the same
operation; `@phone` fit). The existing `resources.spec.ts` and `demo-resources.spec.ts` pass with updated wording.

Impeccable: `pbakaus/impeccable@924bbd194d02e5e15a227e75b5901fb0d7a4ecad`, skill 4.8.1, all eight reviewed file hashes
matched. The skill folder was copied by hand to a task-local scratch install; nothing in the repository, and no project
or global settings, hooks or dependencies changed. Engine `engine-v0.1.19` `impeccable-linux-x64` was downloaded to
scratch; its SHA-256 `07b763dc00012e9acf219fe2d2e8980f0810fb8af2e4a41c090107a8351d412f` matched both the assignment and
the pinned `engine-checksums.txt` before it was made executable, and it ran only through `IMPECCABLE_BIN` with
`DO_NOT_TRACK=1`. The architecture was x86_64. Used: `context` (Operate mode, polish, craft-floor) and one `detect`. Not
used: live, generate, Apply, critique, hooks, subagents. The engine wrote `~/.impeccable/update-check.json` (one
timestamp, during `context`); no update was installed. The detector's one finding is the pre-existing gradient sweep
on `.attention-label` (resources.css), outside this change and left as it is.

## Decisions and changes

- Words live in a pure module with tests (`status-words.ts`), per CONTRIBUTING's copy rule; components only render them.
- No new prop, readiness field, grant, Connect or Manage-use action, control or transport semantics. Readiness is said
  as not reported because no prop carries it.
- `SUPPORT` was removed from `resource.ts` (its one user now uses `SUPPORT_SAID`).
- DES-R1-F01, repaired in r2: r1 left `Held. Work and remaining allowance are retained.` and only disclosed it. A held
  receipt proves the native session is held; it observes no allowance, charge or work, so the words now say only
  `Held. Its runtime confirmed the hold.` One function (`knownSaid`) speaks for both callers, Resources' ResourceSheet
  and Tasks' TaskActions, through SessionActs (Steps and Earlier), so they agree. Requested, recorded, delivered and
  settled stay apart; lost and unknown stay unknown; a retry keeps its operation; no transport, budget or accounting
  rule changed. Stop's `Stopped. Completed work is kept.` restates its own confirmation's policy, not a cost claim; it
  is unchanged.
- Seen, not changed: on Resources a held session is still offered Hold, never Resume (its route's offers are static);
  Tasks offers Resume. A design question for the Resume path, not part of this repair.
- The capacity paths (unknown, stale/expired, past reset → `Refresh pending`, `reset was due …`) never claim a full
  account; unchanged here. `Refresh pending` is also said when the Studio only derived a passed reset, not when a
  collector reported a pending refresh; worth a follow-up in the capacity copy.

## r3, as it happened

1. The pack's ZIP never reached this session; its text files came in two batches and the images in a third, re-encoded
   (WebP; hashes recorded in the checklist). Meanwhile: identities, toolchain and engine re-verified; the Tasks seam
   read; UI-04 (`work.spec.ts:862`) stressed: 40 of 40 passed with 12 workers on 4 cores, so not reproduced.
2. The states and crossings plan was written before any r3 code (the r1 lesson), then the r3 *before* captures on the
   unchanged r2 source (12 states): a confirmed-held row still said `Working`, Act still `Hold or Stop`.
3. Code: `work-control.ts` (state from the shared receipts, offers it still allows, its words) and its tests;
   `SessionActs` filters what it draws by that state (Try again keeps going by the full offer); the Resources row's
   status, sentence and Open work; `sheetKeys` in Tasks; Readiness details; the pack's support words; the fixtures'
   `held=` (the two fixture pages share no store; the app's one page does).
4. Lint found `SessionRow` too complex (16 > 12), a shadowed name, a test helper's scope and an unsafe assertion; each
   was fixed, not suppressed (`WorkLine`, `OwnerWork`).
5. First browser run: 307 passed, 10 failed of 317. Three were checks changed during that run (old copies ran); two
   pinned the r2 support words; five (Codex F-007, F-016, F-021, F-022, the Resources act check) showed that hiding all
   controls once a Stop was sent broke reviewed behaviour the pack never asked to change: a Stop on its way stays
   pressable, the same operation again. The Stop rule was narrowed to "nothing once stopped"; the 10 and the new
   checks then passed (21 of 21).
6. Mutation checks: with no state filter, 5 r3 browser checks and 4 unit tests failed; with no status words, 6 r3
   browser checks failed; restored byte-identical after each.
7. *After* captures (17 states, superseded by step 9's 20), one scoped detector run (only the pre-existing `.attention-label` gradient), and a
   full `pnpm check` (exit 0) on that source, all then superseded by step 8, kept as such.
8. The coordinator ruled on C01-R16 (above, and in the plan). `work-control.ts` now fences guidance while a Hold, Resume
   or Stop is in play, Try again goes by `retryKinds`, and `guidanceWithheld` says why with any draft "kept on this
   page; nothing more is sent from it" (first worded "not sent", wrong for a lost guidance's words; corrected). The
   pre-push check in `work.spec.ts` that sent guidance after a lost Stop was rewritten deliberately: guidance first,
   then the Stop; the guidance named still open with no Try again past the Stop; the Stop's Try again the same
   operation. A probe run then reproduced UI-04 (`work.spec.ts:862`) with the r2 signature (lane titles read once right
   after load: an empty array); its two reads now wait for the board (`expect.poll`) with the same assertions.
   Mutation M-C (the fence removed) failed 2 browser checks and 3 unit tests; a first M-C attempt did not apply (its
   line had been reformatted) and is kept in the log marked invalid.
9. *After* captures again on the final source (20 states, desktop 1280×800 and 1440×900, narrow 390×844), then the
   affected browser suites, the full `pnpm check` and the Studio build on it (results in the manifest). These docs
   were written while those ran; they hold no executable source.

## r3 repair 1, as it happened

Review `INC01-DES-001-r3-SOURCE-PRE-PUSH-001` (SHA-256 `56a4434f…`) on `848f1105`: NEEDS_REVISION, three P1 and one P2.

1. The plan's repair section was written first (one derivation for all four, focus, readiness, seeds).
2. Fail-before on the exact `848f1105` source (worktree verified equal to it): four new checks through the real
   consumers, F01–F03 in Tasks on work-1 (the task whose route takes guidance) on the default named-attempt route, F04
   in Resources; all four failed for the reviewer's reasons (log `r3r1-fail-before.log`).
3. `work-control.ts`: `workState` replaces `controlOf` (every applicable control, the view's observed state, `covers`
   for a missing attempt); `SessionActs` takes `observed` and keeps the focus in its status line; `TaskActions` passes
   the task's lifecycle (the granted file, changed now); `sheetKeys` and the Resources row use the same derivation;
   `resource.ts` gains optional `assignment.runtimeControl` and `readiness`. Pass-after: 26 of 26 related checks.
4. Readiness summary and rows, tile line; fixture `readiness=1` and `seed=held|pending|unknown`. Lint asked to split
   `workState`, `pauseOf`, `readinessSummary` and the tile; done, not suppressed. One new seed check ran out of the
   default 30 s budget (nine page loads), not a product failure; given 120 s, it passed (kept in the log).
5. Mutations, each verified applied and restored byte-identical: the view's held state ignored (2 unit, 2 browser
   fail); only the latest control fencing (1 unit, 1 browser); an unnamed attempt read as another execution (3 unit,
   1 browser); focus not handed on (4 browser, desktop, Tasks and phone); sign-in ignored (1 unit, 1 browser).
6. Captures: 15 states before on the exact `848f1105` source (the repair stashed, the worktree verified equal to it,
   then restored and verified by hash) and the same 15 after; one scoped detector run (the pre-existing gradient only).
7. A first final browser run: 337 passed, 2 failed of 339. Both were r3's own checks catching a regression of mine:
   for a host offline or unknown the new summary repeated the host's line ("Host state unknown" twice in the sheet,
   "Host offline" under "HOST OFFLINE · 1 DAY" on the tile) and dropped "Sign-in and readiness not reported". The chain
   was stopped (its `pnpm check` would have run on superseded source; its partial log is kept). The summary now says
   "Waits for its host to reconnect" for an offline host and keeps "not reported" for an unknown one; the after
   captures were taken again.
8. The final browser suites, the full `pnpm check` and the Studio build ran on the final source (manifest). These docs
   were written while they ran; they hold no executable source.

## r3 repair 2, as it happened

Review `INC01-DES-001-r3-repair1-SOURCE-PRE-PUSH-001` (SHA-256 `a601a6b1…`) on `9c1ee251`: three P2 classes.

1. The plan's repair 2 section first. Fail-before on the immutable `9c1ee251` source (unchanged files verified): F06
   two pure tests, F07 one, F05 the actual Open work consumer (seeded held arrived Working, Hold offered), F06/F07 the
   visible `readiness=edge` check; the valid-observation sibling passed, as it should.
2. `workState` gains a structural `settled`; the Resources fixture's bridge carries `held=` from it and every retained
   control as itself (`retained=`), the Tasks fixture rebuilds them in its store (type-guarded); the readiness summary
   keeps four operation states; `freshness` checks the observation time and its limit. One r3 repair 1 unit test had
   pinned the collapsed wording ("No operation verified yet" for an unknown operation); it was updated deliberately.
3. r3's R3-01 check pinned Open work's exact URL; with `retained=` it now checks its parameters by meaning. Editing it,
   a cut removed its last four assertions (Held in Tasks, no Hold, nothing sent); they were restored from HEAD and the
   check diffed against HEAD to show only the URL change.
4. Mutations, each verified applied and restored byte-identical: the bridge ignoring the view's held state, or dropping
   the retained controls (the F05 browser check fails); unsupported collapsed (2 unit, 1 visible); the expiry-only
   check (1 unit; the visible check stays green because Grok's offline host outranks its invalid time); a future time
   taken as current (1 unit, 1 visible).
5. Captures: 9 states before on the exact `9c1ee251` source (repair stashed, worktree verified, restored by hash) and
   after. Then the final browser suites, `pnpm check` and the Studio build on the final source (manifest); these docs
   were written while they ran.

## Remaining obligations

- Independent whole-diff review before any push; automatic Codex review on every pushed commit; Luis's integration.
- Davide's candidate-specific design approval. Until then the UI change is held: no push, PR, Ready, merge or deploy.
- Chromium emulation is not physical Safari or touch hardware.
- r3 repair 1 bounds: the readiness projection and `runtimeControl` are the Studio's proposal; no service supplies them,
  so production shows the unknown states; the seeds prove the UI rebuilds from a retained record, not that a service
  retains or reconciles one: real binding, recovery, revocation and permission checks stay not run, with the backend
  owner. Lifecycles other than held and stopped (cancelled, superseded, complete, failed) don't fence here; the view's
  allowed actions still decide them.
- r3 gaps, disclosed: Open work's address names the work, not its assignment or generation (the router reads it,
  outside this scope), so Tasks shows the assignment it observes; there is no control-receipt view, so none is offered;
  Resume in Resources is `not_applicable` (no qualified Hold/Resume route; Tasks' Resume in the fixture is its simulated
  view's allowance); sign-in, operation profiles, funding route and a capacity policy aren't in the props, so they are
  said as not reported or left out, never made up; after a reload the fixture keeps no operation record (no service),
  so a lost Hold's uncertainty can't be shown surviving a reload here. While a Stop is under way Hold is still offered
  (the ruling fences guidance and input, not controls); the server-side fence remains the authority, these offers only
  stop the Studio from asking.
- No unresolved external effect: nothing reached a provider, account or production service.

## Next bounded action

The coordinator sends the exported bundle to the independent reviewer and presents the candidate to Davide. On
approval, the next consumer is INC01-S2: bind real `ResourcePanel` data in `ProjectShell` and add the readiness and
authentication observations C01-R05 names. This candidate's "not reported" line then shows what is observed.
