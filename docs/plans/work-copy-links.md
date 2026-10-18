# A goal's link and a task's link

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, work). A goal or a task can be named in an address
> (`#goal-…`, `#task-…`, `resources/link.ts`), and Resources' sheet has «Copy link», but a goal's sheet and a task's
> had none. Studio only.

## What changes

- **«Copy link» in a goal's sheet and in a task's,** Resources' own press (`CopyLink`): it copies the address that
  opens that goal or task, says «Link copied» for a moment, and says where the link is if the browser refuses. When
  the address bar doesn't hold it (a goal opened from the list), the refused link is handed over under the press,
  selected, to copy by hand; Escape closes only it, not the sheet (Codex P2 on #382).
- **The address is built from the anchor** (`addressOf`: this page's path and query, then `#goal-<id>` or
  `#task-<id>`), not read from the address bar:
  - a goal opened from the list doesn't write its anchor there (`useOpenGoal` only reads it);
  - a task's sheet does, but the press shouldn't depend on it.
- Resources keeps copying the address bar, as before.

## Checks

- **`goals-overview.spec.ts`:** a goal opened from the list copies an address with its `#goal-` anchor, and that
  address, opened in another page, opens the goal's sheet.
- **`work.spec.ts`:** a task opened from its tile copies `#task-<id>`, and the address opens its sheet in another page.
