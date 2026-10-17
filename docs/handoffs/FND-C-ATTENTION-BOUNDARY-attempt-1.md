# Implementation-session handoff

Goal and attempt: FND-C-ATTENTION-BOUNDARY-01 (Home's needs, A15, and a project's Updates, A34, without the vision
flag), attempt 1
Human owner / executor resource: Davide (assignment, relayed from P) and Luis (UI, merge) / Claude Code lane C, the
session of the C2–C5 layers (transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-attention-boundary`, branch
`ui/attention-boundary-20261017`, from the retained C2b head `6d4585a304617b4bbb9eb6b63317e1633776ef06` (tree
`ca645f23…`). The C2b worktree `sophia-updates` and every later C seal are untouched. This branch is not combined source.
Writable scope:
- the Studio env flag (`vite-env.d.ts`) and its reader (`app/attention.ts`);
- the Needs gate (`useNeeds.ts`) and the Updates view's gates: `route.ts` `viewsShown`/`shownView`, their callers in
  `ProjectShell.tsx`, `ViewNav.tsx` and `SignedIn.tsx`, and `UpdatesView.tsx`'s Meetings half;
- focused tests, and this record.

No API, SQL, migration, amendment, contract, dsh, native, lock, SDK or model change.
Runtime unit: Davide's macOS host; node 24.21.0, pnpm 11.7.0. No browser, no PostgreSQL.
Existing authority: P's FND-C-ATTENTION-BOUNDARY-01 (C-attention-boundary-source-packet-v1.txt), relayed by Davide.
Ending commit/tree: the commit this record is in (head and tree in C-attention-boundary-preparation-handback.txt).

## Outcome

- **`VITE_SOPHIA_ATTENTION=1`** (default off) shows, without the vision flag:
  - Home's «needs you» (A15's `GET /me/needs` and the reply's seen mark), as the vision flag did;
  - the project's Updates view (A34's `GET /since` and Mark as seen): in the nav, in the commands, and at its address.
- **It shows nothing else.** Conversations and Resources stay «Coming». Updates' Meetings half (A12's `listMeetings` and
  its recap sheet, not served) shows only under the vision flag. Plans, decisions, decks, recaps, voice, search (A13),
  CarriedIn and every other `VISION` gate are unchanged.
- **The vision flag is unchanged:** every view, and Updates with its meetings.
- **Not verified:** the Studio in a browser with the vision flag off (owed, after P grants a slot), against the real
  API, production and live accounts.

## Evidence

- **Focused tests** (`node --test app/route.test.ts app/attention.test.ts`):
  - `route.test.ts`, one new case: `viewsShown(false, true)` is the served views plus Updates; `(false, false)` is as
    before; under vision every view whatever the attention flag. Addresses to Conversations and Resources still open
    the Studio.
  - `attention.test.ts`, 5 cases:
    - the flag is off unless the build sets it;
    - it is read only in `SignedIn.tsx`, `useNeeds.ts`, `ProjectShell.tsx` and `ViewNav.tsx`, at the exact gates named
      above;
    - `UpdatesView` receives `meetings={VISION}` and reads neither flag itself.
- **Before** (the same test files on 6d4585a3's source): 12 tests, 10 pass, 2 fail. Without the flag argument,
  `viewsShown(false, true)` has no Updates, and `attention.ts` does not exist.
- **After:** 16 of 16 pass.
- **Studio units:** 1278 of 1278 pass, 0 skipped. `format:check`, `lint` and `typecheck` all exit 0.
- **Not run:** DB, native, artifacts, the full unit suite, browser.

## Decisions and changes

- **One flag argument, defaulting to off:** `viewsShown(vision, attention = false)` and `shownView(view, vision,
  attention = false)`. Under vision the result is unchanged; without it, only `updates` joins the served views.
- **Needs' default is a module constant** (`NEEDS_SHOWN = VISION || ATTENTION`). Inline, `||` took `useNeeds` past the
  complexity limit.
- **The Meetings half is a prop** (`meetings`), decided where the view is mounted, so `UpdatesView` stays flag-free.
- **The actor stays the account's.** The query cache is per account (`account-cache.ts`, App's `useAccountCache`), and
  each project shell is keyed by account. Needs' key carries the token's subject. No key changed.
- **Existing Updates behavior is kept as written:** the reader's window, a refused or failed read («What changed
  couldn't be read», Try again), «This may be out of date» beside cached rows, and Mark as seen with its own words on
  failure.

## Remaining obligations

- **B, before the switch** (docs/plans/project-updates.md, the narrow activation gap, 1–2):
  - `parseDigest` (`api/vision.ts`) still requires strings where A34 allows null (`proposedBy`, `decidedBy`, `at`,
    `askedBy`). Against the real API, a window with a null fails to parse and shows «What changed couldn't be read».
  - `more` is not shown.
  - Neither is in this scope (`api/vision.ts` is not a gate); not changed.
- **Browser proof, owed:** the normal App or a strict fixture with the vision flag OFF and this flag on. Only after P
  grants a slot, and not the broad `VISION=1` fixture. B's combined head later proves A15 and A34 from the normal App
  against the listening API.
- **Small, left as is:**
  - Home's comment in `Places.tsx` still says «the vision flag» (outside the write scope).
  - The palette's other words for Updates include «recap»: a search word only, it opens the digest.
- B integrates; Luis accepts the UI; R reviews. No clearance is claimed here.

## Next bounded action

- P grants a slot for the vision-off browser proof, or B takes this delta into the combined source.
