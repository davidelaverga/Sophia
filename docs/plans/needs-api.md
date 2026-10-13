# A15 (proposed, for Davide): what needs the calling person, in one read

> 2026-10-11 · Luis: «sigue con la API de “Needs you” con Davide; si es algo que él tiene que hacer, súbelo como un
> PR». Informe-30 F2; Home's right half is built (Studio PR #237, behind the vision flag, on fixture data). This names
> the read that fills it: the contract as an amendment (A15), the Studio's client and the fixture's answer. The
> service's route is Davide's.

## What was measured

- What needs a person is in five places today, each with its own read: a decision waiting on them in a project's
  Tasks (`MissionDecision`, A08, with an expiry), a native permission an agent asks of them in a task's sheet
  (`WorkWait` of kind `native_permission`, A13), a review asked of them in Knowledge (A11), a guest waiting in a
  room's lobby they admit to (`LobbyEntry`, A02/A03), Sophia's reply they have not read in their personal space
  (`PersonalTurn`, A10).
- Home's column (`NeedsYou`, #237) takes `{ items, open }` and orders by urgency; nothing feeds it but a fixture.

## The amendment (A15, `packages/contracts/amendments/A15-needs-you.json`)

- `GET /api/v1/me/needs` → `NeedList { needs: Need[], readAt }`, bearer, owner-only (as A10's personal space): built
  from the person's own memberships and space; nothing of another person is in it.
- `Need` (as merged, after the review rounds below): `id` (`<kind>:<projectId, or personal>:<ref.within, or ->:<ref.id>`,
  stable and unique across the person's needs: a wait's reference may repeat across projects or work items), `kind` (decision · permission
  · guest · reply; review dropped), `title` (the record's own words), `projectId` / `projectTitle` (null for the
  personal space), `expiresAt` (a decision's, `WorkDecision.expires_at`; null for the rest: a wait, a guest and a reply
  have none), `detail` («Davide asks», how long a permission or a guest has waited), `at`, and `ref` (`work_decision` ·
  `work_wait` · `lobby_entry` · `personal_turn`, its id, and `within`: the work item that holds a decision or a wait,
  null otherwise, and `resourceId`: the resource whose native tool holds a permission's request, required so it opens
  in Resources; null otherwise), so the Studio opens that record and never guesses.
- `readAt`: the service's clock; expiries are compared against it, not the reader's.
- `POST /api/v1/me/needs/{id}/seen` (owner-only, idempotent, 204): a reply leaves the list through it (the person's
  last seen personal turn, `last_seen_turn_seq` on `personal_spaces`); any other need leaves when its record is answered
  where it lives. No dismissing; a badge is the list's length. (Brought to the merged A15 after merge: Codex on #282.)

## What the Studio does now (behind the vision flag)

- `api/needs.ts`: `listNeeds(token, signal)` through the generated validator (`parseNeedList`); `needsOf(list)` maps
  the wire's needs to Home's (`needs-you.ts`): the project's title as `project`, the rest as they are, `projectId`
  kept for the way there.
- Places reads it at Home (`useNeeds`, every 20 s as the projects are), and hands Welcome `{ items, open }`: a
  decision opens the project's Tasks at its choice, a permission its task in Tasks until Resources is served (`withoutResources` in SignedIn; then its Resources with
  the request focused), a guest
  its room, a reply the personal space (`VIEW_OF` in `api/needs.ts`; no review: A15 dropped it). Without the flag nothing is read and Home is as it was. Opening a reply from Home posts its seen mark and
  reads the list again.
- The fixture's API answers the route with four needs, one of each kind (a decision and a permission within their work
  item, a guest, a reply); the app's own check routes it and finds the column and the way to Tasks.

## What is Davide's

- The route in `apps/api` (`listNeeds`) as the final A15 has it: four kinds (decision, permission, guest, reply; no
  review), owner-only, with `readAt`; `403` for a guest; the tests beside the other personal routes.
- `POST /api/v1/me/needs/{id}/seen` (owner-only, idempotent, 204), required: for a reply it advances the person's last
  seen personal turn, `last_seen_turn_seq` on `personal_spaces`, a new column by a migration; for any other kind it
  changes nothing. Without it a reply never leaves the list. (Corrected after merge: Codex on #245; the review
  appendix below has the reasons.)
