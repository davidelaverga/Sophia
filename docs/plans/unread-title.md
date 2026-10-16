# A message that comes while the tab is hidden counts in its title

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, messaging). A message written in the room's chat
> while the Studio's tab was in the background said nothing: only someone knocking at the door counted in the tab's
> title. Studio only.

## What changes

- **The project's tab title already leads with what waits:** «(2) Project · Sophia» for people at the door
  (`projectTitle`). It now counts too the messages written in the room's discussion while the tab was hidden.
- **What counts:** typed messages (`origin: composer`), not the viewer's own where the call knows who that is. Spoken
  turns don't count; captions say those.
- **Seen, the count goes:** the tab shown again marks the discussion seen. No sound and no notification: a message is
  not a knock.
- **`unread-title.ts`** (pure) counts; `useUnseenWhileHidden` follows the page's visibility.

## Checks

- **`unread-title.test.ts`:** counts the typed messages not seen, never the viewer's own; a voice turn doesn't count.
- **`unread-title.spec.ts`:**
  - two messages from another member while the tab is hidden: «(2) Fixture project · Sophia»;
  - shown again, the plain title;
  - a message while the tab is shown doesn't count.
