# The shortcuts announce themselves once

> 2026-11-16 · Item 8 of `evaluacion-2026-11-16/textos-lote-18.md` («Los atajos se anuncian una vez»). Luis approved
> the line on 2026-11-16: «Tip: press ? to see the keys for this view.»; one tap closes it and it never shows again.

## What was measured

- The index of keys (`commands.md`) opens on `?` where no field takes stray typing, on `⌘/` / `Ctrl+/` anywhere, and
  from the account menu. Nothing on the page says so: a person who never opens the account menu never learns it.
- `?` is a letter, not the index, while a field on screen takes stray typing (the Studio view's chat open,
  Personal's composer ready). Tasks, which `commands.spec` treats so, does open the index on `?` now (measured
  2026-11-16 on the fixture: `?` from nowhere opens «Keyboard shortcuts»).

## What changes

- **`KeysTip`** (`app/KeysTip.tsx`), rendered by `CommandsHost` (so in every project view and in the places): a small
  note in the bottom-left corner, «Tip: press ? to see the keys for this view.» (the `?` as a key), with Dismiss.
  - Shown once per browser, not per view: the first page with keys that can show it. Dismiss, or opening the index
    any way, keeps `sophia.keys-tip` = `seen` (`app/keys-tip.ts`); it never shows again, after a reload too.
  - Once per browser, not per account, by choice: it holds nothing private, and a second person on the same browser
    has the account menu's «Keyboard shortcuts» all the same.
  - Only where its words are true: while no field takes stray typing (`typingSink`), no field has the caret (an
    input, a text area, a select or an editable), and no sheet is up; it waits, unseen, meanwhile (the Studio view's
    chat open, the caret in a composer) and shows when the page lets `?` through.
  - Not where there is no keyboard to speak of: `(hover: none)` (phones, tablets).
  - Polite: a `role="status"` mounted all along, so it is announced as it comes; it never takes the focus. It is drawn
    at the end of the page (a portal to `body`), so Tab reaches it last, never in the middle of the view.
  - Storage that cannot be read (private mode, blocked): treated as seen. A tip that can't be kept closed would come
    back on every visit.
- **Over no control** (after the review, 2026-11-16: it covered the room's dock on mouse windows under ~1200 px, and
  Conversations' list and composer at 1280):
  - It sits above the floor band, `bottom: calc(var(--floor) + var(--dock-h) + 16px)`, where the dock and the
    composers are.
  - It is never shown while its box meets a control (a button, a link, a field, anything with a tab stop): the same box
    is measured unseen (`keys-tip-measure`, hidden and inert) and checked again a frame after the page changes, the
    window resizes or the focus moves. Where it would cover one, it waits for a page where it doesn't.
- **An ignored tip ends:** each visit that shows it counts once (`sophia.keys-tip` = 1, 2); the third such visit keeps
  it seen, so a tip let be for three visits never comes back. The watch (observer, resize, focus) runs only while the
  tip is unseen on that page and stops when it ends.
- **Another tab** ends it too: a `storage` listener on `sophia.keys-tip` hears it kept seen elsewhere.
- The checks (`use.storageState` from `e2e/tip-seen.ts`, in each Playwright config) start with the tip seen, so the
  checks that are not about it see the page as before; `keys-tip.spec.ts` starts with an empty store.

## Checks (written first)

- `keys-tip.test.ts`: unseen on an empty store; seen once kept; a store that throws reads as seen and keeps without
  throwing; the visits counted to seen; anything else kept reads as seen; boxes that meet and boxes that only touch.
- `e2e/keys-tip.spec.ts`: the first visit shows the line, over no control, and announced (in a status); the focus
  stays where it was; Dismiss closes it, and after a reload it is gone; opening the index by `?` ends it too; with the
  chat open it waits; `@phone`: never there.
- After the review: in a call at 1024×768 and 960×800, and in Conversations with nineteen conversations at 1280, no
  control's centre is under it (`elementFromPoint`) and, when shown, no control's box meets it; the caret in the
  Conversations composer hides it and leaving the field brings it back; dismissed in one tab, it ends in another;
  three visits show it, the fourth doesn't; its Dismiss follows every other control in the page's order.
