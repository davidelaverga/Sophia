# «Mark as seen» says what it clears

> 2026-11-16 · Lote 18, item 9 (evaluacion-2026-11-16/textos-lote-18.md, «Usuario experto»). The approved line,
> «Clears these from Updates and from the tab’s count.», named a count no tab keeps (checked below). Luis then chose
> «Clears these from Updates and from Home’s news.» (chat, 2026-11-16).

## Why

- «Mark as seen» (`DigestBody`, UpdatesView.tsx) gives no hint of what it does.
- **Checked:** its mutation (`useMarkSeen`) reads `['vision', 'since', projectId]` again: Updates' digest, and Home's
  window (`homeSinceKey`, useSinceNews.ts, under the same key on purpose) and the arrival band. The view nav
  (ViewNav.tsx) has no counts, and the browser tab's «(n)» (`useTabTitle`) counts the door, what waits on this person
  and the room's unseen messages, not updates. So «the tab’s count» was not true; «Home’s news» is.

## What changes

- The button (now `MarkSeen`) takes the app's tip (`Tip`, `has-tip`), aligned to its start (it sits at the column's
  edge), with «Clears these from Updates and from Home’s news.».
- Tips hide at 760 px or less and on touch, so the same words are the button's description (`aria-describedby`, an
  `sr-only` span beside the button, so its name stays «Mark as seen»), as Download does (DocumentPane.tsx).

## Checks

`room-updates.spec.ts`: the button's accessible description is the line, and on hover its tip shows it; on a phone the
description is still there.

## Not changed

What Mark as seen writes and reads again, its refusals' words. No API.
