# INC01-DES-002: the read-only native resource catalog in Resources (LOCAL candidate)

Written before the code. Assignment `INC01-DES-002-RESOURCE-CATALOG-LOCAL-001` (SHA-256 `3af90888…c0f6`).
- **Base:** local `52bd0aa3` (tree `2c2c23a6`, sole parent `185146bb`), from bundle `8435ffd2…551e`.
- **Parser:** accepted by its owned-seven study (`6e5ad883…511b`) only as a local slice.
- **Basis:** the designer's adapter plan `76e80cd8…bfa` (P01–P06), with the assignment's corrections.
- **What this is not:** the base's parent `185` still has a confirmed funding-capacity P1. This is local UI development
  only: no prefix, publication, release or activation acceptance. The final bytes are rebound later onto the accepted
  coherent and parser base.

## What it builds

A51's `GET /api/v1/projects/:projectId/native-resources` read into the incumbent Resources view, read-only, in the
approved 1164 geometry.
- **No new controls:** no account enrolment, contribution editor, control or effort.
- **No invented facts:** no runtime readiness, account, session, assignment, model, capacity or required action.
- **App mount:** in the signed-in app behind a new read flag, `VITE_SOPHIA_NATIVE_RESOURCES`, off by default.
- **Preview:** a synthetic preview of every material state.

## The reader (`api/native-resources.ts`)

**The call.** `callApi(path, { token, method: 'GET', memberRead: true, signal }, read)`.
- `memberRead` (already in the base, the accepted `134eaf20` client) refuses a final 401, 403 or 404 before the body
  is read. `apiFetch` still renews a refused token once.
- Timeouts and aborts are the client's own. No client edit.
- The path is `/api/v1/projects/${projectId}/native-resources`, plus `?after=<nextCursor>` sent verbatim.

**The parse function** applies the reviewed generated `parseProjectNativeResourcePage`. That parser is tolerant: it
drops unknown extra properties, and fails on unknown enums, wrong types, bad UUIDs, bad dates and bounds. On top of it,
the relational checks the schema can't express. Any failure throws, so the client reports `contract_violation`.
Nothing is filtered and nothing becomes an empty page.
- `complete === (nextCursor === null)`.
- `owner.isYou === (canonical(owner.id) === canonical(subject))`, where the subject is the token's own.
- `mine !== null` exactly when `owner.isYou`.
- `operations` duplicate-free, in create, input, stop order; empty exactly when `state === 'none'`.
- Row ids strictly ascending, each greater than the requested `after`. A `nextCursor` greater than `after`.

`canonical(id)` is the id's last 36 characters in lower case: A51's one spelling, which sorts as the server's UUID
order. It is used only to compare; the wire values are kept as sent.

## Mapping and pages (`features/resources/native-catalog.ts`, pure)

**One A51 row becomes one `Resource`:**

| Field | Value |
|---|---|
| tool | `claude` → `claude-code`; `codex` unchanged |
| owner | `{ id, name: label or 'Unknown name', named, former: !isMember }`; the name stays a string, so `TileGrid`, `order.ts` and `away.ts` read it unchanged; no raw id is shown |
| not reported (null) | `entitlementId`, `sessions`, `controls` |
| host | `{ state: 'unknown', observedAt: null }`, never said for a catalog row (below) |
| other | `readiness: null`, `reservePercent: null` |
| `catalog` | `{ state, observedAt: <its page's>, mine }`; `mine` is the owner's recorded connection, host and qualification as A51 gives them, null for everyone else |

- **Qualification.** The server's state at that page's `observedAt`. It is never recomputed from `qualifiedAt`,
  `expiresAt` or a clock.
- **Times.** A null `lastSeenAt`, `secondsSinceSeen`, `qualifiedAt` or `expiresAt` stays unknown. It is never "never",
  "unlimited", "fresh" or 0, and no invalid date or NaN is drawn.

