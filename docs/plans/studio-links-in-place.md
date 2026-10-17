# A link to the project a message is read in opens here

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, messaging): every link in a message opened a new tab
> (`LinkedText.tsx`), a link to a task or a conversation of the same project too. In a call that leaves the call in
> another tab. Studio only.

## What changes

- **A link to the project the message is read in is followed here.** It's an address of the Studio's own origin whose
  path names this project (`/p/<project>/<view>`). It shows its view, opens what its fragment names (a conversation, a
  task, a goal: the views already follow the address, `useAddressed`) and opens the report it names in the viewer. The
  call stays, as it does when a view is picked in the bar.
- **Everything else opens a new tab, as before:**
  - another site;
  - another project: opening one leaves the call (`projectOnScreen`);
  - a place, an invitation or the legal pages;
  - a passage of a report (`passage=`), which the viewer opens only from the address it loads with.
- **A press with Ctrl, Cmd, Shift or Alt, or a middle press, is the browser's.** A link followed here carries no
  `target`, so those still open it apart.
- **`app/in-place.ts`** (pure) reads where such a link leads: its view, its fragment and its report.
  `features/studio/InPlaceLinks.tsx` gives the shell's way to follow one to `LinkedText`. It sits inside the report
  viewer, so a report link opens there. Outside a project (Personal) nothing is followed in place.

## Checks

- **`in-place.test.ts`:**
  - this project's view, fragment and report;
  - nothing for another origin, another project, a place, an invitation or a passage.
- **`studio-links-in-place.spec.ts`:**
  - in a call, a conversation's link in the room's chat opens Conversations at it, in this page, and the call stays;
  - a report's link opens it in the viewer, here;
  - a link to another site or another project keeps its new tab.
