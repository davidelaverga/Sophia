# Focus kept, and what opens has an address

> 2026-11-22 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 2, 3, 28
> and 29). Luis: «Yes, batch B». Studio only, no API change. Follows `one-truth.md` (batch A).

## Measured

On the rehearse dev stack (`df4b4a518`, :5173), keyboard and mouse:

- **The focus fell to the page (2)** after seven presses: Hold, Resume, Stop for good, Send invitation (by click),
  Create the room link, Leave the room, Join the room. `document.activeElement` was `body`; measured again here for
  Join and Leave. The cause, each time: the pressed control turned natively `disabled` while its request ran (which
  drops the focus) and was then replaced (Hold by Resume, Create by the link's Copy, Join by the dock's controls).
- **No address for what opens (3).** A goal's sheet offered Copy link (`#goal-<id>`), but opening it left the address
  as it was; the side panel and Invite's tab weren't in it either. A reload closed all three.
- **First run (28).** Each new step put the focus on its `h3` title (`tabIndex=-1`), drawn with the focus ring, so it
  read as a field; the field itself needed a click. Work's New project focuses its field.
- **A role change (29)** said nothing when it landed, and a refusal on another row («A project needs an admin: make
  another member an admin first») stayed on screen. Its select turned `disabled` while saving, dropping the focus.

## What changes

- **The focus is kept** (`app/useFocusKept.ts`, choice in `app/focus-kept.ts`, with tests). A box watches itself:
  when the control that had the focus leaves, or turns natively disabled, within 30 s of a press inside the box, and
  the page holds the focus, the control that takes its place gets it: one in the same slot (`data-focus-slot`: Hold
  and Resume share «pause»), else the control at its place, else the box's fallback (`data-focus-fallback`). When the
  slot's control comes later (Hold → the goal is holding, only Stop left → held, Resume), the focus moves on to it if
  it is still on the stand-in. A focus moved on purpose (a click elsewhere, Tab away) is left alone, and only a press
  on one of the box's controls counts (a press on its words or gaps hands nothing on later).
  - A goal's controls: Hold → Resume, Resume → Hold, Stop for good → the goal's status line («Sent · Stop
    requested.»), which takes the focus only when no control is left (no ring for a mouse). The commands wait with
    `aria-disabled` while one sends, as `ConfirmButton` already does, so the pressed one keeps the focus meanwhile.
  - The dock: Join → the microphone, Leave → Join (its anchors, `data-call-anchor`), after a key's press only. A
    mouse that joins leaves the focus on the page, as before: there Space is push-to-talk («Hold Space to talk»); on
    the microphone, Space would toggle it on and leave it on (found by the review before the push).
  - Invite: Create the room link → Copy link; Send invitation → the address field, empty for the next one (the field
    and the press share a slot; Send waits with `aria-disabled` while sending).
- **What opens has an address**, written as the lens is (`?lens=`, `studio-lens-address.md`): `replaceState`, no
  history entry (`app/address-param.ts`, with tests).
  - An open goal writes `#goal-<id>`, the very address its Copy link copies; closing takes it away. A refused copy
    now points to the address bar, which holds it (`CopyLink`'s own rule).
  - The room's open panel: `?panel=chat|people|brief`, while the Studio view shows (a shell kept out of sight for its
    call neither reads nor writes it); a reload opens it again. The route's own moves drop it with the lens and
    write it again (`useAddressMoves`).
  - Invite: `?invite=guests|members|calendar` while the sheet is open; an address naming it opens the sheet on that
    tab, for whoever may invite and behind an open door only (`shellAt`); closing takes it away.
- **First run**: each new step's field (its first choice on step 2) takes the focus, read with the step's region
  name; the title takes none. `home-first-run.md` says so now.
- **A role change** says «Saved» under its select for 2.5 s; every refusal on the list goes, since the roles it
  spoke of have moved (`role-notes.ts`, with tests); the select waits with `aria-disabled`, keeping the focus.

## For Luis: Back

The evaluation asked that Back close what opened. That needs a history entry per sheet (`pushState`), and the house
rule is the opposite: `link.ts` and `studio-lens-address.md` write with no history entry, and
`addressed-follows-back.md` is built on it («a close updates nothing, on purpose»). Two options:

- **Keep it as it is (recommended).** Reload and a pasted link reopen; Back leaves the view, as with Resources and a
  task's sheet. No change to the address rules.
- **Push an entry per sheet.** Back closes the goal, the panel, Invite. Cost: every `useAddressed` caller's rules
  revisited (13 calls in 9 files), and a sheet closed by Back must not reopen on Forward. A batch of its own.

## Words

One new word, for Luis to approve: «Saved» under a role's select (alternative: «Role saved»). It is the goal targets'
own «Saved».

## Checks

- `focus-kept.test.ts`: the same slot first, wherever it stands; else the control at its place; never an unusable
  one; the fallback only when no control is left.
- `address-param.test.ts`: a known value read, an unknown one not; set and drop, the lens and the report kept.
- `role-notes.test.ts`: Saved on the row, a refusal on another row cleared, another status kept, Saved gone after.
- `e2e/focus-kept.spec.ts`: by keyboard, Hold → Resume → Hold, Stop for good → the status line, Create the room link
  → Copy link, Send invitation → the field, Join → the microphone, Leave → Join; never the page.
- `e2e/goals-overview.spec.ts`: the copied link equals the address bar; an open goal in the address, gone on close,
  back on reload; a refused copy points to the address bar.
- `e2e/home-first-run.spec.ts`: the first choice and the project's field take the focus, never the titles.
- `e2e/member-roles.spec.ts`: Saved beside the select, then gone; the earlier refusal cleared; the select keeps the
  focus; waiting selects are `aria-disabled`.
- `e2e/type-tip.spec.ts`, `room-discussion.spec.ts`, `app-auth.spec.ts`: a reload opens the chat again
  (`?panel=chat`), so their helpers no longer press Chat after one.
- One independent review of the whole diff before the push: one P1 (the dock's handoff and push-to-talk) and P2s (a
  press outside a control, `?invite=` for anyone, three specs a reload or the address bar now changes), fixed.

## Left

- **Back** (above).
- **A mouse in the dock** keeps today's behaviour (the page holds the focus), for push-to-talk.
- **A viewer's pasted `?invite=`** opens nothing, and the parameter stays in their address until the route moves.
- **A shortcut's press** (Ctrl+J from elsewhere) isn't a press inside the box, so its lost focus isn't handed on;
  the press on the control itself is.
- **A legacy path** (`/p/<id>` without a view) keeps only the lens and the report when the router normalizes it, so
  `?panel=` and `?invite=` need the view's own path, which is the one written.
