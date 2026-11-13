# Implementation-session handoff: INC01-DES-002

Goal and attempt: INC01-DES-002, the read-only native resource catalog in Resources, LOCAL candidate, attempt 1  
Human owner / executor resource: Davide / the dedicated Claude Code designer (cloud session)  
Native session: `session_01FGXfrKKdKs2Y9XbfrHzs3s`; coordinator Codex `01a1bd48-df51-7692-b30c-9e20f6eb4c81`  
Starting commit: local `52bd0aa39322b6445c47be8c129c05a675b82e51` (tree `2c2c23a6f3ef89b96da01780a189d155459e5f42`,
sole parent `185146bb`), from bundle `8435ffd2…551e`, in a separate worktree on branch `inc01-des-002-dev`.

State at this checkpoint (UX iteration 001): no candidate commit. The source is a staged tree in a worktree detached at
the accepted foundation `775e2271` (tree `b46c29a3`, parent `03716163`), its intended sole parent. The runtime's
auto-mode permission classifier refused the local signed commit three times ("[Destructive or Unwanted Actions]"), and
further attempts were stopped. No ordinary `pnpm check` has been run for this iteration; the staged-tree focused checks
are not one. A signed head and its ordinary run, if and when they happen, are recorded by the external final manifest,
not here. `27a634e0` and `49c36d9e` stay outside this work's ancestry. Nothing is pushed or published.
Earlier: repair 001's signed local replacement `27a634e0`, the sole child of `52bd`, with no ordinary run on that
rejected parent.

Assignment `INC01-DES-002-RESOURCE-CATALOG-LOCAL-001` (`3af90888…c0f6`); amendment
`INC01-DES-002-FIXTURE-TYPE-GUARDS-001` (`049d4290…b461`); parser study `6e5ad883…511b`; adapter plan `76e80cd8…bfa`.

## Outcome

**The read.** A51's member-safe catalog, read only, in the incumbent Resources view, behind
`VITE_SOPHIA_NATIVE_RESOURCES` (off by default).
- It reads through `callApi`'s `memberRead`, so a final 401, 403 or 404 is refused before its body is read, after the
  client's one renewal.
- It uses the reviewed generated parser, plus the relations the schema can't say:
  - complete exactly when no cursor follows;
  - `isYou` exactly when the owner is the token's subject, and `mine` only then;
  - recorded operations as a set in order, empty exactly with no record;
  - ids ascending past the cursor.

**The view model.** Rows map to the view's `Resource` with sessions, account and controls null (not reported) and the
host unknown. The owner's recorded host, connection and qualification are kept apart, in `catalog.mine`, with each
page's observation time.

**One read's state.** It is fenced by generation:
- A refusal on any page clears every row, count and the sheet, and moves the generation on, so a late answer for an
  earlier read is never taken.
- Only Try again, or a new account or project (a remount), reads again.
- No query cache is used, and nothing is kept in the browser.

**States.** Loading, observed empty, complete, More, partial (failed or inconsistent), failed, unavailable (503
`projection_unavailable`) and refused (401; 403 or 404). Each is distinct, said in words, with no "Coming" and no
promise.

**What a catalog row says:**
- Sessions, capacity and controls: "not reported" or "not offered". The head says "requests not reported".
- Filters: only All and Mine.
- Owner: an unknown name with a neutral mark, and "Former member".
- A teammate reads "Its host and connection details are private to its owner."
- The owner reads their recorded facts as recorded, never as online, signed in, ready or supported.

**App.** The fourth default argument of `viewsShown` and `shownView` shows Resources under the flag, with the frozen
`ViewNav` and `ProjectShell` unchanged. `SignedIn` mounts `ProjectResources` keyed by account and project.
`api/needs.ts` is unchanged, so a permission wait still goes to Work.

## Changed (34 leased paths; the actual set is in the manifest)

