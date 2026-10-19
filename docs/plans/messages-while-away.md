# Messages that came while the tab was hidden: the chat marks where you left off

> 2026-10-18 · costuras.md seam #10 (`evaluacion-2026-10-18/experiencia/costuras.md`), and Luis 2026-10-18: «Que
> sigue>» after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en un
> pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando». Studio only, no API; one branch.

## What was measured

Read on main 2e151c934 (the report read 787c28fc4; the lines moved, the claims hold):

- `unread-title.ts` `withUnseen` (18-33) counts, while the tab is hidden, each typed message from someone else as it
  comes, by id and in the order they came; the viewer's own leave the count (#463, `sayElsewhere`). On the tab shown
  again `useUnseenWhileHidden` (56-68) marks everything seen and drops what it counted.
- `ProjectShell.tsx` `useTabTitle` (96-100) puts that count in the title: «(2) Fixture project · Sophia» while hidden,
  «Fixture project · Sophia» once shown. Nothing else reads it.
- The chat (`Conversation.tsx`) draws the room's discussion with day lines and no mark of what is new. Its toggle's
  dot (`StudioShell.tsx` 57, `useUnread`) counts a chat open as seen even while the tab is hidden, so with the chat
  open nothing at all is left of the absence.
- The report puts the line «in the chat's header when the chat is closed». The chat lives in the room's side panel:
  closed, nothing of it is drawn, header included. So the line waits there for the chat to open, where the divider is
  out of view (below).

## What changes

- **`unread-title.ts`, pure:** as the tab is shown again, what was counted becomes `away` (the ids, the first where
  the reader left off) instead of being dropped. An absence before the last one was reached adds to it, its first
  kept; one with nothing counted leaves it as it was. `nextUnseen` is the hook's step, made pure so it is tested;
  `awayWords` says «2 messages came while you were away», «1 message …» for one, numbers as the Studio writes them
  («2 goals», «1 thing needs you»). The title's count is unchanged.
- **Where it lives:** the project shell keeps it, past a visit to another view, and hands it down by context
  (`CameWhileAway`, as `CallInReach` is). A reload starts with nothing.
- **The divider** (`WhileAway.tsx`), in the room's discussion above the first message that came (the first still
  drawn, where more than the snapshot's 50 came): «2 messages came while you were away», between two hairlines in the
  halo's ink. It stays until the reader sends something, or a later absence moves it.
- **The line**, at the chat's head under the panel's tabs, as the panel's own note is set: «2 messages came while you
  were away. Jump to the first» («Jump to it» for one). Shown only while the divider is out of the chat's view and not
  yet reached: on opening a chat that was closed while they came, or scrolled far from it. With the divider in view
  the divider says it, and no Jump points at what is already there. `role=status`; it never takes the focus.
- **Jump** scrolls the divider to the top of the history and gives it the focus, as a reply's quote does, so a
  keyboard carries on from there.
- **Once per absence**, keyed by its first id: the line goes for good once the divider has been fully in the chat's
  view (measured as it opens, scrolls or the absence is said), or on Jump. Hidden and shown with nothing new adds
  nothing. Sending from the bar ends both the line and the divider.
- **Steady reading:** the divider is drawn while the reader follows the newest line, so the history keeps to the
  bottom; the line leaving keeps the history's words where they were on screen.
- **A reply from elsewhere** (review, 2026-10-19): a message the viewer typed, in this tab or on their phone, puts
  itself and everything before it behind them (`unanswered`, applied at every read while the tab is shown). Marco
  writes, the viewer answers from the phone: back on the tab, nothing is marked. Written first, then Marco: his is
  still marked. A turn they spoke in the call reads nothing of the chat and changes nothing. Their own message
  counted before their membership was read leaves the mark, with what came before it, once it is.
- **What the feed brings late** (review, 2026-10-19): a phone's page is frozen while another app is in front, a
  laptop's stream dies in its sleep, so the messages written meanwhile reach the page only after `visibilitychange`.
  As the tab is shown again the shell reads the snapshot once more (its query's `refetch`), and the absence stays
  open until a read made since lands (`dataUpdatedAt` at or after the moment of return), that one or the feed's,
  whichever comes first; what it brings came while away. A read that hasn't come within 5 s is given up. The
  closing read counts what it brings, so the order in which the query hands data down doesn't matter, and a feed
  refresh that cancels the catch-up read still ends the absence with the newer data.

## Checks, written first

- **Unit** (`unread-title.test.ts`):
  - `withUnseen` counts in the order messages came, across refreshes, so the first counted is the earliest; the
    viewer's own leaving doesn't move it;
  - `nextUnseen`: shown again after two counted, `away` holds both, the first first; a message while shown is never
    away; hidden and shown with nothing new leaves `away` as it was (none, or reached); an absence before the last
    was reached adds to it, after a reached one starts anew; reaching another absence's first changes nothing;
  - `awayWords`: «2 messages came while you were away», «1 message came while you were away»;
  - `dividerAt`: the first drawn entry among those counted.
- **Browser** (`unread-title.spec.ts`, the report's lever: `away(page, true)`, `window.fixture.say(...)` twice,
  `away(page, false)` on `/room.html`):
  - back with the chat closed, then opened: the divider with its words right before «The deck is in Resources.», and
    no line (the divider is in view);
  - the chat open while the tab was hidden: the divider shows just the same;
  - thirty while away, the chat opened at the newest: the line, `role=status`; Jump brings the divider into the
    chat's view with the focus on it and the line goes; hidden and shown again with nothing new, no line;
  - hidden and shown with nothing new: no divider, no line;
  - sending from the bar: the divider goes.
- **Added after review** (2026-10-19):
  - unit: answered from another device while hidden, nothing is left; written first, then Marco, his stays; a
    spoken turn changes nothing; an earlier absence, reached or not, answered after it goes; the viewer known only
    once shown, their own and what came before it leave;
  - browser: `say` then `sayElsewhere`, no divider and no line; `sayElsewhere` then `say`, the divider above Marco's;
  - browser, `holdFeed` (new in the fixture: while on, the events wait as a frozen page's stream holds them): nothing
    reached the hidden page, back and the divider says «2 messages…»; one counted before the hold and two after, the
    divider says «3 messages…» (the title still says (1) after the held two, so the late path is the one checked);
  - browser, reaching by reading: thirty while away, scrolled down to the divider without Jump, the line goes and
    stays gone back at the newest; the divider seen as the chat opens, reading back up brings no line; the chat open
    and read far back while hidden, the line shows and Jump goes down to the divider.

## Limits

- Only the room's chat marks it. Another view (Goals, Tasks) says nothing; the divider waits there for the room.
- A message of the viewer's own counted before their membership was read is counted in the line while their
  membership stays unknown, as it is in the title meanwhile; once it is known, it leaves with what came before it.
- With the divider already in view as the tab is shown, nothing is announced: the divider is read where it stands.
- The title's count while the tab is hidden is as #463 left it: a message the viewer has already answered from their
  phone still counts there until the tab is shown.
- One more snapshot read each time the tab is shown. The Studio's other reads already refresh on return (the query
  library's focus refetch); the snapshot was left to its feed.
- A read made on return that takes longer than 5 s is given up: what reaches the page after that is seen, as before.
