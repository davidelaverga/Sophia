# The room: past a few people, «+N»

> 2026-10-06 · Luis · "cuando habían muchas personas en la sesión y se compartía la pantalla, las ventanas de las personas colapsaban o no se veía estéticamente bien. Tenemos lo que hace Meet, que luego de cierto número oculta ventanas y solo deja el +"

## The gap, measured

Every person in the call gets a tile, however many there are:

- **While a screen or a report is shown:** the strip beside it holds them all, each 16:10, and scrolls. With many people they pile up, and on a narrow screen the strip becomes a row that scrolls sideways.
- **In the gallery:** the layout counts at most 6 columns but draws everyone.

Meet keeps a fixed number of tiles and shows the rest as «+N».

## What changes

**A fixed number of tiles, the rest as «+N»:**

- the strip beside a shown screen or report: Sophia's tile and 4 for people;
- the gallery: Sophia's and 8.

With more people than that, the last people's tile is «+N»: «+6» means six more in the call.

**Who keeps a tile,** in this order:

1. whoever holds the floor;
2. whoever shows their screen;
3. whoever is speaking now;
4. you;
5. whoever spoke most recently;
6. the order they came in.

The order is stable: tiles move only when someone speaks, takes the floor or starts showing. Someone who starts speaking takes the tile of whoever spoke least recently, never a held one.

**«+N» is a button:** «6 more in the call». It opens «In the call», a sheet listing everyone with what sets them apart (you, the floor, speaking, a guest). Close gives the focus back to «+N».

**Nothing else changes:** Sophia's tile and her light, a tile's name and its floor mark, and the room's people around the light when no video is on.

## Checks (written first)

- **Unit** (`tile-view.test.ts`): who keeps a tile, in the order above, with the cap; «+N» counts the rest; under the cap, no «+N».
- **Browser** (`e2e/room-tiles.spec.ts`):
  - a shared screen with 9 others: Sophia, 3 people and «+7» in the strip (nine others and you), and no tile shorter than 60 px;
  - the floor holder and the one showing keep their tiles, wherever they are in the list;
  - someone who starts speaking gets a tile;
  - «+N» opens «In the call» with everyone, and Close gives the focus back;
  - a gallery of 11 others: Sophia, 7 and «+5» (eleven others and you);
  - with 3 others, no «+N».
