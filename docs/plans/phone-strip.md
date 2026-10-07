# The room on a phone: the strip beside a shown screen

> 2026-10-07 · Luis: «el layout de teléfono». Measured at 390×844 on the fixture pages.

## The gap, measured

Twelve views were measured at phone width: the room (alone, beside a screen, the gallery, the chat with a reply),
Conversations (open, new), Knowledge with carried in and the Slack update, Updates, Tasks, the carry package and
Home.

- **None scrolls sideways,** and nothing runs past the screen.
- **The floating «Join the room»** covers content only mid-scroll: every page ends 120 px clear of it.
- **The strip beside a shown screen is the one that fails:**
  - it is a row of 150 px tiles that scrolls sideways, so «+7» (how many more are in the call) is out of sight;
  - and on a short tile the name lies over the initial (at 390 and 820 px).
- **Small:** a report card's title is 23 px tall and «Edit» 23 px wide; checkboxes are 16 px inside labels that take
  the press. Left for another pass.

## What changes

- **On a phone (≤ 600 px)** the strip is one row that fits: five columns whatever the count (a strip of two keeps its
  tiles a fifth, not half the screen), square tiles, nothing to scroll.
- **A fifth of a phone holds a name and one short word:**
  - a guest says so, «guest», warm and whole (it tells a visitor from a member), the name before it giving way;
  - « · you» and « · floor» stay said to a screen reader; the floor's holder has the warm edge, and your own tile
    gives your name the label.
- **In every strip** the initial is smaller (32 px; 28 px on a phone) and sits above the name, never under it.

## Checks (written first)

- **Browser** (`e2e/room-tiles.spec.ts`):
  - at 390 px beside a shown screen, every tile and «+N» are in sight, on one row;
  - at 390 and 820 px, no tile's name lies over its initial;
  - at 390 px: a guest's «guest» whole with some of the name; the floor's holder with the warm edge and « · floor»
    said, not shown; your own tile with the name and « · you» said, not shown;
  - at 390 px, a strip of a few keeps each tile under 80 px.
- **Mutants** with a control.
