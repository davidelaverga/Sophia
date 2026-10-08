# Knowledge says one thing at a time

> 2026-10-08 · Luis asked for a critical look at Knowledge («¿pagarías 20 dólares?», alone and as part of the whole),
> then «Procede». This is the first of three PRs: the errors. The quiet pass (covers, metadata in words, «Edit») and
> the links from a source to its conversation or meeting come after. No API change.

## What reads as broken (demo, 1440 and 390 px)

- A designed report's head says «… · reviewed», and right under it the team's review row says «Not reviewed yet.»: two
  meanings of one word, side by side.
- In History every stable version wears «Current»: v1 and v2 both.
- The card shows the designed page (its cover, «HTML · v2»), but its title and its History open the Markdown.
- The demo's yellow label sits over the top bar, on «Knowledge» and «Updates» (on a phone, on the project's name).
- The demo's Conversations say «The conversations can't be read now»: the demo never asks for them.
- On a phone the pane's tabs break their words («Sources / 4») and the format switch runs off the screen.

## What changes

- **The head names the design check:** «design checked», «design findings open», «software-checked only»; the team's
  «Not reviewed yet.» keeps its words. Cards say the same.
- **One «Current»:** the fixture lists versions as the API keeps them (`packages/persistence/src/artifacts.ts`): the
  newest stable, each before it superseded. The product already tagged only stable versions; only the fixture lied.
- **A designed report opens as its page** from its title and its History, as from its cover: the version the card
  names, in HTML.
- **The demo's label in the bottom-left corner**, clear of the bars, the views and the room's controls (on a phone,
  above the room's dock and Personal's composer); it already lets every press through.
- **The demo holds its conversations** (`conversations=1` unless the address says otherwise), and its views bar
  opens them.
- **The tab bar wraps:** where the format switch doesn't fit beside the tabs, it takes its own line; the bar keeps its
  38 px on a wide screen, and its 50 px on touch.

## Checks (written first)

- The designed page's head ends «design checked» and never says «reviewed»; «Not reviewed yet.» is shown.
- History: two versions, only the newest «Current».
- Title and History each open the HTML format (History on its tab).
- On Knowledge, the room and Personal, at 1440 and 390 px, the label meets none of the bars, views, dock, «Join the
  room» or composer, and takes no press.
- `place=conversations&demo=1` lists conversations, no failure line, no unexpected request; from Knowledge, the
  views bar's Conversations opens them.
- At 390 px each tab's words keep one line and the format switch ends inside the screen.