- Four more points for the route and its contract, raised by Codex on #245 and left to this side (the amendment is
  the service's): the seen POST is the only transition of the cursor (a background read of the personal space must
  not advance it); each need kind tied to its `ref.kind`, project and `within` in the schema (discriminated variants);
  only the latest open revision of a decision, its expiry after `readAt`; and the cursor's start for spaces that exist
  at rollout (none read as all unread, nor a reply present then hidden), with a migration test on a space with turns.
  Two more, raised on #282: A15's own text still lets the service advance the cursor when the personal space is read,
  which the Studio does in the background at Home, so the amendment should be changed to the seen POST alone; and the
  need id joins its parts with `:` though A13 lets a work item's and a reference's ids hold one, so it wants an
  injective encoding (each part escaped, or length-prefixed) before the Studio's keys and the seen route rely on it.

## Checks (written first)

- `pnpm --filter @sophia/contracts generate:check` clean after the amendment (types, validators, the wire).
- `api/needs.test.ts`: `needsOf` maps the wire to Home's needs, the project's title and the id kept.
- `app-auth.spec.ts`: signed in at Home with the route answered, the column lists the needs in urgency order; the
  decision's row goes to the project's Tasks.
- `pnpm check` clean; `home.spec.ts` and `home-needs.spec.ts` unchanged (the fixture page keeps its `needs=`).

## Left

