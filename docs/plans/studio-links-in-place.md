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

## A report beside the work closes when the link names none (2026-10-22)

> The follow-up list (`evaluacion-2026-10-16/seguimientos-p2.md`, Studio: #419 `studio/InPlaceLinks.tsx`, «Clear a
> report omitted by the followed URL»), one of Luis's open questions; Luis 2026-10-22: «Procede con la P2 y pon tus
> sugerencias a las preguntas», the coordinator's answer built: the link says where to go.

- **What it did.** With a report open beside the work (a wide page, side-sized), a link of this project that names no
  report (a conversation's, in a message) showed its view and left the report open, its parameters still in the
  address: `InPlaceLinks` only opens a report, never closes one, and the router's view change carries `report=` from
  the address it leaves (`useProjectRoute`'s `go`, for the bar's views, where that is right).
- **What it does.** The report closes and leaves the address. The link's entry is the one Back steps back from, so Back
  opens the report again, as the browser's history would. A link that names a report still opens it, or takes the
  place of the one on screen.
- **How.** The viewer gives `leave(push)` (`viewer-context.ts`): the report out of the address, in a new entry or in the
  one on screen, without the viewer's depth (it's the link's entry, not one of the viewer's intents, so a later close
  never steps back over it). `InPlaceLinks` calls it after the view, before the fragment (see the review below), and only when a report is shown
  and the link names none. Which entry: a link to another view has the router's push (its path moved), so the report
  leaves that one; a link within the view on screen adds none of its own (only its fragment is written), so it pushes
  one. Otherwise Back from the link would land before the report was opened, not on it.
- **A phone, or the report at full size.** The pane covers the page under the bar, so no message link is in reach
  while it's open (375×812: `elementFromPoint(187, 600)` is the report's Markdown). The code is the same at any size.
- **Check, written first (`studio-links-in-place.spec.ts`).** Conversations with the report open beside them; a link to
  another conversation in the open thread: that conversation opens, the report is hidden and the address has no
  `report=`; Back: the report is back and so is its `report=`. Red before the fix: the pane stayed visible («expect
  (locator).toBeHidden() failed … Received: visible»).
- **Not covered by a browser check.** The fixture page has no router (a view change there pushes nothing), so Back
  after a link to another view is not run in a browser; the units below pin which entry the report leaves.

### After the independent review (2026-10-22: no P1, no P2; one point)

- **Back brought the report back beside the linked conversation's address.** Within the view, the fragment was written
  into the report's own entry before the report left in a new one, so that entry named the link's conversation. Now
  the order lives in `followHere` (`app/in-place.ts`, pure; `InPlaceLinks` gives it the shell, the address and the
  viewer): the view, then the report leaves, then the fragment (in the link's entry), then a report the link names
  (the order it had).
- **Checks, written first.** The browser check starts at the first conversation and expects Back to give its
  `#conversation-…` again beside `report=`; red before the fix at «Expected: "#conversation-…c1" Received:
  "#conversation-…c2"». `in-place.test.ts`: within the view, «leave in a new entry» then the fragment; to another view
  whose push moved the path, «leave in the entry on screen»; a view change that pushes nothing, a new entry; a link
  naming a report opens it, and with none on screen nothing closes. Red against an outline that threw «followHere not
  written yet».
- **Found while building, not changed here: the conversation on screen doesn't follow that Back.** The address is
  right, but Conversations keeps the linked one open. Back between entries whose query differs too (`report=` in one,
  not the other) fires `popstate` only, no `hashchange` (measured: the one event after Back was `popstate`), and
  `useAddressed` follows `hashchange` and `ADDRESS_NAMED`, never `popstate`. Following `popstate` too touches every
  view that reads the fragment (tasks, goals, decisions, requests, messages), and "the fragment changed" can't be read
  there (a view's `replaceState` tells nobody), so a choice made since could be undone by a Back. A follow-up of its
  own.
