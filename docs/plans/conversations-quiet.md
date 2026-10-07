# Conversations, quiet: premium and minimal

> 2026-10-07 · Luis, on the three panes built: «Excelente, muy buena base. Aunque aún se ve genérico y no premium.
> Minimalista». The iteration he approved («Me convence»): https://claude.ai/artifact/7A2RBBS49uXnMiyw5kmrHk (v3).
> This note builds on `docs/plans/conversations-panes.md` (the layout) and `docs/plans/conversation-thread.md`.

## What read as generic

- A line round every box: the panes, the bubbles, the summary, the field, the chips.
- Every message carried a face and a byline with its time.
- The textarea had its resize handle.
- What the conversation made was a full-width strip.

## What changes

- **Tone, not lines:** the list and the context sit on the plane, the conversation on the void. No border between panes,
  none round a bubble or a section.
- **People speak in bubbles; Sophia speaks in light:**
  - A person's message is a bubble. Yours are on the right and warm; the team's are on the left, named once a run.
  - Sophia's has no bubble. Her mark sits in a soft halo and her words are in the core white, a size larger. While she
    answers, the halo breathes.
- **Times wait under the pointer** (or the focus). A screen reader still hears who and when on every message. The day
  is said once, as a quiet mono line.
- **One floating field:** it grows with what is written and has no handle. Inside it are Sophia's mark, the «Ask
  Sophia» checkbox (a ring that fills when on), and Send (an arrow that lights once there is something to send).
  Under it: «Sophia will answer» or «To the team only».
- **The head:** the title, faces beside who wrote there, and what it made as a small page with its name.
- **The list:**
  - Each row is the title and when it last moved, then the summary in one line, and what is open as an amber count.
  - Who wrote there and what is open are said in words to a screen reader.
  - Rows show the summary because A18 has no last message yet.
- **The context:** unboxed sections with mono labels. Decided items carry teal ticks; open ones amber dots.

## From the panes' review (P2s), fixed here

- On a phone, a conversation opens at its newest message.
- The context panel sits under the bar (z 19), so the account menu opens over it. It measures against the whole view,
  not the third column the wide layout gives it (that column is gone under 1180 px).
- Esc closes the panel only when nothing else owns the Esc (a dialog, a menu's own Esc).
- A panel left open closes when the window grows past 1180 px.
- Behind an open panel, the list and the conversation are inert.

## From the independent review, fixed here

- **What it made, opened beside the conversation, left it about 90 px** (P1): the side report narrows the page, but
  the panes went by the window's width. They now go by the page's (a container query): beside a report at 1440 px,
  the list and the conversation, the context a panel; at 1280 or 1000 px, the conversation alone. A wide screen opens
  on the conversation, so one pane is the one being read.
- The messages line up with the field under them.
- Behind the open panel the room's dock is inert too: Tab never lands on it, unseen.
- «Ask Sophia» off is a 10 px ring that reads at 3:1.

## From Codex on #155, fixed here

- While a note is on its way, Send shows it: a turning arc in the arrow's place (still under reduced motion), and
  «Sending…» to a screen reader.
- With no conversation open (none yet, or a new one being written), «Context» sits in the list's head under 1180 px:
  the project's context is never out of reach. Over 1180 px it is a pane, and the list has none.

## Checks

- Sophia's message has no bubble and her mark is lit; a person's has a bubble and is named once a run.
- A time is hidden at rest and shown under the pointer; one day line for one day.
- No border between the panes; the field has no resize handle.
- Each review P2 has its own check: the phone at the newest message (on a phone short enough for the thread to
  overflow), the account menu over the panel where they overlap, a modal's Esc leaving the panel open, inert behind
  it, closing on growth.
- The report opened beside the conversation at 1440, 1280 and 1000 px: at least 400 px to write, Send in reach.
- The messages and the field share their edges at 1920 px; the ring reads at 3:1.
- Contrast 4.5:1 and the work views' type sizes in the open conversation; every conversation check still passes.
