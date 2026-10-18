# Conversations: a link to copy, new messages said, Alt+↑/↓

> 2026-10-16 · Luis's QoL queue, item 4 (informe-brechas-a-fondo.md §3). Since #375 a conversation has its own address,
> but nothing hands it over: «Copy link» is missing. A message that comes while the reader is scrolled up lands out of
> sight, and nothing says so. Moving between conversations takes the mouse; Slack and Teams use Alt+↑/↓. Studio only,
> behind the vision flag until A18 is served.

## What changes

- **Copy link** in the open conversation's head, beside Context, always copies that conversation's own address
  (`#conversation-<id>`), whether or not it is in the address bar yet. `CopyLink` takes the address to copy.
  - Refused by the browser while the address bar doesn't hold it (the newest, opened by default), the link is handed
    over under the press, selected, to copy by hand, until Escape or a press elsewhere (Codex P2 on #382).
- **«New messages ↓»:** a pill over the field.
  - It shows once the thread grows at its end while the reader is away from it (`useFollow` already knows).
  - Pressed, it takes the thread to its end and gives the focus to the thread.
  - It goes once the end is reached by scrolling.
- **Alt+↑ and Alt+↓** open the conversation above or below the open one in the list as shown (its filter applied),
  from anywhere in the view but a sheet. The focus goes where it was: a field to the new field, else the new row.

## Checks

`conversation-moves.spec.ts`, on the fixture's conversations:
- Copy link copies the open conversation's address, the newest's by default;
- refused, it hands that address over, selected, past the failure's few seconds; Escape gives the focus back to it;
- scrolled up, a message from Marco brings «New messages»; pressing it reaches the end and the pill goes;
- at the end, a message from Marco brings no pill;
- Alt+↓ opens the second conversation and Alt+↑ goes back; with «Open» filtering the list, Alt+↓ skips the
  conversation filtered out.
