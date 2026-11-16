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
  - Only where its words are true: while no field takes stray typing (`typingSink`) and no sheet is up; it waits,
    unseen, while one does (the Studio view's chat open), and shows when the page lets `?` through.
  - Not where there is no keyboard to speak of: `(hover: none)` (phones, tablets).
  - Polite: a `role="status"` mounted all along, so it is announced as it comes; it never takes the focus.
  - Over nothing a person works with: the corner has no control in the views (checked: no button, link or field
    under it).
  - Storage that cannot be read (private mode, blocked): treated as seen. A tip that can't be kept closed would come
    back on every visit.
- The checks (`use.storageState` from `e2e/tip-seen.ts`, in each Playwright config) start with the tip seen, so the checks
  that are not about it see the page as before; `keys-tip.spec.ts` starts with an empty store.

## Checks (written first)

- `keys-tip.test.ts`: unseen on an empty store; seen once kept; a store that throws reads as seen and keeps without
  throwing.
- `e2e/keys-tip.spec.ts`: the first visit shows the line, over no control, and announced (in a status); the focus
  stays where it was; Dismiss closes it, and after a reload it is gone; opening the index by `?` ends it too; with the
  chat open it waits; `@phone`: never there.
