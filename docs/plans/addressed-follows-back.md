# What the address names follows Back, without reopening what was closed

> 2026-10-24 · the follow-up list (`evaluacion-2026-10-16/seguimientos-p2.md`, Lote 11, studio/report-closes-on-link,
> own follow-up), found while building #479 (`studio-links-in-place.md`, «Found while building, not changed here»;
> `docs/handoffs/REPORT-CLOSES-ON-LINK-attempt-1.md`). Luis 2026-10-24: «Toma el arreglo de Back en Conversations en el
> próximo lote»; earlier «Lo que no se mide, no se puede mejorar». Studio only. Design first: no check and no code
> until this note is reviewed.

## What was read

- **The claim holds.** `useAddressed` (`resources/useAddressed.ts`) follows `hashchange` and `ADDRESS_NAMED` (`seq`
  goes up), reads again on `ADDRESS_MOVED` (`seq` stays), and never listens to `popstate`. A view's own writes go
  through `showInAddress` (`resources/link.ts`), a `replaceState` that tells nobody.
- **13 calls in 9 files**, plus 4 places that only say `ADDRESS_NAMED` (`useProjectRoute.openAt`, `InPlaceLinks`,
  `project-go.tsx`, `ProjectShell`'s search and Goals' «Open in Tasks»). What each does when what it reads changes:

| Caller (prefix) | What it does on a new `{ id, seq }` | Writes the address itself | Mounted across |
| --- | --- | --- | --- |
| `ConversationsView` `useInAddress` (`#conversation-`) | id set: opens that conversation (`ask`) and its thread screen (`show`), on `[id, seq]`. Null: nothing | Yes: a pick, or the list screen, replaces it | Conversations only |
| `StudioShell` `useRoomPanel` (`#message-`) | Opens the side panel on Chat, on `[id, seq]` | No: closing Chat **leaves the fragment** | Every view (project body) |
| `StudioShell` `useRoomPanel` (`#todo-`) | Opens the side panel on the brief, on `[id, seq]` | No: closing **leaves the fragment** | Every view |
| `ProjectTasks` `useNamedTask` (`#todo-`) | Reads the task alone when not listed; scrolls to it and focuses it once per `id#seq` | No | The brief panel |
| `useMentionAttention` `useMessageAddressed` (`#message-`) | Looks for the message (earlier pages, a jump) and scrolls to it once per `id#seq` | No | The room |
| `WorkCard` `useNamedCard` (`#task-`) | Focuses and scrolls to the card, on every new `named` **object** | No | The room's task cards |
| `ResourcePanel` `useAddressedRequest` (`#request-`) | Once per `seq`: opens the request's resource sheet and focuses the request | Yes: replaces it with `#resource-…` | Resources |
| `GoalList` `useGoalAddressed` (`#goal-`) | Chooses that goal on Tasks' rail | No | Goals and Tasks (one `<Goals>`) |
| `GoalList` `useChosenGoal` (`#task-`) | Chooses the task's goal; its `seq` is the epoch a rail choice holds in | No | Goals and Tasks |
| `GoalList` `useChosenGoal` (`#decision-`) | Chooses the decision's goal; a search hiding it gives way | No | Goals and Tasks |
| `GoalsOverview` `useOpenGoal` (`#goal-`) | Opens the goal's sheet, on `[known, seq]` | Yes: closing clears it | Goals |
| `PlanBoard` decisions (`#decision-`) | Once per `seq`: opens the decisions slot on it, focuses it | Yes: then lets it go | Tasks' board |
| `PlanBoard` `useOpenTask` (`#task-`) | Opens the task's sheet; a pressed task holds while `seq` stays | Yes: open writes it, close clears it | Tasks' board |

- **Not a caller:** `ResourcePanel`'s own sheet (`#resource-`) reads the fragment once, at mount, and follows nothing
  after.

## What reaches it, measured

A probe in Chromium (headless, software, through `.claude-guards/safe-browser.cjs`), against the fixture pages served
from this branch on a port of its own. Script and output: the session's scratchpad, `afb-probe.cjs`,
`afb-probe-order.cjs`, `afb-probe.txt`, `afb-probe-d.txt`.

- **Browser events** (a bare page, `/a?q=1#x`):
  - Back or Forward where the query changes too (`?q=2#y` ↔ `?q=1#x`): **`popstate` only**.
  - Back or Forward where only the fragment changes: `popstate`, **then** `hashchange`. Also after the entry on screen
    had its fragment replaced: `hashchange` compares with the address on screen, not with the entry's old one.
  - Back to an entry whose fragment equals the one on screen (it was replaced to match): `popstate` only.
  - Path and fragment (`/b?q=2` → `/a?q=2#w`), query only, `go(-2)`: one `popstate` each, no `hashchange`.
  - `location.hash = '#u'`: `popstate`, then `hashchange`. `pushState` and `replaceState`: nothing.
  - **Every `hashchange` came after a `popstate` for the same address.**
  - Listener order on `window` is the order they were added: a `capture: true` listener added later still ran
    second. No ordering trick is available.
- **The bug** (`room.html`, Conversations at c1 with the report beside it, a link to c2 in the thread):
  - The link: only `ADDRESS_NAMED` (the push and the fragment are silent).
  - Back: one `popstate`. The address names c1 with `report=`, the report is back, and the thread still shows «Short
    or long briefs?» (c2).
  - Forward: one `popstate`.
  - The viewer's `popstate` listener was added after some `useAddressed` instances and before others (children's
    effects run first). Any rule must not depend on which runs first.
