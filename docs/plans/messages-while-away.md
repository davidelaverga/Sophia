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

## Limits

- Only the room's chat marks it. Another view (Goals, Tasks) says nothing; the divider waits there for the room.
- A message of the viewer's own counted before their membership was read, and still unknown as the tab is shown, is
  counted in the line, as it is in the title meanwhile.
- With the divider already in view as the tab is shown, nothing is announced: the divider is read where it stands.
