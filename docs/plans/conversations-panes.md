# Conversations in three panes

> 2026-10-07 · Luis, on the first take of C1: «No me gusta cómo se ve… está todo mezclado y mis ojos no saben dónde
> mirar». Shown two prototypes (https://claude.ai/artifact/7A2RBBS49uXnMiyw5kmrHk), he chose three panes: «Three panes
> pero hay que optimizar también para móvil». This note replaces C1's layout. Its thread work stays
> (`docs/plans/conversation-thread.md`): faces, runs, Sophia's plane, the «Ask Sophia» chip.

## The layout

**One thing per pane.** Each pane scrolls on its own; the page itself never scrolls.

- **Left, the list:** «Conversations» with New (a + press), the filter, and the rows.
- **Middle, the open conversation:**
  - its head: the faces of who wrote there, its title, who they are;
  - what it made, as a strip under the head;
  - the messages, in bubbles: yours on the right, warm; the team's on the left; Sophia's on her plane, with her mark;
  - the field, at the pane's foot, always in reach.
- **Right, what it rests on:**
  - this conversation, its summary and how many questions are open;
  - then the project's mission, its accepted decisions and what is still open;
  - then how the context works.

**The widths:**

- **Over 1180 px:** three panes, 300 · the rest · 300.
- **721 to 1180 px:** the list and the conversation. The context opens from «Context» in the conversation's head, as a
  panel over the right edge. Close, Esc or a press outside closes it, and the focus goes back to «Context».
- **A phone (720 px and under):** one screen at a time.
  - The list first. Opening a conversation shows it alone, with a way back («All conversations»).
  - Its context rises from the foot.
  - The room's floating dock stays on the list. In a conversation it steps aside unless a call is on.

**The room's dock never covers the field.** Over 1180 px it floats over the context pane, which leaves room at its foot.
Under 1180 px, the field leaves room under it while the dock is there.

**The field follows what is written:**
- A message sent comes into sight, and so does «Sophia is answering…».
- A thread read at its end stays at its end as messages arrive.
- A thread scrolled up stays where the reader is.

## From C1's review, kept

- «Ask Sophia» says on and off by more than a colour: a tick in a box.
- The new conversation's chip is the same.
- Two members with no id never form one run.
- A face's letter is a whole character.

## Not in this slice

- **The rows as the prototype shows them** (the last message, the time, the filters Open questions and Mine): the rows
  need the conversation's last message, a field A18 does not have yet. That is the next slice, with the proposal to
  Davide.
- Quick asks («Summarize so far»), «Talk it over in the room», «Propose a decision from this».

## Checks (written first)

- At 1440 px the three panes sit side by side and the page does not scroll. The field sits at the window's foot with
  the thread's first message read.
- At 1440, 1000 and 900 px, nothing covers Send; at 1440, nothing covers the context's last line.
- At 1000 px the context is hidden until «Context» opens it. Its Close takes the focus; Esc closes it and gives the
  focus back.
- On a phone:
  - the list shows and the conversation does not;
  - a row opens the conversation alone, and its way back returns to the list with the focus on that row;
  - the room's dock is not over the conversation.
- A note sent while the thread is scrolled up comes into sight.
- Your bubbles sit on the right, the team's on the left.
- The summary is in the context pane, as «This conversation».
- The existing conversation checks pass, adapted where they named the old places (the summary, «Contributors:»,
  the phone).