**Pages are independent observations,** merged in order. Each row keeps its own page's time. The More read sends
`after` = the last page's `nextCursor`. The read stops as partial, keeping the rows read before, never complete or
empty, on any of:
- a duplicate id across pages;
- a cursor seen before (a cycle);
- a cursor not past the last;
- an empty page that isn't complete;
- a page after one that was complete;
- any failure of a later page that isn't a refusal.

**One state, one reducer.** No query cache is used at all, so nothing cached can come back.
- The state is scoped to the token's subject and the project, and every request carries its generation.
- A response applies only to its own generation.
- A final 401, 403 or 404, on any page, clears every page, row, count and the open sheet in that same update, and moves
  the generation on. So an older 200 arriving later is refused.
- Only an explicit new read (Try again, or a new project or account, which remounts it) starts a new generation.
- Its requests are aborted when it ends.
- Nothing goes to localStorage: the panel's away glance and its saved filter and order are off for the catalog.

**States, each distinct:**

| State | Shown |
|---|---|
| Loading | the incumbent skeleton |
| Observed empty (complete, no rows) | the incumbent "No tool is enrolled for this project yet…" |
| Complete | the tiles |
| More | the tiles and "More resources" |
| Partial | the tiles read, and "Couldn't read the rest of the resources" with the time they were read, and Try again |
| Failed (any other first-page failure, a timeout or a contract violation) | "Couldn't read the resources." and Try again |
| Unavailable (first-page 503 `projection_unavailable`) | "Resources can't be read here right now." and Try again; no "Coming" and no promise |
| Refused (401) | "Your session has ended. Sign in again to read the resources." |
| Refused (403/404) | "This project's resources can't be read with your access." |

A refusal is never repeated by itself.

## What a catalog row says

- **Not reported:** the tile says "Sessions not reported", never "No assignment". The sheet's Sessions say so; its
  Controls say "Controls aren't offered from this view"; capacity stays "Capacity unknown"; readiness stays "Sign-in and
  readiness not reported".
- **Head.** No "nothing waiting" or zero: it counts the resources recorded and says "requests not reported".
- **Filters.** Only All and Mine: Waiting and Online would count facts A51 doesn't report.
- **Nothing to send.** No `onAct`, `onEffort`, Resume, GO, attention line or `resourcesWaiting` count.
- **Unknown name and former member.** A neutral avatar for an unknown name; "Former member" said.
- **A teammate** (`mine: null`) reads "Its host and connection details are private to its owner". No owner fact is
  drawn.
- **The owner** reads only what is recorded:
  - "Host bound" or "active", with "last seen 4 min before this reading" from `secondsSinceSeen`;
  - "Last seen time not recorded in a usable form";
  - "No bound host recorded";
  - "A conflict is recorded";
  - the connection's state, with linked but expired said as expired;
  - "Recorded qualification: current for create, input and stop, as of …: recorded evidence, not a promise that a
    control works", or expired, revoked, stale, or doesn't apply now. `none` shows nothing.

  None of it ever reads as online, signed in, ready or supported.
- **Per row:** its state (needs a connection, revoked), and "As read at …" with its page's time.
- **Known data:** non-null values keep every existing behaviour, command, id and word.

## App mount

- **The flag.** `app/native-resources.ts`, `NATIVE_RESOURCES = env.VITE_SOPHIA_NATIVE_RESOURCES === '1'`, with one
  `ImportMetaEnv` field. It never comes with VISION, and grants no write or backend permission.
- **The route.** `route.ts` gives `viewsShown` and `shownView` a fourth optional argument defaulting to that flag, so
  the frozen `ViewNav` and `ProjectShell` show Resources under it without edits, and `attention.test.ts`'s exact lines
  stay as they are.
- **SignedIn** passes `resources={NATIVE_RESOURCES ? <ProjectResources …/> : undefined}`, keyed by account and project.
- **Flag off:** navigation is exactly as before, and the catalog is never mounted or read.
- **Required actions.** `api/needs.ts` keeps sending a permission wait to Work: A51 reports no required actions.

## Paths, verification and design

