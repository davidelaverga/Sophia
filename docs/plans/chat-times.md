# When each message in the room's chat was said

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.2): the room's chat shows no
> time and no day. Once the earlier discussion can be read (#350), a message from last week reads like one from a minute
> ago. The typed turns with Sophia also show their links as plain words, though the discussion links them. Every chat app
> shows both: Meet, Slack and Teams put the time by the name and a day line between days. Luis's queue, item 3.

## What changes

- **`chat-days.ts`** (pure): for each message, the day line it opens, or none.
  - The first message of each day in the viewer's zone opens one: «Today», «Yesterday», a weekday within the week,
    then the date (`time-words.ts`'s `dayLabel`, never ahead).
  - A time that isn't one opens nothing.
- **The discussion:**
  - The day line above the first message of each day.
  - Each message's time by its author, on a 24-hour clock (`clock`), as `<time datetime>`.
- **The typed turns with Sophia:**
  - The time of «You».
  - The words, and Sophia's reply, through `LinkedText`, as the discussion's are.
- **The fixture:**
  - `discussion=days`: two messages from yesterday and two from today.
  - A message written on the page is dated now.

## Checks

- `chat-days.test.ts`: a line for each day's first message, and none for the rest; a malformed time opens none.
- `chat-times.spec.ts`:
  - the discussion over two days shows «Yesterday», then «Today», and a time by each author;
  - a link in a typed turn opens in a new tab with no opener.
