# The chat at a person's pace

> 2026-11-23 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 1, 9, 17
> and 10). Luis: «Keep the rule, batch C». Studio only, no API change. Follows `one-truth.md` and `focus-kept.md`.

## Measured

On the rehearse dev stack (`df4b4a518`, :5173), and again on this branch's Studio (:5176, same API) before the change:

- **Sending (1).** With every `POST` held 5 s, the only change on Send was the press turning off: no message, no
  «Sending…», no `aria-busy`. A refused send kept its words in the bar with «That didn’t go through. Try again.»; a
  lost reply said «Not confirmed: “…”» above the bar, with Try again.
- **A new message behind a closed chat (9)** lit a 7 × 7 px dot on Chat and changed its name to «Chat, something new»
  (`SidePanel.tsx`); nobody heard it, and who wrote what was a press away.
- **Runs of messages (17).** 25 messages in a row from one author repeated the name and the time 25 times.
- **Copy refused (10).** Invite's Copy link did nothing visible when the browser refused the clipboard, by design
  («the link is on screen to select»); a member's invitation link is on screen nowhere.

## What changes

- **A message to the room is drawn at once** (`pending-message.ts` with tests, `PendingMessage.tsx`): at the end of
  the discussion, «You» and its words, dimmed with «Sending…» and `aria-busy` while it goes; the bar empties for the
  next words. The row goes the moment the discussion holds the message (the receipt's `contributionId` is the entry's
  id, as the API's message acts already read it), or, while it goes, a new entry of this person's with its words (one the
  discussion didn't hold when the send began) brought by the feed before the reply; once held, it stays gone (withdrawn, or past the discussion's newest
  50, it never comes back as a row). It is never drawn twice; two tabs see one message, by the feed.
  - **Reply lost:** the row says «Not confirmed.» with Try again (not offline: the line above the bar says what
    waits), which sends it again under its key (the service replays it: one message). The row stays even when the feed shows
    the message: matching it by its words could take an earlier one for it, and lose it. After a reload the tab's kept message shows on its row the same way
    (`held-in-tab.ts`). The line above the bar no longer repeats it while online; offline, its words are as before.
  - **Refused** (a 4xx, or a 5xx with no body of the API's): the words go back to the bar with the line above it, as
    before («That didn’t go through. Try again.»); if the bar holds other words by then, the message keeps a row of its
    own, «Not sent.», whole (its words, the reply it went as, the members it named), with a Try again that sends it as
    it first went; it goes only when that lands or its words go back to an empty bar, so sending the next message never
    loses it (`afterSend`, with tests).
  - The fixture's receipt now names the entry's id, as the API does.
- **A new message peeks** beside the closed chat (`peekOf` in `side-panel.ts` with tests, `useChatPeek`,
  `ChatPeek`): who wrote it and its first line, for 6 s, over the corner where it rests on the floor and under it
  where it goes up; a press opens the chat. Someone else's only, never on the first read, never with the chat in
  view, and not for an older message that becomes the newest when the newest is withdrawn; opening the chat clears it.
  It is said politely from a line mounted all along (`role="status"`), so only what arrives is read, never the
  history. The dot stays.
- **One name and time per run** (`goesOn` in `chat-days.ts` with tests): a message from the same author in the same
  minute, with nothing between (no day line, withdrawn place, quote, gap or «while away» line), goes on the line
  above: its name is read but not shown (`sr-only`), its time shows under the pointer or the focus, at the line's end,
  moving no word; the lines sit 2 px apart instead of 6.
- **A refused copy in Invite** says so in Your data's words («Couldn’t copy here. Your browser blocked the
  clipboard.», `NOTICE.clipboardBlocked`) and hands the link over in a field on its own line, focused and selected,
  for the room link, a guest's emailed link and a member's invitation alike (`useCopy`, the copy hook `CopyLink`
  uses). A goal's or a task's Copy link already does this (batch B points it to the address bar).

## Words

For Luis to approve:

| Where | Words | Alternative |
| --- | --- | --- |
| A message on its way | «Sending…» | «Sending» |
| Its reply lost | «Not confirmed.» + Try again | «Not confirmed: tap to send again» |
| Refused, the bar busy | «Not sent.» + Try again | «Didn’t send.» |
| The row's list (screen reader) | «Your message on its way» | «Sending» |
| A peek (screen reader) | «New message from Davide Can we move…» | «Davide wrote: …» |

«Couldn’t copy here. Your browser blocked the clipboard.» is Your data's, already approved.

## Checks

- `pending-message.test.ts`: drawn while sending; kept where the reply was lost; giving way when the feed brings it
  first; gone once the discussion holds it, and never back once landed; nothing here for a refusal.
- `room-message-send.test.ts`: recorded, back to an empty bar, a row of its own, a row's own refused Try again, no
  reply.
- `side-panel.test.ts`: a peek names its author and first line; none on the first read, for an entry seen, your own,
  or an older one become the newest; a long line cut.
- `chat-days.test.ts`: a run in one minute; another author, a day line, a withdrawn place or a line kept apart start
  again; a time that isn't one never groups.
- `elevation.test.ts`: the peek's shadow recorded, the corner's own.
- `e2e/chat-pace.spec.ts`: a send slowed 2 s drawn at once, dimmed and busy, the bar empty, then once on the page;
  a peek with its first line only, said politely, that opens the chat and isn't shown with the chat open; a run's
  second line goes on, its name kept for screen readers; a refused copy of a member's invitation said, its link in a
  focused, selected field.
- `e2e/room-discussion.spec.ts`: a lost reply's message is on its row, not in the bar, before and after a reload;
  the row's Try again sends it once under its key; what was written since stays.
- On the dev stack (:5176): with every `POST` held 5 s the row showed in 11–12 ms, at 0.55 opacity, and the words
  were drawn exactly once at every half second until and after the reply; message A refused (500) while the bar held
  B kept its row through B's send, and its Try again wrote it once (one A, one B); a 500 put the words back in the bar with «That didn’t go through. Try again.», and the retry wrote one; a lost
  reply's row sent it again, one message; Davide's message in another tab peeked at Luis, over the corner, and opened
  the chat; a run of three showed one name; a refused room link copy showed the link selected (the room link created
  for it was turned off again).

## Left

- **Grouped lines start at the gutter**, not under the first line's words: the discussion lays a line out as name,
  time and words in one run, so there is no column to line them up with. A column layout is a design change.
- **The peek doesn't reach another view** (Goals, Tasks): the toast would, but it lives above the projects
  (`SignedIn`), and the room's corner is where the dot already is. Worth a decision: a toast for a message out of
  sight, with Open.
- **A reply's chip and the mentions** chosen for a message stay above the bar while it goes, and clear once it lands,
  as before; with the bar now empty meanwhile, they read as the next message's for those seconds.
- **The copy field in Invite** goes with the next press or the sheet; Escape closes the sheet, as before.
- **One independent review before the push** found two P1s (a refused message lost when the next one went; a sent
  message coming back as a row once withdrawn), four P2s and P3s; all fixed but the three lines above.
- **Two messages sent fast**: Send waits while one goes, as before, so the second waits in the bar.