The reader and its tests; the mapping and its tests; the container; `resource.ts`, `status-words.ts` and their tests;
`ResourcePanel`, `ResourceTile`, `ResourceSheet`, `SessionActs` and `OwnerAvatar`; `away` and `room` with their tests;
`resources.css`; `plan.ts` (the nullable-sessions guard only, as a helper); `SignedIn`, `route.ts` and `route.test.ts`;
`app/native-resources.ts`; `vite-env.d.ts`; the new fixture page; the two new specs; the plan; this file. The three
fixture guard paths are listed in the plan's amendments.

## As it happened

1. **Bundle and base.** The bundle and identities were verified. `52bd` holds `f4240d71`'s Resources bytes, plus one
   extra lane wait in `work.spec.ts:813` from another slice. The plan was written before code (its hash is in
   `des002-00-plan-before-code.log`).
2. **Lease widening.** Nullable sessions broke three frozen fixtures. I reported that before touching them, and root's
   amendment added them for guards only.
3. **Changes made while working:**
   - A misplaced room test split an existing one (a ReferenceError in its run); it was moved after that test.
   - Lint required a reducer split, extracted panel head and lines, a shorter tile, module-scope test helpers and a
     table-driven fixture responder.
   - Two corrections came from looking at the page: the tile host label was shortened, and capacity in the sheet is
     said as not reported.
4. **Fixture spec, run 1:** 9 passed, 8 failed, kept.
   - The dev page's StrictMode asks the first page twice, as designed, so the counts now check that no read follows.
   - The inconsistent page was refused by the reader first, so the case now uses an empty incomplete page.
   - The "Davide" check was page-wide and is now scoped to the view.
   - The account switch expected the next page's rows; it now expects Luis's first page.
   - **Run 2:** 17 passed.
5. **App spec, run 1:** 2 passed, 1 failed, kept. The fixture servers set the vision flag, which shows every view, so the
   checks now load with `vision=off`. **Run 2:** 3 passed.

Units, mutations, browser checks on the commit, the Impeccable check and the captures: see the manifest.

## Repair 001, as it happened (DES002-F01)

The same reviewer's owned-34 study of `49c36d9e` (`6500589f…bf9a`) found one P2. An empty first page that says more
follows was rightly read as partial, yet the panel's body said "No tool is enrolled for this project yet." beside the
partial line. Assignment `INC01-DES-002-LOCAL-REPAIR-001` (`c0ab29c2…6fd7`) allowed five paths. `49c` and its packet are
kept as they are, outside the replacement's ancestry.

1. **Plan first:** this plan's repair 001 section (`des002r1-00-plan-before-code.log`).
2. **Fail-before, on `49c`'s unchanged panel.** A new fixture case `emptyfirst` and five spec cases: 2 failed by
   assertion (the desktop and phone regressions found no incomplete notice) and 3 controls passed (complete empty, the
   known-data empty panel, later-page partial rows).
3. **The repair, in `ResourcePanel.tsx` only.**
   - With no rows, the body asks the catalog how far it was read. Not complete: "The resources couldn't be read in
     full, so none is shown.", its time, and Try again (a new read). Complete, or a non-catalog source: the incumbent
     empty words.
   - The head's count is "–" then, and the partial line under the tiles shows only with rows.
   - The reducer, reader, flag and container are unchanged.
4. **A page after a complete one** (plan clarified, no behaviour change): the container can't ask for More once a read
   is complete. The reducer takes a page only where it was asked for, so an unsolicited or duplicate success after
   completion is ignored, keeping the completion coherent.
5. **Checks:** a reached mutant, then focused checks and a new packet recaptured from the committed replacement, in its
   manifest.

## UX iteration 001, as it happened (on 775)

Davide reviewed `27a634e0` (`Sophia_UI_27a634e0_Review.md`, `d5c52859…7966`), and assignment
`INC01-DES-002-UX-ITERATION-001` (`c93d5be8…df5e22c`) asked for its UX01–05 polish, with UX06 kept, on the accepted
foundation `775e2271`. The reviewer's read-only preparation (`bbabd5da…a517`) named the controls to prove.

