# Conversations: the thread as a conversation (C1)

> 2026-10-07 · Luis approved the «$20» critique of Conversations («arranca con K1 y luego itera», «Sigue»). C1 is its
> first slice: the open conversation's thread and its field.

## The gap (measured, 1440 px, `?demo=1`)

- **Plain text:** each message is a grey 12 px line of who and when, then its words. Sophia differs only by the colour
  of her name. Nine messages read as one column of text.
- **The field moves away:** «Continue this question with the team» sits after the last message. In a long thread it
  is off screen, and so is «Ask Sophia», a 16×16 box.
- **What the conversation made** («What it made») comes after the field, under the fold.

## What changes

- **A face for each author:** a person's initial in the app's circle (as in the room's tiles), Sophia's mark for her.
- **Runs:** messages by the same author within five minutes of each other form one run. Only the run's first message
  shows the face and the line of who and when. The others keep that line for a screen reader, hidden from sight.
- **Sophia's words on a quiet plane:** her messages sit on a faint halo-tinted plane, so a glance tells hers from the
  team's.
- **The field stays in reach:** on a wide screen the field is pinned to the bottom of the window while the
  conversation is read. «Ask Sophia» becomes a chip with her mark, still a checkbox (its state, its name), at least
  28 px tall.
- **What it made, under the title:** the report the conversation made opens from its head, not from after the field.

## Not in C1

- The list's rows and the context column (C2).
- The phone: list, then conversation, then context in a sheet (C3).

## Checks (written first)

- A person's message shows their initial; Sophia's shows her mark.
- A message that continues a run hides its face and its line of who and when from sight. Its accessible text still
  names the author.
- Sophia's message body has a plane; a person's has none.
- At 1440 × 700 with the thread longer than the window, the field is in the viewport while the first message is.
- «Ask Sophia» is a checkbox named so, shown with her mark, at least 28 px tall. Pressing its label toggles it.
- What it made comes before the messages.
- No contrast under 4.5:1 in the open conversation, and only the app's type sizes.
- The existing conversation checks pass unchanged (writes, follow-ups, the list).