- **A close that leaves the fragment** (the room at `#message-…`, Chat open on it):
  - The notice's Open pushes `{ sophiaReport: 1 }`, Chat gives way, and the fragment stays.
  - The report's Close is one `popstate` landing on the same `#message-…`. Chat stays closed today. A hook that
    followed every `popstate` would raise `seq`, and `useRoomPanel` would open Chat again.
- **A pick beside a report, then the report's Close** (Conversations, c2 pressed, a report opened from a link in its
  thread, c1 pressed beside it):
  - The report's entry carried `#conversation-c2`, and the press replaced it with c1, silently.
  - The report's Close is `history.go(-1)`: one `popstate` landing on `#conversation-c2` while c1 is on screen.
  - The hook had followed nothing (it mounted at a plain address). So any rule that follows a fragment it hasn't
    followed would switch the thread back to c2 when the report closes.
- **Not run in a browser: the router's moves.** The fixture page has no router. From the code (`useProjectRoute.go`):
  a view's press pushes a path with no fragment and says `ADDRESS_MOVED`, and Back across it is `popstate` only (the
  path-and-fragment row above). A view that unmounts reads the address again when it mounts. Only the project body's
  `useRoomPanel` and `GoalList` (Goals ↔ Tasks) stay mounted.

## The rule

Each `useAddressed` instance keeps **`acted`**: the record it last followed. It starts as the record the page opened
with (mount), and is set by each follow: `ADDRESS_NAMED`, `hashchange`, and a `popstate` that names another record.
`ADDRESS_MOVED` and a view's own writes (`showInAddress`) never set it.

- **`popstate`:** read what the fragment names under the prefix.
  - **Another record than `acted`:** followed, as a link followed. `seq` goes up and `acted` takes it.
  - **No record:** read, not followed, as `ADDRESS_MOVED` reads (`seq` stays, a gone address is gone). `acted`
    stays.
  - **The record `acted` names:** nothing at all. The same object is returned, so `WorkCard` and the `named`-keyed
    effects (`ResourcePanel`, `PlanBoard`) don't run again.
- **`hashchange`: as today, but not twice.** It follows every change it reports. If the `popstate` of the same move
  already followed (its address equals the event's `newURL`), it does nothing. Moves of the fragment alone keep
  today's behavior exactly; the new following is only for the moves `hashchange` never reports.
- **A close updates nothing, on purpose.** A close is a view's write (`replaceState`) or no write at all, and the hook
  isn't told. The closed record stays the last one acted on:
  - Closed with the fragment left in place (Chat, the brief): a move landing on it again equals `acted`. Nothing
    reopens.
  - Closed with the fragment replaced or cleared (a thread, a goal's sheet, a task's sheet, a decision let go, a
    request handed to its resource): a move landing on it equals `acted`, and a move landing on nothing is only read.
    Nothing reopens, and no choice resets: `seq` stays, so Tasks' rail choice and a pressed task hold.
  - Only a move to **another** record follows. That is Back to a different conversation, task or goal: what the person
    asked for.
- **The report's own steps keep the fragment on screen.** The viewer's Close and shrink are `history.go(-n)` over its
  own entries. They land on the fragment from when the report opened (the pick-beside-a-report probe), so the rule
  alone would switch the thread there.
  - Before it steps, the viewer notes the fragment on screen (one value kept by `useAddressed.ts`).
  - Its `popstate` writes that fragment into the entry it lands on, keeping that entry's `history.state`.
  - `useAddressed` reads the noted fragment while one is noted, so the order of the listeners doesn't matter.
  - The viewer clears the note once it has written it.
  - Closing a report then changes the report only, and the address names what is on screen. Today it names the older
    record.
- **For the bug:** after the link, `acted` is c2 (`ADDRESS_NAMED`). Back lands on c1, another record, so c1 opens.
  Forward lands on c2, so c2 opens. The viewer opens and closes the report, as it does today.

## Checks to write first (after this review)

- `studio-links-in-place.spec.ts`: the existing Back test, plus «the thread shows c1» after Back and «c2» after
  Forward (red today: «Short or long briefs?»).
- A conversation pressed beside a report, then the report's Close: the pressed one stays, and the address names it
  (red under the rule without the viewer's note).
- The room at `#message-…`, the report opened from Chat's notice, then closed: Chat stays closed. It passes today and
  guards against following every `popstate`.
- Tasks' rail choice holds through a report's Close that lands on no task. It guards `seq` on a landing that names
  no record.

## Out of scope

- **Back with the browser out of a report's entry follows the landing fragment** when it names another record. That
  is the pick-beside-a-report probe with Back instead of Close: the thread goes back to c2 and the report closes. The
  browser's history says so, and nothing tells the hook it was a report's step. Only the viewer's own Close and shrink
  keep the fragment.
- **Back to a plain address in Conversations** (the newest open by default) leaves the conversation on screen:
  `useInAddress` acts only on a named one. Unchanged.
- **Moves of the fragment alone** keep today's `hashchange` behavior, a closed record reopening on such a Back
  included. Such entries come only from the skip link, a report's `#md-` anchors, or a typed fragment.
- **A kept-mounted view after a view's push** (`ADDRESS_MOVED`): Back to the record it last followed doesn't re-choose
  it (Tasks → Goals → Back to `#task-…`: the board shows the default goal, read from the code). As today.
- **`#resource-`**: Resources' own sheet follows no change of the address after load. A follow-up of its own.
- **Views' writes stay silent.** `showInAddress` tells nobody. Nothing above needs it to.