- **Paths.** The 31 of the lease; everything else frozen. The planning file gets only its nullable-sessions guard. CSS
  adds only the catalog's read, partial, More, unknown-avatar and private and recorded states, with the incumbent tokens.
- **Preview.** `fixtures/native-resources.{html,tsx}`, an isolated page whose fetch answers the catalog read from the
  address, synthetic and labelled; the shared fixtures are untouched.
- **Browser specs.**
  - `e2e/native-resources.spec.ts` covers desktop 1280 and phone 390: keys, focus, Escape, More and Try again; the
    owner's DOM against the teammate's; unknown name and former member; every server state; renewal and refusal with
    never-ending bodies; a page-2 refusal and a late 200; a project or account switch; partial, stale, complete-empty,
    failed, unavailable and loading.
  - `e2e/app-native-resources.spec.ts` covers the signed-in app with synthetic read responses: flag on, on its own
    server, and the default off, with no catalog request.
- **Units:** reader, mapping, merge, fence and the null model. The affected known Resources, control and planning
  checks are re-run.
- **Mutants.** Reached-guard mutations only for the new privacy and pagination classes.
- **Not run:** no full ordinary run on this rejected parent. A real API and PostgreSQL crossing, and native or owner app
  qualification, are later gates.
- **Impeccable.** Only the reviewed pinned setup (`924bbd19`, engine 0.1.19 `07b763dc`). Any scoped check keeps its
  command, source, exit and warnings.
- **Design.** The new states and the app's Resources are significant and not covered by `1164e75d`. The candidate holds
  for Davide's approval, with an accessible packet: desktop and narrow before and after PNGs, the diff and one ZIP.

## Amendments during implementation

