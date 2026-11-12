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

## Remaining obligations

- The independent whole-actual source and pre-push review of this UX iteration candidate on `775`.
- Davide's explicit design decision on this exact candidate. The new states and the app's Resources are significant,
  and neither `1164e75d` nor any decision on `27a634e0` covers them.
- `775` itself is published as PR508, open and unmerged. This candidate depends on it.
- A real API and PostgreSQL crossing, and native or owner app qualification, are later gates; none is credited from the
  synthetic API.
- No push, publication, activation, account permission or provider, native or service effect was made.