- A push or a mail when one arrives (F2's second half). Marking a reply read is in the amendment (the seen POST).

## After the review (Codex on #245)

- **The padlock reaches the read** (P1). The read mixes Sophia's replies with the projects' needs, so while the
  personal padlock is shut nothing is read (`useNeeds(…, { locked })` from Places' lock) and the answer already in
  memory goes with the personal reads (`forgetPersonalReads` removes `['vision', 'needs']` too). Home is then as it was,
  her light alone; the fixture counts the route's reads and `home-needs.spec` finds none behind `locked=1`. Redacting
  only the replies was the other way; it would keep a personal record in memory to redact it, which the padlock forbids.
- **The service's clock** (P2). `readAt` was dropped at the boundary. The hook keeps the browser's time when the answer
  arrived beside it; `clockSkew(readAt, receivedAt)` is what to add to now, and Welcome hands `NeedsYou` now on the
  service's clock. An unreadable `readAt` adds nothing.
- **The record a ref names** (P2). `whereOf` carries `at`: a `work_item` is named in Tasks' fragment (`#task-`, as
  Updates' arrivals do); a decision through the work item that holds it; an `artifact_version` opens in Knowledge's
  viewer through the report that holds it. For both, A15's `ref` carries `within`: the record that holds the named one
  (a version's report, a decision's work item), null otherwise. A lobby entry and a personal turn have no address of
  their own: their view. `useProjectRoute.openAt(projectId, view, at)` pushes the route with the viewer's search, then
  names the task.
- **A decision is the work board's** (P2, round 2). The mission ledger's decisions have neither a respondent nor an
  expiry; `WorkDecision` has a decider, an expiry and is what Tasks renders. `ref.kind` says `work_decision`, and the
  service selects the open ones whose decider is the person.
- **A reply leaves through a seen mark** (P2, round 2). A10 keeps no read cursor, so a reply would stay forever. A15
  adds `POST /api/v1/me/needs/{id}/seen` (owner-only, idempotent, 204): for a reply it advances the person's last seen
  personal turn to the one named (a mark A10 keeps beside the space); for any other kind it changes nothing. The Studio
  posts it when a reply is opened from Home and reads the list again; the fixture records `seen <id>` and drops the need
  from its next answer, which `home-needs.spec` checks (the row leaves).
- **A permission is its wait** (P2, round 3). One work item may hold several `native_permission` waits, and A15's id is
  `<kind>:<ref.id>`, so a wait must be its own record: `ref.kind` `work_wait` with the wait's own reference as its id
  and the work item that holds it in `within`, which is the address (as a decision's). The fixture names
  `permission:wait-w1` within its work item.
- **A failed read says so** (P2, round 3). `useNeeds` returns the needs and the read itself (`{ seen, read }`); Home
  hands the read to its notes beside the personal space's and the projects' (`ReadNotes`): a 403, a 503 or a timeout
  says «Couldn’t read what needs you.» with Try again, instead of the light alone. The fixture's `needsFail=1` fails
  the first read; the spec sees the note, presses Try again, and the five rows arrive.
- **No review kind until a request exists** (P2, round 4). A11 keeps verdicts (who reviewed), not requests (who must):
  the service has nothing to select a review need from. The kind leaves A15 (and `artifact_version` with it); Home's
  own type keeps the word for the day a request record exists. The fixture's list is four.
- **A permission does not expire** (P2, round 4). A13's `WorkWait` has no expiry; `expiresAt` is a decision's only,
  and a permission says how long it has waited (`detail`). The fixture's permission reads «Asked 10 min ago».
- **A seen write that fails** (P2, round 4) reads the list again as a kept one does: the row stays where it was, which
  is the truth, and the next press writes again.
- **Contract-only** (P2, round 4): both operations carry `x-sophia-implementation: contract_only` and
  `x-sophia-release-goal: F2`, as the other proposed operations do.
- **A poll that fails after a good read** (P2, round 5): the rows read last are kept (the list stays actionable) and
  the note says the read failed beside them, with Try again: `isError` is read apart from the cached rows. The fixture's
  `breakNeeds()` makes every later read fail; the spec breaks it, brings the window back (a refetch), sees the note
  and the four rows together, recovers, and Try again clears the note.
- **The cap and the seen mark** (P2 ×2, round 6): `NeedList` names its truncation now: at most 200, the most urgent by
  the service's own order (the expiring first, soonest first; then the rest, newest first), the same 200 for the same
  records, the rest standing where they live; no cursor (what needs a person is a list they act on, and 200 is far
  past one). The seen mark: a reply opens the personal space, where every turn since the last seen is shown, so seeing
  one is seeing those before it; the mark only moves forward, and replies after the one named stay listed.
- **`within` is the holder's own id** (P2, round 7): a work item's id is any string of 1 to 160 characters (A13's
  `work_id`, a slug such as `build` among them), so `within` takes that shape, not a uuid; a uuid still fits.
- **Round 8 (P2 ×3)**: a decision is addressed by its own id (`#decision-<id>`): Tasks' board scrolls to its choice and
  gives the focus to its first option (`useAddressedDecision`), where the `#task-` address had opened the holding
  task's sheet, which has no choice in it. A need's title is up to 1200 characters, the length of a decision's question
  in A13 (the Studio cuts it for the eye). A reply is marked seen once its turn is shown in the personal space
  (`turnShown`: the `.msg[data-turn]` watched for up to 20 s), not on the press: a space that failed to read marks
  nothing and the need stays.
- **Round 9 (P2 ×4)**: the decision address is the board slot's own (`useSlot`): it opens the slot when shut and names
  the decision for the focus, which `Decisions` gives inside its own list (the current revision's choice, not a stale
  one elsewhere in the document), once per address (its sequence is kept: `replaceState` fires no `hashchange`, so the
  same address could not have come twice), then lets the address go. `turnIsShown` asks for a drawn turn
  (`getClientRects().length > 0`): the personal space kept mounted under a hidden place has the `.msg` in the document
  and shows nothing, so a need is marked seen only once the space is in sight with the turn in it.
- **Round 10 (P2)**: a permission opens its request, not only the task that waits on it. The task's sheet names a
  native-permission wait as words; the owner's path is the request in its resource's sheet (Resources,
  `ResourceRequests`: how to answer it in the tool, the session to copy, the tool's own link, `openTarget`). A15's
  `ref` carries `resourceId` (the resource whose tool holds the request; A13's `reference_id` already names the
  request), the Studio opens Resources at `#request-<id>`, and `ResourcePanel` opens that request's resource and gives
  the request's row the focus, once per address, the address becoming the sheet's; a request not among those read
  opens nothing and the address waits. The task's id still comes along in `NeedAt`, for the record.
- **Round 11 (P2)**: shown means in sight, not only drawn: `turnIsShown` asks the turn's box to meet its log's
  (`.msgs`, the scrollport) and the window's, and brings a drawn turn below the fold into sight first (`scrollIntoView`,
  instant: a kept scroll position, or a reply left under «Sophia answered», would otherwise let the mark advance
  unseen). Home's fixture takes a log (`turns=log`: thirty turns in a short scrollport, the reply the last, below the
  fold; `turns=hidden`: the same under `hidden`), so the real watch decides there too: the spec sees the seen mark only
  after the turn is in sight (the log scrolled), and none when the log is hidden (the row stays).

## After the review, round 12 (Codex on #245)

- A refusal (401, 403) hides the rows read before; a transient failure keeps them with the note.
- The id is unique across projects and holders (`<kind>:<projectId, or personal>:<ref.within, or ->:<ref.id>`).
- What Davide's routes need that nothing keeps yet: `opened_at` beside each wait (a permission's `at`; A13's wait keeps
  no time) and `last_seen_turn_seq` on `personal_spaces` (A10 keeps no last seen turn), each by a migration.
- A decision addressed from Home chooses the goal that holds it (`GoalPlan.decisions`).
- In the signed-in app a permission opens its task until Resources is served (`withoutResources`).
- A reply's turn is waited for against a fresh read of the space, its place shown, for as long as a read can take.
