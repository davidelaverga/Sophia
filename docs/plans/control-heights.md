# Every press stands on one of four heights

> 2026-10-10 · Luis: «arranca con el paso 1: el kit en packages/ui». The first piece of the kit, and the first rule it
> enforces: a single-line press is 24, 28, 32 or 36 px tall, on every page. No API change.

## What was measured

- The thirteen fixture pages at 1440×900, every visible button under 48 px (a probe, `heights.cjs`): 158 presses, 13
  off the scale, from six causes:
  - the bar's mark, 29 px on every project page, and its «Work» crumb, 27 or 28 by the subpixel (their padding over a
    19.5 px line);
  - `.text-button` in a Knowledge card's foot, 22 px (its line inherits the card's 18 px; elsewhere it is 24), twelve
    times on the page;
  - the goal's «Outcome · 2 criteria», 22 px (`.goal.compact .goal-criteria-button`), on Tasks and the work space;
  - the goal's controls and the lobby's answers, 30 px (`.controls .pill`, `.lobby-actions .pill`,
    `.conv-propose-acts .pill`);
  - Home's «Speak instead», 30 px; Conversations' «New conversation», 30 px; its «Open» and «Mine», 26 px;
  - Resources' sort, 38 px.
- Across the app, nine control heights coexist (22 · 24 · 26 · 28 · 29 · 30 · 32 · 36 · 38 · 39), each set by a
  feature's own CSS. `packages/ui` has five pieces and no button; the features carry 13 700 lines of CSS.

## What changes

- **`Button` in `@sophia/ui`** (`Button.tsx`, over the pure `button-class.ts`): one element for a press, with a `kind`
  (pill, primary, ghost, text, icon, warm, danger: the classes theme.css already draws) and a `size` (sm · md · lg).
  Each kind has a size of its own, drawn by its class alone; another size adds one modifier (`sz-sm`, `sz-md`,
  `sz-lg`), so nothing that renders today at its kind's size moves. A `tip` renders `Tip` and `has-tip`.
  `type="button"` unless said; `ref`, `aria-*`, `onClick`, `disabled` pass through.
- **The scale in `theme.css`**: `.pill.sz-sm` 28 / `.pill.sz-lg` 36, `.ghost.sz-sm` 24 / `.ghost.sz-lg` 32,
  `.round.sz-sm` 28 / `.round.sz-md` 32; `.text-button` takes its own line (20 px, so 24 everywhere); the mark and
  the crumb are 28; the goal's controls, the lobby's answers and a proposal's answers are 28 (`sz-sm`'s height, by their rules).
  A finger keeps its sizes (`pointer: coarse`): a small square widens to 40.
- **Five presses move onto `Button`**, the ones off the scale: the goal's criteria fold (ghost sm, 24), Home's
  microphone (icon sm, 28), New conversation (icon md, 32), Open and Mine (ghost, 28), Resources' sort (ghost lg, 32).
  Their feature CSS loses the sizes it set and keeps only its look (a round mic, a borderless square, the first ink).
- `e2e/control-heights.spec.ts`: on each of the thirteen pages, once drawn, every visible single-line press under
  48 px is 24, 28, 32 or 36 px; rows, tiles, covers and cards (48 px or more, or two lines) are not presses on the
  scale; a page measures one at least. `button-class.test.ts`: the classes of each kind and size, the modifier only off the kind's own size, the
  text kind one height, every height on the scale.

## States

- A press's states are unchanged: hover, pressed, focus-visible, disabled (an outline for a waiting primary),
  `aria-pressed` (the mic listening, Open and Mine chosen, New conversation open). Each moved press keeps its own
  state rules; where `.round` draws a state of its own (its edge, the pressed ink), the press's rule comes after
  and wins (`.conv-start`, `.places .hw-mic`).
- On a phone the sizes are a finger's (`min-height` 40 / 36, as before); the small square widens to 40 too.
- A screen reader hears nothing new: the tip was decorative before and is now; names are unchanged.

## Checks (written first)

- The spec's measure on main's pages: thirteen presses off the scale on ten (the mark alone on every project page);
  with the change, none on any of the thirteen (read in the page; the spec itself runs in CI, the machine guard having
  refused a browser run beside an open game).
- `button-class.test.ts`: passes; with `sz-` emitted at the kind's own size, fails.
- Mutant, with the control passing: the mark's height removed, the mark measures 21 px and the measure reports it;
  the other causes undone are the before state, measured above.
- `pnpm check` clean (Prettier, oxlint type-aware, typecheck, unit tests).

## Left

- The 350 other presses still write their classes by hand (`pill`, `ghost`…): they move onto `Button` as each
  feature is touched; a lint that forbids a raw `<button className="pill">` comes when the migration is near done.
- A finger's heights (40 / 36 on `pointer: coarse`) have their rule in CONTRIBUTING and no spec yet.
- The next pieces, in order: Input and Search (36 · 32), Segmented, Sheet, Menu, Card, Skeleton.
