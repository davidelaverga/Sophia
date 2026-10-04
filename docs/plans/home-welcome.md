# Home: the Welcome (the "$20" pass)

> 2026-10-04 · Luis · design note before code · after [entry-opening](entry-opening.md)

## Why

Luis: "elévalo recordando cómo está configurado Tasks y Resources, debe haber coherencia y nivel premium … microinteracciones y la atención al detalle."

Home is the first screen after the opening, and today it reads as a cover page, not a place that knows you. Measured at 1440×900 (2026-10-04):

1. **Two presses to your work.** The Work door only says "Open your projects · Design review and 2 more · 3 projects". The projects the opening just warmed can't be opened from here.
2. **Out of step with the Studio.**
   - Tasks and Resources are top-aligned columns with a view head (title, a summary on the right, a hairline), mono labels, status chips, times in mono and tiles that lift.
   - Home is vertically centred, full-width, with about 190 px of void above and 140 px below.
3. **Sophia is a static glow** on her own door. Her living light listens on the sign-in, not here.
4. **The Work door's faces read as a broken avatar**: the person's initial plus two dashed seats, even with three projects.
5. **Dismissing the first-visit note** ("Got it") re-centres everything: a 40 px jump.

## The idea: a place that knows where you'll go

Same anatomy as the Studio's views, one column of their width, top-aligned:

- **Head:** the greeting, with the date and a summary on the right (`3 projects · Standup in 10 min`), then the views' hairline.
- **Attention line:** only when something wants you now: a session about to start, or people in a room. It has the views' dot and one action (Join).
- **First-visit note:** stays one sentence. "Got it" folds it away smoothly, and nothing below jumps.
- **The two sides** keep their meaning (private on the left, shared on the right, the padlock between):
  - **You and Sophia:** her real light, at rest, in the door. Point at the door and she turns to you (`listen`, attention at the pointer); leave and she rests. When the space is locked, she is greyed behind the padlock as today. The door still continues the conversation (Continue · day · topic).
  - **Your projects:** the three Work shows first (the ones the opening warmed) as rows, one press each.
    - Each row has a monogram, the title, then the room ("Davide and Sophia are in the room", with a live dot) or the people and next session (amber when soon).
    - On the right, the faces in the room.
    - On hover or focus, its action: Open, or Join.
    - Below the rows: "All projects", with the count.
    - With none: a dashed empty row, "Start a project".
- **Microinteractions, from Tasks and Resources:**
  - Rows lift 1 px with the pointer light (`followPointer`) and press to 0.99.
  - The arrow nudges forward.
  - Faces scale gently.
  - A soon session's dot breathes.
  - ↑/↓ move between rows, Enter opens.
  - Tips name the keys (P, W, L, ↵).
  - Rows arrive with the views' small stagger.
  - Under reduced motion: no lift, stagger or breath; the light rests.
- **Coherence without collisions:** Davide's #76 changes `theme.css`, `board.css`, `resources.css`, the shared Sheet and TaskTile. Home reuses their classes and helpers (`.field-label`, `.count`, `.tag`, `.pill`, `Tip`, `Avatar`, `followPointer`) and edits none of them; its styles stay in `personal.css`.

## From the independent review

- **The call you are in:** its row says "Back to the room" and takes you back. A press on your own project never hangs up; leaving stays with the bar's room pill.
- **Without hover** (phones, tablets), a row that joins a room or goes back to yours says so before it is tapped.
- **Esc** folds the note the same way as "Got it". The padlock takes the focus without scrolling the page to it, so a phone doesn't jump.
- **Sophia's light** asks for no frames while Home is hidden: her box has no size, and she starts again when shown. The door follows the pointer once a frame, not once per event.
- **Loading placeholders** can't be pressed: no dead affordance.

## Not in this slice

- A name for email-only accounts in the greeting: the greeting stays "Good evening" without one.
- Activity ("while you were away") on Home: no summary read exists for it yet.

## Checks

- The rows are Work's first three, in its order; each shows its room or session, and opens or joins as Work would.
- ↑/↓ move between rows, Enter opens.
- With no projects, one empty row starts a project. While projects load, nothing claims there are none.
- The attention line shows only for a session that is soon or a room with people, and its action joins.
- "Got it" folds the note away and the doors don't move while it does.
- Sophia's light listens while the pointer is on her door and rests when it leaves. Locked, the door shows the padlock.
- Phone (390 px): one column, rows still one press, nothing past the screen.
- Reduced motion: nothing lifts or breathes.

## Before the PR

Luis sees a recording of Home with projects, a session soon, hovering both sides, and on a phone.