- **Fixture type guards.** `FIXTURE-TYPE-GUARDS-001` (`049d4290…b461`) added three paths, for nullable-sessions
  compatibility only: 34 paths in all. Each changed read keeps null in a mapping and adds no session from a null list.
  Known fixture data, commands, ids and words are unchanged.
  - `fixtures/resources.tsx`: `unfenced`, `seeded`, `since=1`'s glance and `withSession` map `r.sessions?.map(…) ??
    null`; the reviewer lookup, `carriedState` and `advanced` select from `r.sessions ?? []`.
  - `fixtures/work-live.ts`: `withActivity` and `nextActivity` map `r.sessions?.map(…) ?? null`.
  - `fixtures/demo-work.ts`: `toldSession` takes `NonNullable<Resource['sessions']>[number]`; `demoResources` maps
    `r.sessions?.map(toldSession) ?? null`.
- **Capacity in the sheet.** For a catalog row the sheet says "Capacity isn't reported for this tool yet." The frozen
  `CapacityBlock` says "never observed" with no observation, which would say it was looked for.
- **Tile host label.** "Host recorded", "No host" or "Host private": short enough to leave the tool's name whole, and
  never the recorded state, which a tile could read as online. The sheet says the state, as recorded.
- **Where pagination faults are caught.** A row repeated across pages, or a cursor not past the last, is refused first
  by the reader, because each page's ids must be past the cursor it was asked with. It is a contract violation, so a
  later page reads as "Couldn't read the rest". The merge's own checks stay as a second line of defence. The browser
  check of an inconsistent page uses an empty page that isn't the last, which only the merge catches.
- **Vision off for the app checks.** The fixture servers set the vision flag, which shows every view. The app checks
  load with `vision=off`, as production shows the views, so only the read flag decides Resources.

## Repair 001: an empty first page that isn't complete is never "no tool enrolled" (DES002-F01)

Written before the repair's code. Assignment `INC01-DES-002-LOCAL-REPAIR-001` (`c0ab29c2…6fd7`) on the same reviewer's
`INC01-DES-002-OWNED-SOURCE-CORE-001` (`6500589f…bf9a`). `49c36d9e` and its packet stay as they are. The replacement is
a new signed sole child of `52bd`, staged from `49c`'s tree plus five paths: `ResourcePanel.tsx`,
`fixtures/native-resources.tsx`, `e2e/native-resources.spec.ts`, this plan and the handoff.

- **The fault.** A first page with no rows that says more follows (`complete: false`, a cursor) is rightly read as
  partial. But the panel's body chose its zero-row words by row count alone, so it said "No tool is enrolled for this
  project yet." beside the partial line. That claim is only true of an observed complete empty catalog.
- **The repair** (`ResourcePanel.tsx` only; the reducer, reader, flag and container are unchanged). With no rows, the
  body asks the catalog how far it was read.
  - **Complete** (and every non-catalog source): the incumbent empty words, unchanged.
  - **Not complete:** "The resources couldn't be read in full, so none is shown." with the time it was read, and Try
    again (a new read).
  - **Head:** its count says "–", not 0.
  - **Under the tiles:** the partial line shows only with rows, so it is never said twice.
  - **Unchanged:** rows kept after a later page fails, More, refusals, privacy, qualification and controls.
- **A page after a complete one.** The plan's "a page after one that was complete" doesn't describe the real container,
  which can't ask for More once a read is complete (`more` needs status `more`, not reading, and a cursor). What the
  reducer does is take a page only where it was asked for. An unsolicited or duplicate success after completion (the
  dev page's StrictMode can send the first read twice) is ignored, so a complete read stays coherent. No behaviour
  changes here.
- **Evidence.**
  - A first-page empty-incomplete case, at desktop 1280 and phone 390: the incomplete notice and Try again, no empty
    claim, and Try again reading again.
  - Controls: a complete empty catalog, the known-data empty panel (a non-catalog `ResourcePanel` with no rows), and
    later-page partial rows kept.
  - One reached empty-state mutant, failing by assertion and restored byte for byte.
  - Focused static, unit, browser and build checks on the committed replacement, and a new packet recaptured from it.

## UX iteration 001: the catalog explained, its detail ordered, its loaded counts said (on 775)

Written before the iteration's code. Assignment `INC01-DES-002-UX-ITERATION-001` (`c93d5be8…df5e22c`), on Davide's
review of `27a634e0` (`Sophia_UI_27a634e0_Review.md`, `d5c52859…7966`). `27a634e0` and its packet stay as they are.
The candidate is one new signed sole child of `775e2271` (tree `b46c29a3`, parent `03716163`). It holds `27`'s exact
34-path owned patch (`81c3756d…eb8c`, applied unchanged: tree `2fbce9c4`, all 34 blobs and modes equal to `27`), plus
this polish within the same 34 paths. No other path, package, fixture, GEN, auth or reducer change.

- **UX01, what this view is.** One scope line under the catalog's head, at every width, replacing the desktop-only
  "requests not reported": "Saved coding-resource records. Live activity, usage and controls aren't reported here."
  It is said once per state: with the tiles, while loading, and in the read notices (failed, unavailable, refused),
  which draw their own head. It is the catalog's alone; known-data sources keep their summary.
- **UX02, the sheet's order.** For a catalog resource only:
  1. Identity and owner: the head, unchanged.
  2. The recorded connection: the owner's connection words, or a teammate's "private to its owner"; then a
     needs-connection or revoked state.
  3. When the service observed it: "As recorded" with the page's `observedAt`.
  4. The limit, said plainly: "Live sign-in and readiness aren't reported."
  5. For the owner only, a closed `<details>`, "Recorded host and capability evidence". Inside it go the host line,
     handshake, conflict and recorded qualification, with its exact operation labels and its original recorded and
     expiry times. A teammate's sheet renders no evidence element at all, not even closed or hidden.
  6. One grouped line in place of three empty Sessions, Capacity and Controls sections: "Work activity, remaining
     usage and controls aren't reported by this view."
  - Unchanged: no reclassification by this clock, no readiness badge, and the sheet's focus, Escape, previous/next,
    copy link and the call's own controls.
  - Evidence text moves from the most muted ink to the secondary one. Times stay muted. Contrast is measured in the
    browser against its actual surfaces, as a measurement, not a certification.
- **UX03, search and counts as far as read.**
  - The catalog's search says "Search tools or owners…"; richer sources keep "Search tools, owners, work…".
  - While more remains or the read is partial, the head's count says "3 loaded", and the filters' group is "Show
    loaded".
  - Search and filters cover the loaded rows only, as before. With no match while rows remain unread, the panel says
    so ("Nothing loaded matches “x”. More resources aren't read yet.", or that the rest couldn't be read). It offers
    the real next read (More resources) or Try again, plus Clear search or Show all; it never claims no match across
    the catalog.
  - DES002-F01 stands: zero rows when incomplete means a dash and the incomplete notice; only a complete empty read says
    no tool is enrolled. Ordering, the reducer and its fences are untouched.
- **UX04, recovery that does what it asks.**
  - A final 401's "Sign in again" calls the app's own sign-out: the callback `SignedIn` already hands `ProjectShell`
    for its expired notice, with its existing failure toast and Try again. It reaches `ProjectResources` through the
    leased `SignedIn`.
  - The sign-in page then shows at the same address. Its sign-in link returns to that pathname (auth.ts, unchanged), so
    the project's Resources is the return context.
  - There is no automatic sign-out, hidden retry, account switch, new URL or credential handling. Without the callback
    (the fixture page), it stays Try again.
  - 403 and 404 keep their privacy-preserving words and Try again.
  - A complete empty catalog gets accurate manual guidance and no button, since no enrollment UI or help page exists in
    Studio: "Each owner enrolls their own tool from the computer it runs on; Studio doesn't enroll tools." The
    known-data empty wording is unchanged.
- **UX05, the cue before the cards.**
  - With rows and more to read, one line under the head before the toolbar: "3 loaded · more not read yet", with More
    resources.
  - With a partial read, the same place says the rest couldn't be read (or not consistently) with its time, and Try
    again. The partial line under the tiles goes: the state is said once, by that cue, above the cards.
  - Correction (on the reviewer's staged-tree study, as implemented in `579ac1d5`): the cue is not the only place the
    way on appears. While rows remain unread, a search or filter that shows none says so of the loaded rows. It repeats
    the unread reason ("More resources aren't read yet." or "The rest couldn't be read.") and offers its own More
    resources or Try again, as well as Clear search or Show all. That button calls the same guarded callback as the
    cue's, so it is one read, not a second loop: More is disabled while a read is under way, and Try again is a new
    read. So in that case the reason and the action show twice, in the cue and in the no-match line.
  - At 390 the head's count and the cue also both begin "3 loaded". These are wording repetitions, not a second warning
    state or a second fetch.
- **UX06, kept.** A teammate's listed resource offers no use, share, assignment or pooled-subscription words or
  controls; the browser checks assert none.
- **Settled project.** The app check's fetch wrapper read itself back through the app fixture's own fetch layer, so
  every project read looped, and the old captures showed "Loading…" and "Connecting". The wrapper becomes depth-aware:
  a layer that read `window.fetch` reaches the layer under it, and only the catalog's path is answered at the top. With
  that, the app check opens the fixture project settled, joins its call (the fixtures' fake LiveKit), opens Resources
  and a sheet, steps it, and reaches the dock's microphone and Leave at desktop 1280 and phone 390. All of it is
  synthetic: Auth, API, room and devices are answered in the page.
- **Evidence.**
  - Fail-before on the transplanted, unpolished tree for the new disclosure, loaded no-match, top cue and recovery.
  - Narrow reached mutants, for the loaded no-match guard and the teammate evidence guard, each failing by assertion
    and restored byte for byte.
  - Focused unit, browser (native, app, richer-source controls) and static checks, and an explicit Studio build.
  - Then one signed commit, the UID 65534 prerequisites, ONE ordinary `pnpm check` on the clean committed candidate,
    and a packet recaptured from it.
- **Addendum, on the reviewer's preparation `INC01-DES-002-UX-ITERATION-PREPARATION-001` (`bbabd5da…a517`), still
  before code.**
  - **Recovery isn't lossless.** The existing sign-out it reuses forgets unsent words and drafts, and ends a call, as
    it does from the account menu. The check proves:
    - only a press starts it, and it signs out this device only;
    - on success, the sign-in page at the same project Resources address;
    - on failure, the existing toast with Try again, the refusal kept, and no old row shown again;
    - no call rejoined on its own.
  - **More keeps the search and filter.** It reads the original next cursor, once at a time (the reducer's `reading`
    fence, unchanged), and a later matching row then shows in the same filtered list.
  - **Evidence disclosure per resource.** The sheet's body is keyed by its resource, so stepping from an opened
    owner's evidence to another resource starts it closed. A teammate's resource has no disclosure at all.
  - **The call in the sheet.** The frame's own call switches (SheetCall) stay in the sheet's head. The check reaches
    microphone and Leave there and in the dock, and J/K never turn a page while typing in the search.

## REC01: Sign in again asks first, with what it ends (a child of `8c1077b3`)

Written before the follow-up's code. Assignment `INC01-DES-002-REC01-SIGNIN-CONFIRMATION-001` (`1f16a692…f25e`), on
Davide's acceptance of `8c1077b3` and his review (`d22af99a…3c`). PR #511 stays at `8c1077b3`, untouched. The work is on
the new local branch `inc01-des-002-rec01`, in a fresh public worktree, and ends in one signed commit whose sole parent
is `8c1077b3`. No push is granted. Five leased paths: `ProjectResources.tsx`, both catalog specs, this plan and the
handoff.

- **What changes.** A final 401's "Sign in again" no longer signs out at its first press. It asks first, in place, with
  the kit's existing `ConfirmButton`:
  - Pressed, it says plainly: "Signing in again signs out this device. It ends any call you're in and removes everything
    unsent on this device: drafts and messages in your projects and your personal space."
  - It then offers "Stay here", which takes the focus so a second Enter never confirms, and "Sign out and continue".
- **Why that copy.** It names what the existing sign-out actually does (`App.leaving`):
  - **Call:** signing out unmounts the signed-in Studio, which ends the call.
  - **Drafts and messages:** `forgetAllDrafts` removes personal-space drafts (`forgetDrafts`) and project-view drafts
    (`forgetViewerDrafts`). `forgetUnderWay` removes messages under way or held in project conversations
    (`forgetKept`, `forgetHeld`), unanswered review proposals (`forgetProposals`) and recent palette entries
    (`forgetRecent`).
  - **Even on failure:** these run before and after the sign-out attempt, so they go even when it fails. The copy
    promises no preservation once confirmed, and doesn't call it a refresh or a seamless re-authentication.
- **What stays exactly as it is.**
  - "Stay here" and leaving the page before confirming call nothing: no sign-out, no draft touched, no catalog read, the
    call and its switches untouched.
  - "Sign out and continue" calls the same `onSignIn` (SignedIn's `onSignOut`, this device only) exactly once, with its
    existing failure toast and Try again. The sign-in then shows at the same Resources address, and no call is
    rejoined by itself.
  - The refusal keeps every row cleared throughout. 403 and 404 keep their words and Try again. Without `onSignIn` (the
    fixture page by itself), Try again is unchanged.
  - No change to SignedIn, App, auth, sign-out, the reader, reducer, flag, kit or CSS. Default-off is exact.
- **Layout.** The kit's `.confirm` group sits inside the existing read notice. It is checked at 1280 and 390 with the
  real copy. If it can't fit without a kit or CSS change, I report that instead of widening the lease.
- **Evidence.**
  - **App check, at desktop and phone, on the settled fixture project with a joined call:**
    - Two real unsent drafts: words typed into the personal composer through the app, and a project-view draft in its
      stored format (as app-auth's checks seed it).
    - "Stay here": the call is still live with its switches, both drafts are intact (the personal one read back in its
      composer after leaving the call), no sign-out request, and no extra catalog read.
    - Then "Sign out and continue": one sign-out, local scope only; both drafts gone; no row shown; the sign-in at the
      same address; back in, a fresh read and no call joined.
    - The failed sign-out path asks first too.
  - **Catalog fixture check:** its `signin=app` case now requires the confirmation, keyboard-safe: Enter on the opened
    choice keeps.
  - **Fail-before:** one bounded run on `8c1077b3`'s product with the final new recovery tests.
  - **Then:** focused static, type and build checks and the affected browser specs at desktop and phone with no
    retries; two confirmation captures (desktop, narrow); one signed child; ONE ordinary at that head.

## REC01-F01: each test worker owns its flagged server (a child of `06bee5c1`)

Written before the repair's code. Assignment `INC01-DES-002-REC01-F01-PARALLEL-SERVER-LIFECYCLE-001` (`54f77e21…a0`);
failure context `ce5d0ff4…b0`. `8c1077b3` (#511) and `06bee5c1` (#512) stay as they are. The work is on the local
branch `inc01-des-002-rec01-f01`, in a fresh public worktree at `06bee5c1`. Three leased paths: the app catalog spec,
this plan and the handoff. No product, CSS, kit, App, SignedIn, auth, flag, config, workflow or lock change.

- **The failure, as recorded.**
  - **#512's CI** (run `43327501592`, job `131563752932`, 2 workers): desktop `signOutFails` failed in 183 ms on
    `ERR_CONNECTION_REFUSED` to `127.0.0.1:5197` at its first `page.goto`. That was 0.3 s after the other worker's last
    flagged test passed.
  - **The local c0ec run** (2 workers): the same test timed out waiting for Account. Its isolated rerun passed.
  - Neither is a product assertion.
- **The cause, witnessed.** The spec's `describe` `beforeAll` runs once per worker. With `fullyParallel` and 2
  workers, both start `pnpm exec vite … --port 5197 --strictPort`. A disposable witness with the spec's exact spawn
  arguments, on port 5297, shows:
  - **Borrowed readiness.** The second worker's own child exits (code 1, the port taken). Its readiness poll still
    passes, against the first worker's server, so it runs on a server it doesn't own.
  - **Teardown that doesn't own descendants.** `afterAll`'s `server.kill('SIGTERM')` reaches only the outer `pnpm`
    launcher. In this environment it didn't stop the server, and after the launcher died the inner `pnpm` and
    `vite.js` were orphaned and still listening. How the server dies depends on the launcher (CI's pnpm setup
    differs), so the exact historical PID sequence in CI stays unproven. Either way, one worker's teardown decides
    another's server.
  - **Not repaired here:** the flagged servers share `node_modules/.vite-app` with the unflagged app server
    (`vite.app.config.ts`, frozen). This is recorded as a possible contributor, unproven, and not changed.
- **The repair**, in the spec only:
  - Each worker's `beforeAll` starts its own server on an OS-assigned port (`--port 0 --strictPort`), in its own
    process group (`detached`), and reads the address its own process prints.
  - It is ready only when all three hold:
    - its own child is still running;
    - that address serves the app;
    - the served flag module says `VITE_SOPHIA_NATIVE_RESOURCES` is `"1"`.
  - An exit before ready, or no address within the existing 120 s hook budget, fails at once with the child's exit
    status and a bounded, colour-stripped tail of its own output. It never prints the environment and never falls
    back to another listener.
  - `afterAll` stops its own group only: SIGTERM, then SIGKILL after a bounded wait, until no process of the group
    remains.
  - The fixed `portOf` ports go, so the phone and desktop projects can't collide either.
  - Unchanged: parallelism, retries, timeouts and every assertion.
- **Evidence.**
  - **Fail-before** on `06bee5c1`'s spec: the old-lifecycle witness. Then the actual spec run with an unrelated
    unflagged app server already on 5197 and 5195: its tests borrow that listener and fail.
  - **The repair, with the same decoys present:** the spec passes on its own servers. A two-worker run shows two
    distinct owned listeners at once and none after. A start that can't happen (no `pnpm` on the path) fails clearly,
    with nothing borrowed.
  - **Then:** the full app catalog spec, desktop and phone, two workers, no retries; the catalog fixture spec beside it;
    static and typecheck; one signed child; ONE ordinary at that head.
