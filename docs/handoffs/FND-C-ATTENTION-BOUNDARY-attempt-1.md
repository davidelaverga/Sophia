# Implementation-session handoff

Goal and attempt: FND-C-ATTENTION-BOUNDARY-01 (Home's needs, A15, and a project's Updates, A34, without the vision
flag), attempt 1, and its closure FND-C-ATTENTION-A34-CLOSURE-01 (A34's nullable window and `more`, and the browser
proof)
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
- The closure adds:
  - `api/vision.ts`'s «since» read and types, and Updates' read and render (`updates-view.ts`, `recap-view.ts`'s
    line builder, `UpdatesView.tsx`);
  - the browser harness: `vite.served.config.ts`, `playwright.served.config.ts`, `e2e-served/`, `tsconfig.json`'s
    includes, `fixtures/attention-data.ts`, `fixtures/app.tsx`'s `attention=a34`, and `app-auth.spec.ts`'s matching
    `appFixture` declaration.

No API, SQL, migration, amendment, contract, dsh, native, lock, SDK or model change.
Runtime unit: Davide's macOS host; node 24.21.0, pnpm 11.7.0; headless Chromium on 5198/5199 (P's grant, closure only).
No PostgreSQL.
Existing authority: P's FND-C-ATTENTION-BOUNDARY-01 (C-attention-boundary-source-packet-v1.txt) and
FND-C-ATTENTION-A34-CLOSURE-01 (C-attention-A34-closure-packet-v1.txt), relayed by Davide.
Ending commit/tree: the commit this record is in (head and tree in C-attention-boundary-preparation-handback.txt, then
C-attention-A34-closure-handback.txt).

## Outcome

- **`VITE_SOPHIA_ATTENTION=1`** (default off) shows, without the vision flag:
  - Home's «needs you» (A15's `GET /me/needs` and the reply's seen mark), as the vision flag did;
  - the project's Updates view (A34's `GET /since` and Mark as seen): in the nav, in the commands, and at its address.
- **It shows nothing else.** Conversations and Resources stay «Coming». Updates' Meetings half (A12's `listMeetings` and
  its recap sheet, not served) shows only under the vision flag. Plans, decisions, decks, recaps, voice, search (A13),
  CarriedIn and every other `VISION` gate are unchanged.
- **The vision flag is unchanged:** every view, and Updates with its meetings.
- **Closure: Updates reads A34 as it is served.**
  - Outside the vision flag, `getSince` reads through the contract's own parser (`parseProjectUpdates`).
  - A window whose people or moments are null reads and shows:
    - nobody named is said as no one: no «proposed by», «decided by» or «asked by», never «a member»;
    - a missing moment is not said.
  - A wire that breaks the contract is still refused: no `more`, a field missing, a wrong kind, an id that is no
    actor's. A field the contract doesn't list is dropped, as the contract's reader drops it (`removeAdditional`).
  - `more` is said honestly: «This is only the first part of what changed: mark it as seen to read on.» (or, never
    looked, «You haven't looked before. This is only the first part…»). Never «everything so far» or «Nothing new».
  - Mark as seen is offered for such a window even with nothing listed, since that is how the next one is read. There
    is no pagination and no new request.
  - Under the vision flag the fixture pages' proposed shape is read as before.
- **Not verified:** the real API (B's combined head), production and live accounts.

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
- **Not run** (boundary attempt): DB, native, artifacts, the full unit suite, browser.
- **Closure, units** (`features/updates/updates-served.test.ts`, 5 cases):
  - a valid window with nulls and `more` read as it is;
  - the refusals above;
  - the lines' words with nobody named or no moment;
  - the person narrowing;
  - the bounded lead.
  - Before, on 9904667e's source: 0 of 5 (nulls refused as a contract violation, a missing `more` accepted, «a member»
    and `id: null` people, «everything so far»). After: 5 of 5.
  - Studio units 1283 of 1283; `format:check`, `lint` and `typecheck` exit 0. `recap-view.test.ts` is unchanged and
    passes: recaps read as before.
- **Closure, browser** (`e2e-served/attention-served.spec.ts`, 5 cases). The normal App (`fixtures/app.tsx`), signed in
  by the synthetic Auth service, with the fixture's API in the page and strict A34 windows for each account. Built with
  VISION=0 and ATTENTION=1 on 5198, and with neither flag on 5199.
  - Home's «Needs you» is read for who is in.
  - The views are Studio, Goals, Tasks, Knowledge and Updates; Conversations' address shows the Studio. No Meetings
    heading.
  - Nulls are said as above, `more` is noticed, and Mark as seen writes 12 then 15, reading on to «Nothing new».
  - Another account (no member) coming in, in another tab, is refused («What changed couldn't be read»), with nothing
    of the last account's window shown and nothing marked.
  - Off: no needs read, no Updates view, no `/me/needs`, `/since` or `/seen` request.
  - After every case: no request leaves the two servers; nothing unexpected; no meeting, recap, so-far, search, focus or
    source-origin request.
  - Before, the same harness on 9904667e's source: 3 of 5; the null window says «What changed couldn't be read». After:
    5 of 5, then 10 of 10 with `--repeat-each=2`.
- **Closure, VISION regression** (the fixtures' config, VISION=1), on the Updates, digest, recap and so-far specs and
  `app-auth.spec.ts`: 67 of 72.
  - 4 of the 5 failures fail the same way on 9904667e: `updates-digest.spec.ts:70` (a date tied to the host's time
    zone), and app-auth's palette, veil and ⌘K cases.
  - The fifth, app-auth's «keeps only theirs», timed out on the first signed-in render under the parallel load. It
    passes 4 of 4 alone with these changes, and 1 of 1 on the base: a load flake, not claimed as a pass.

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
- **Closure:**
  - **One read, two parsers by the vision flag** (`parseSince`), as C4's served search did. The contract's validator is
    strict (UUIDs, no other fields), and the fixture pages' proposed data would not pass it.
  - **`Since`** is A34's `ProjectUpdates`, with `more` optional for the fixtures. `Records` lets a line's people and
    decided moment be null; a recap's, all strings, read as before.
  - **The harness extends the existing app fixture** rather than adding a framework; its served config follows C4's
    and C5's. When B combines them, one `vite.served.config.ts` and one `e2e-served/` take every served flag.

## Remaining obligations

- **Closed here:** the parser and `more` (docs/plans/project-updates.md, the narrow activation gap, 1–2), and the
  vision-off browser proof on fixtures.
- **B's combined head:** prove A15 and A34 from the normal App against the listening API and restricted PostgreSQL,
  with the current names and the current canonical 0058. This fixture proof is not that.
- **No flag activation is claimed or authorized here.**
- **Small, left as is:**
  - Home's comment in `Places.tsx` still says «the vision flag» (outside the write scope).
  - The palette's other words for Updates include «recap»: a search word only, it opens the digest.
- B integrates; Luis accepts the UI; R reviews. No clearance is claimed here.

## Next bounded action

- R reviews; B takes this delta into the combined source.
