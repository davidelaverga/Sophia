# What needs you, served (A15)

> 2026-10-16 · FND-C2-ATTENTION C2a, #365 section 2 (`Refs #365 — section 2`). Serves the contract already in A15
> ([needs-api.md](needs-api.md)); no contract shape changes. Stacked on the profile work (#388). Migration `0065_needs_served.sql`
> (P's allocation).

## What is served

- **`GET /api/v1/me/needs`** returns `NeedList { needs, readAt }`.
  - It is the caller's own: built from their active memberships in projects that aren't archived, and from their
    personal space.
  - At most 200. The expiring needs come first, soonest first; then the rest, newest first. The same records give the
    same 200.
  - `readAt` is the database's clock.
- **The four kinds**, as A15 names them:
  - **decision**: a work-board decision (`work_decisions`, A13) whose decider is the caller, still `proposed` and not
    expired. It leaves only when its record is answered, expires or is superseded. Seeing it changes nothing.
  - **guest**: a lobby entry `waiting` at a room of a project where the caller can let guests in (editors and admins,
    as admitting is). A viewer is not offered one. `detail` says how long they have waited («Waiting 3 min»). It
    leaves when the guest is let in, declined, blocked or gone.
  - **reply**: Sophia's personal turns after what the person has read (below). `title` is the reply's first words, up
    to 140 characters.
  - **permission**: none today. A13's waits are computed (a commission, a wake, a refusal), and nothing keeps a native
    tool's request. The kind waits for a record, as A15's review kind does.
- **`POST /api/v1/me/needs/{id}/seen`** (204):
  - **A reply:** moves the person's seen mark forward to the turn named, never back. Later replies stay listed.
  - **Any other well-formed kind:** changes nothing.
  - **An id that names no need of the caller** (malformed; a reply not theirs, or not Sophia's): 404, as A15 declares
    (answered by the route: the house `not_found` code is 422).
  - A guest without an account is refused before the route (403).

## The seen mark, and the start at rollout

**The seen POST is the only transition.** Reading the list, opening a need, reading or polling the personal space, and
any background refetch acknowledge nothing. A required decision or a waiting guest is never acknowledged by being
seen: it leaves only at its own record.

- `personal_spaces.last_seen_turn_seq` is new. It only moves forward, and only through the seen POST. Reading the
  space, the person's own later turn and an opened need never move it (Codex on #390).
- A reply is unread when it comes after the mark.
- **At rollout only**, each existing space's mark is set to its person's own last turn. Their last word answered what
  came before it, so neither all their history reads unread nor a waiting reply is hidden. A space made later starts
  at 0.
- The personal turn order never goes back, erasure included (0021), so the mark stays valid after an erasure.
- **A client consequence (Luis):** a reply read in the personal space stays a need on Home until a seen POST names it.
  The Studio posts seen only when a reply is opened from Home. For the space to acknowledge what it shows, it would
  post seen for the newest reply actually in sight, as Home's open does: an explicit, observed turn, never a
  background read.

## The id

`<kind>:<projectId, or personal>:<within, or ->:<ref id>`, as A15 states. Each part is escaped (`%` → `%25`, `:` →
`%3A`), so the id is injective even if a part ever holds a `:`. Today's parts are UUIDs. The route reads the id back
the same way.

## A router limit found here

Fastify's router refused a path parameter over 100 characters (414). A decision's id is three UUIDs, about 130
characters once escaped in the path, so a decision's seen POST could not reach the route. `buildApp` now allows 2000
(`routerOptions.maxParamLength`); A15 bounds the id at 600.

## For the Studio (Luis)

- **No change to the client.** `api/needs.ts` (`listNeeds`, `markNeedSeen`, `parseNeedList`) and the fixture's shapes
  are what is served.
- Home reads it only under the vision flag. Turning on this one surface after the deployment is Luis's step: only the
  needs read, not the whole flag.
- Titles are the records' own words:
  - a guest's is their name (the fixture says «Marco Pereira is in the lobby»; the service says «Marco Pereira»);
  - a reply's is its first words.
- `detail` is set for a guest only.

## Turning the surface on, and only it

- Home reads the needs through `useNeeds` (`features/personal/useNeeds.ts:57`), whose default is
  `enabled = VISION`. That is the only gate:
  - opening a decision, a guest or a reply goes to views already served outside the flag (Tasks, the room, the
    personal space; `route.ts` `UNSERVED` holds Conversations, Updates and Resources);
  - a permission would need Resources, but none is served (`withoutResources` covers it).
- The narrowest change, Luis's to make:
  - a needs-only switch, e.g. `NEEDS_SERVED = VISION || env.VITE_SOPHIA_NEEDS === '1'` in `app/vision.ts`, as
    `useNeeds`'s default;
  - set in the deployed Studio's build after this API is deployed.
- Before the deploy the route doesn't exist (an API before this answers 404). A Studio that read it anyway would say
  «Couldn't read what needs you», so the switch follows the deployment, not the source.

## Not here

- Updates (`since`/`seen`): C2b, its own migration and contract.
- Mentions: C3.
- A permission need, until a native request is kept.
- A15's text revision (the seen POST as the only transition, and the escaping) waits for an amendment number.

## Checks

- `needs.db.test.ts` (real API on PostgreSQL):
  - **Decisions:** the caller's own open decision is listed with its id, holder and expiry. Another's, an expired one
    and an answered one are not. Seen answers 204 and the decision stays; once answered, it leaves.
  - **Guests:** a waiting guest is listed for the admin and the editor, not the viewer. The guest's own read is 403.
    Once let in, it leaves.
  - **Replies:** a later turn of the person's, a space read and a list read acknowledge nothing. Seen moves forward
    and never back, and is idempotent. Another person can't mark or read them (404, empty). A new reply after the
    mark is listed.
  - **Ids:** malformed and foreign ids are 404; another kind's well-formed id is 204.
  - **Membership:** a left member and an archived project read nothing; an empty list is still an answer.
  - **Escaping:** the id is read back escaped.
- `readiness.db.test.ts`: not ready without 0065. A space that exists before 0065 starts at its person's last turn
  (3); one with only Sophia's turn starts at 0.
