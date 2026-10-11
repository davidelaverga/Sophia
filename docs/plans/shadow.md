# A shadow's ink: black in the room, a third of it on paper

> 2026-10-11 · Luis: «sigue con los pendientes: --shadow». Named left in `light-mode.md`: «on paper a menu's shadow
> is heavier than the room's». No API change.

## What was measured

- 24 `box-shadow` declarations in seven sheets, all black by hand: `rgba(0, 0, 0, 0.3)` to `0.6` (the menus at
  `0 18px 50px .55`, the sheets at `0 16px 48px .5`, Conversations' context at `-30px 0 80px .6`, a tile's rest at
  `0 1px 4px .45`).
- In the light page they rendered unchanged: a menu over paper cast the same 0.55 black it casts over the void, where
  the dark room hardly shows it. On paper it read as a hole.

## What changes

- Two tokens beside the channel tokens: `--shadow-rgb` (the shadow's ink) and `--shadow-k` (its strength, a factor).
  The room: `0 0 0` at `1` (every shadow computes the value it had). Paper: the ink `29 27 34` at `0.35` (a menu's 0.55
  reads 0.19, a sheet's 0.5 reads 0.18, a tile's 0.45 reads 0.16).
- The 24 declarations read `rgb(var(--shadow-rgb) / calc(a * var(--shadow-k)))`; no shadow is written in black again.
- `light-mode.spec.ts` reads the account menu's shadow on paper.

## States

- The room: unchanged (measured, the menu `rgba(0, 0, 0, 0.55) 0px 18px 50px`). Paper: the same geometry, a third of
  the ink.

## Checks (written first)

- Before the change, the spec's new line fails on paper: the menu's shadow is `rgba(0, 0, 0, 0.55)`.
- Mutant: `--shadow-k` left at 1 in the light block, the spec names the menu at 0.55.
- `pnpm check` clean; `grep 'rgba(0, 0, 0'` over the sheets: 0.

## Left

- A tile's lift on hover (`board.css`) keeps its gradient; only its shadow follows the tokens.
