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
- `Need`: `id` (`<kind>:<ref.id>`, stable), `kind` (decision · permission · review · guest · reply), `title` (the
  record's own words), `projectId` / `projectTitle` (null for the personal space), `expiresAt` (a decision's or a
  permission's; null else), `detail` («Davide asks», how long a guest has waited), `at`, and `ref` (`mission_decision`
  · `work_item` · `artifact_version` · `lobby_entry` · `personal_turn`, with its id), so the Studio opens that record
  and never guesses.
- `readAt`: the service's clock; expiries are compared against it, not the reader's.
- Not in it: marking read, dismissing; a badge is the list's length. A need leaves the list when its record is answered
  where it lives.

## What the Studio does now (behind the vision flag)

- `api/needs.ts`: `listNeeds(token, signal)` through the generated validator (`parseNeedList`); `needsOf(list)` maps
  the wire's needs to Home's (`needs-you.ts`): the project's title as `project`, the rest as they are, `projectId`
  kept for the way there.
- Places reads it at Home (`useNeeds`, every 20 s as the projects are), and hands Welcome `{ items, open }`: a
  decision or a permission opens the project's Tasks, a review its Knowledge, a guest its room, a reply the personal
  space. Without the flag nothing is read and Home is as it was.
- The fixture's API answers the route with five needs (one of each kind); the app's own check routes it and finds the
  column and the way to Tasks.

## What is Davide's

- The route in `apps/api` (`listNeeds`): the five sources above, owner-only, with `readAt`; `403` for a guest; the
  tests beside the other personal routes.
- Later, if wanted: a `seenAt` per need (marking read), which this amendment leaves out on purpose.

## Checks (written first)

- `pnpm --filter @sophia/contracts generate:check` clean after the amendment (types, validators, the wire).
- `api/needs.test.ts`: `needsOf` maps the wire to Home's needs, the project's title and the id kept.
- `app-auth.spec.ts`: signed in at Home with the route answered, the column lists the needs in urgency order; the
  decision's row goes to the project's Tasks.
- `pnpm check` clean; `home.spec.ts` and `home-needs.spec.ts` unchanged (the fixture page keeps its `needs=`).

## Left

- Marking a need read; a push or a mail when one arrives (F2's second half).

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
  Updates' arrivals do); an `artifact_version` opens in Knowledge's viewer, for which A15's `ref` now carries the
  version's report (`artifactId`, null for every other kind), since the viewer's address names the report first.
  A decision, a lobby entry and a personal turn have no address of their own yet: their view, until one exists.
  `useProjectRoute.openAt(projectId, view, at)` pushes the route with the viewer's search, then names the task.