1. **Inputs and transplant.**
   - All 13 inputs hash as `INPUT-SHA256.json` says. The bundle (`056cc81b…555`) verified, needing only `953e5dc3`, and
     its one head `775e2271` was imported to a local ref only.
   - In a fresh public worktree at `775`, `27`'s exact 34-path patch (`81c3756d…eb8c`) applied with only the three
     known trailing-space warnings. It gave tree `2fbce9c4`, with all 34 modes and blobs equal to `27` and nothing else
     changed. The frozen tree `ef46e7f4`, RTA blob `96b91d9e` and contracts subtree (equal to `52bd`'s) are unchanged.
   - Node 24.21.0 (pinned binary `7fde7b8a…`) and pnpm 11.7.0 are public, with its own frozen install.
2. **Plan first:** this plan's UX iteration 001 section and its addendum, logged before code.
3. **The polish**, in the same 34 paths:
   - The catalog's scope line at every width, in every state.
   - The sheet's meaning-first order, with the owner's evidence closed and a teammate's absent from the page.
   - "Search tools or owners…", "3 loaded", and no-match said of the loaded rows, with More or Try again.
   - The partial cue before the toolbar and tiles, once.
   - A final 401's Sign in again through `SignedIn`'s existing sign-out.
   - Accurate enrollment guidance under an observed empty catalog.
   - The reducer, reader, parser, flag, page order, refusal and generation fences are unchanged.
4. **The settled project.** The app check's fetch wrapper had looped through the app fixture's own fetch layer, which
   kept the old captures at "Loading…" and "Connecting". Made depth-aware, the project settles and its call is joined.
5. **Fail-before** on the unpolished transplant (27's product blobs):
   - The first run used the specs as they then were, before the app spec was split into functions for lint (same
     assertions; the fixture's bytes final). All 13 selected tests failed: 9 by assertion and 4 by timeout on a locator
     only the polish adds.
   - A second run on the final app spec failed 4 of 4: 2 by assertion and 2 by timeout.
   - The product files were restored byte for byte after each run.
6. **Recovery isn't lossless.** Sign in again is the account menu's own sign-out of this device. It forgets unsent words
   and ends a call, as it always has. Back in, the catalog is read anew and no call is joined by itself.

7. **Chronology after the polish, as it happened.**
   1. The 13 polish paths were staged into tree `579ac1d5`.
   2. The three signed-commit attempts were refused, as above, and stopped.
   3. On `579ac1d5`: three reached mutants, then focused unit, static and browser checks and a Studio build.
   4. An early source-only checkpoint of `579ac1d5`, and a tree-labelled visual packet captured from it.
   5. The same reviewer studied `579ac1d5`, found no runtime source blocker, and asked for two documentary corrections:
      this section's opening state and the plan's UX05 wording.
   6. Only those two documents changed afterwards, staged into a new docs-only tree; every other path is
      byte-identical to `579ac1d5`.
   - None of this is a committed candidate, an ordinary run, a PRE or a design decision. The staged-tree unit (205) and
     browser (185) runs and the build belong to `579ac1d5`'s bytes.

## REC01, Sign in again asks first, as it happened (a child of `8c1077b3`)

Davide accepted `8c1077b3` as the bounded read-only catalog design. It is published as PR #511 and stays there
unchanged. He required Sign in again's consequences to be explicit and cancellable before routine activation.
Assignment `INC01-DES-002-REC01-SIGNIN-CONFIRMATION-001` (`1f16a692…f25e`) leased five paths. The work is on the local
branch `inc01-des-002-rec01`, in a fresh public worktree at `8c1077b3`.

1. **Plan first:** the plan's REC01 section, logged before code.
2. **The change, in `ProjectResources.tsx` only.** After a final 401, Sign in again is the kit's existing
   `ConfirmButton`. Pressed, it says that signing in again signs out this device, ends any call, and removes everything
   unsent on this device: drafts and messages in projects and in the personal space. That copy matches what App's
   `leaving` forgets, even when sign-out fails. It offers Stay here (focused) and Sign out and continue. Only the latter
   calls the same `onSignIn`, once. Nothing else changed: no SignedIn, App, auth, kit or CSS change. Default-off is
   exact.
3. **The app check finds its drafts.**
   - The personal composer can't be typed into in the fixture app, because the fixture doesn't serve the personal
     space. That attempt failed and is kept.
   - The Studio chat draft doesn't survive leaving the Studio view, which is existing behaviour.
   - So the check types into a project conversation's composer, which keeps drafts across views while the Studio is
     open and is forgotten on sign-out. That needs the fixture's own views flag on; only the read flag decides
     Resources.
   - It also seeds the project view's stored draft, as app-auth's checks do.
   - The join needed the Studio settled and up to 15 s. The first runs, failing on these points, are kept.
4. **Fail-before** on `8c1077b3`'s product with the final tests: 4 of 4 failed by assertion (no confirmation group),
   with no timeouts. Restored byte for byte.
5. **What it shows.**
   - Stay here, or leaving for another view before answering: no sign-out, no read, the call live with its switches,
     and the typed words still in their composer and the stored draft byte for byte.
   - Sign out and continue: one sign-out of this device only; both drafts gone; no row; the sign-in at the same
     address. Back in: a fresh read, no call joined by itself, the composer empty.
   - The failed sign-out asks first too, and its drafts go even so.

## REC01-F01, each test worker owns its flagged server, as it happened (a child of `06bee5c1`)

#512's CI failed `signOutFails` on `06bee5c1` before any product assertion: `ERR_CONNECTION_REFUSED` to `5197` at its
first `page.goto`, 0.3 s after the other worker's last flagged test passed. The local c0ec run failed the same test, and
its isolated rerun passed; both runs used 2 workers. Assignment `INC01-DES-002-REC01-F01-PARALLEL-SERVER-LIFECYCLE-001`
(`54f77e21…a0`) leased three paths. The work is on the local branch `inc01-des-002-rec01-f01`, in a fresh public
worktree.

1. **Plan first:** the plan's REC01-F01 section, logged before code.
2. **The cause, witnessed** (on `06bee5c1`'s spec, unchanged).
   - **Old-lifecycle witness** (the spec's exact spawn, disposable port 5297):
     - The second worker's own child exits (code 1, port taken), and its readiness passes anyway on the first
       worker's server.
     - The owner's `server.kill('SIGTERM')` reaches only the outer `pnpm`. The inner `pnpm` and `vite.js` outlive it.
   - **The spec itself, with an unrelated unflagged server already on 5197 and 5195:** all 7 flagged tests ran on that
     borrowed listener and failed: 5 by assertion, 2 by a locator timeout.
   - CI's exact PID sequence stays unproven; its pnpm launcher differs.
   - The shared `.vite-app` cache (frozen config) is recorded as a possible contributor, unproven.
3. **The repair, in the spec only.**
   - Each worker starts its own server with `--port 0 --strictPort` in its own process group and reads the address its
     own process prints.
   - It is ready only while that process runs and serves the app and the flagged module (`"1"`).
   - It fails clearly, with the cause and a bounded tail of its own output, and never borrows another listener.
   - Teardown stops its own group only (SIGTERM, then SIGKILL, bounded).
   - The fixed ports are gone. Parallelism, retries, timeouts and every assertion are unchanged.
4. **Reached.**
   - **With the same decoys present:** 7 of 7 flagged tests passed on 2 workers. The monitor saw two owned listeners
     at once (43413 and 33477, then 40115 and 40613), one stopping while the other served, and none after. The decoys
     were untouched.
   - **A start that can't happen** (no `pnpm` on the workers' path): "could not start: spawn pnpm ENOENT", with
     nothing borrowed and nothing left running. The first attempt never ran the test: the harness lost
     `/usr/bin/timeout` from the narrowed path (exit 127). It is kept.

## Remaining obligations

- The independent whole-actual source and pre-push review of this UX iteration candidate on `775`.
- Davide's explicit design decision on this exact candidate. The new states and the app's Resources are significant,
  and neither `1164e75d` nor any decision on `27a634e0` covers them.
- `775` itself is published as PR508, open and unmerged. This candidate depends on it.
- A real API and PostgreSQL crossing, and native or owner app qualification, are later gates; none is credited from the
  synthetic API.
- No push, publication, activation, account permission or provider, native or service effect was made.
