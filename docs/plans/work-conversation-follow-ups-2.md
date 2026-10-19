# Work and conversation: follow-ups 2 (Codex P2s on #444, #458, #448)

> 2026-10-18 · three P2s, none a P1, on PRs merged under the no-P1 rule. Studio only.

## The gaps

1. **#444, the hidden tab's count keeps the viewer's own message.** With the tab hidden, a snapshot that lands before
   the membership read counts every typed message, the viewer's own too (sent from their phone): nobody is known to
   leave out yet. The counted set kept ids only and never dropped one, so theirs stayed in the title until the tab was
   shown.
2. **#458, two decision lists read as one.** The decision alert's effect ran on the open ids joined by commas. An id
   may hold a comma (the contract allows any 1 to 160 characters), so `['a,b']` and `['a', 'b']` read the same: the
   effect didn't run, and the two that came went unheard.
3. **#448, the report asked for again keeps the first opening's fallback.** The pane is keyed by the report, so the
   one on screen asked for again from a goal's sheet keeps its pane, and the fallback read at its first mount. The
   sheet closed for it and took its button, so the close sent the focus to the first opening's place.

## What changes

1. `withUnseen` keeps who wrote each counted message (id to author). Once the viewer is known, their own leave the
   count, even one that has left the snapshot's latest 50.
2. `openKey` gives the effect its key: the ids as a JSON array. Undefined still means the board hasn't been read.
3. The viewer counts each ask (`useOpener`, beside the opener it already noted). On a new ask the kept pane reads what
   has the focus outside it as the fallback. The first opening still reads it once at mount, never the pane's title.

## Checks (written first)

- **Unit:**
  - `unread-title.test.ts`: the viewer's own, counted before they were known, leaves (2, then 1), even once it left
    the snapshot.
  - `decision-alert.test.ts`: `['a,b']` and `['a', 'b']` give different keys.
- **Browser** (run by the orchestrator):
  - `unread-title.spec.ts`: with `membership=hold`, the viewer's message from elsewhere and another member's give
    «(2)»; with the membership read, «(1)».
  - `goals-overview.spec.ts`: the report opened by its link, then asked for again from the rollout's sheet; Close
    gives the focus to the rollout's row.
- **Not in a browser spec:** #458. Reproducing it would need the fixture board to swap one decision whose id holds a
  comma for two in one read; the unit covers the key the effect runs on.
