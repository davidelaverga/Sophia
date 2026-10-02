# Implementation-session handoff: LFE-06, attempt 5 (the Resources view as tiles, with search, filters and a sheet)

- **Goal and attempt:** LFE-06's resource panel. On attempt 4, Luis said three things:
  - it was visually loaded: "entro y no sé dónde mirar";
  - there was no search for when there are 10 or 20 resources: "hay que pensar en la expansión";
  - he liked the earlier tiles better.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/panel-ux` at `6e40454` (attempt 4), 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** as attempt 4:
  - `apps/studio/src/features/resources/`;
  - one line in `features/studio/ProjectShell.tsx`: the Resources view is no longer a split page;
  - the resource checks;
  - CONTRIBUTING and LFE-06's records.

  **No contract, schema, API or dependency changed. In production the Resources view still says it is coming.**

## Outcome (UI)

- **One thing at a time.** The view shows, in this order:
  - the view's head (title, count, a one-line summary);
  - one line only while a request waits on an owner ("1 request waits on Davide", or "on you" for the owner), which opens that resource;
  - the search and the filters;
  - the tiles.
- **Tiles of four lines** ([`ResourceTile`](../../apps/studio/src/features/resources/ResourceTile.tsx)):
  - the tool's mark, its name and its host's state;
  - the owner, "You" and "1 waiting" when they apply;
  - what it does: its first assignment, and how many sessions share the account;
  - its capacity line, over a meter only for a percentage known to apply, or an empty track when unknown.

  The tiles fill the page's width (`auto-fill`, 232 px minimum), one column on a phone. Every tile has the same edges and lines, and the capacity sits at the foot.
- **Search and filters for tens of resources** ([`ResourcePanel`](../../apps/studio/src/features/resources/ResourcePanel.tsx)):
  - The search finds every word in the tool, maker, owner, sessions' roles and models, and their work, whatever the case or accents. `/` reaches it from anywhere on the view, as in the app's other shortcuts.
  - Escape clears the search, then leaves it.
  - The filters are All, Waiting, Online and Mine, in the app's segmented control, with arrow keys. Each shows how many it holds under the current search.
  - A screen reader hears "N of M resources shown".
  - When nothing is shown, the view says so, with "Clear search" and "Show all" as the ways back.
- **The detail in the app's sheet** ([`ResourceSheet`](../../apps/studio/src/features/resources/ResourceSheet.tsx)), the same pattern as Invite (`useDialog`: the focus goes in, Tab stays in, and Escape or Close returns the focus to the tile). It holds, in order:
  - the host and its age;
  - what waits on the owner, if anything (Copy session id is for the owner only);
  - the sessions;
  - the capacity with every window;
  - the controls, shown and never offered.
- **What attempt 4 kept:** the marks, the capacity rules and the request rules. Attempt 4's side column is gone; a request is read in its resource's sheet.

## Evidence

- **Measured at 1280×720 on the fixture's three resources:** 78 words on the view (206 before attempt 4); the waiting line at y 118.
- `pnpm --filter @sophia/studio test:browser`: 35 checks, the room's included (`ProjectShell` changed); 17 of them are the resource checks, rewritten for tiles, search, filters and the sheet.
- **Twenty mutations** each made their check fail, every run on a fresh fixture server. Among them:
  - the search finding everything;
  - no `/`;
  - Escape staying in an empty search;
  - counts that ignore the search;
  - arrow keys moving no filter;
  - "Show all" clearing the search instead;
  - the line on top while nothing waits;
  - the line on top opening nothing;
  - Escape keeping the sheet open;
  - every sheet holding every request;
  - the copy offered to everyone;
  - nothing copied;
  - a meter for unknown capacity.

  Chromium clears a search field on Escape by itself, so the check covers the second Escape, which leaves the field.
- `resource.test.ts`: 15 pass (search, filters, activity).
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 578 pass, plus the 5 known failures on Windows, as on main. The production bundle has no resource panel.

## Decisions and changes

- **Tiles, not rows.** Luis's preference, and the form that scans when there are many.
- **The detail is out of sight until asked for.** The sheet is the app's own, so nothing new is learned to use it.
- **The tile classes are `resource-tile-*`.** The room already styles `.tile-name`.

## Remaining obligations

- **Davide:** the resource and action shapes (SCM-01/02).
- **Luis:** evaluate this UI before it merges.

## Next bounded action

- Luis's notes on this pass. LFE-02.2 when PR32 is in `main`.
