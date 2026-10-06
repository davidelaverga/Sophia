# Implementation-session handoff

Goal and attempt: the room past a few people, «+N» (`docs/plans/room-tiles-overflow.md`), attempt 1. Luis saw the tiles pile up and run into each other with many people while a screen was shared, and asked for Meet's «+N». Not behind the vision flag: it changes the room.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/tiles-overflow` on `main` `580aee4`, 2026-10-06
Ending commit/tree: four commits on `room/tiles-overflow`, read one by one (a merge ref or a squash folds them into one):

- `9dc6df6` «Room: past a few people, «+N» (Meet's way)»;
- `244b05f` «Room tiles: «In the call» over the page, and the review's P3s»;
- «Room tiles: the strip's rows as many as its tiles», the review's CSS nits;
- this handoff's own commit.

## Outcome

- **A fixed number of tiles:**
  - beside a shown screen or report: Sophia's and four for people;
  - in the gallery: Sophia's and eight.
- **Past that,** the last people's tile is «+N» («+7 more in the call»). It opens «In the call», listing everyone with what sets them apart: you, the floor, speaking, a guest. The sheet is drawn over the whole page and stays open as the tiles move; Close gives the focus back.
- **Who keeps a tile:** the floor, the one showing, whoever speaks, you, then whoever spoke last (counted from when they stopped), then arrival order. Tiles keep their order and move only when one of those changes.
- **Layout:**
  - The strip's tiles share its height in five rows, so none runs into the next: this was the bug Luis saw. On a short stage each row keeps 64 px and the strip scrolls.
  - The gallery lays out seven to nine tiles as three rows of three. Before, it fell back to the six-tile layout.
- **Fixture:** up to twelve people, with ids that stay valid UUIDs past nine; `screenBy` says who shares.

**Independent review, two passes:**

- **First:** one P2, fixed: the sheet was rendered inside the gallery's stacking, under the dock and captions, and closed when the tiles moved. It is now portaled to the page and held by the stage.
  - P3s fixed: «+N» named with what it shows, the last speech counted from its end, a floor height for the strip's rows.
  - P3 left by design: whoever shows a screen keeps a strip tile too.
- **Second:** the P2 fix confirmed; no new P1 or P2. Its two CSS nits fixed (a duplicate overflow, and rows kept for tiles that aren't there).

## Evidence

Run under the guard beside a game (9.8 GB free, at its default floor), one spec at a time.

- **Browser:**
  - `room-tiles.spec.ts` 6 of 6;
  - `room-people.spec.ts` 17 of 17;
  - `room-present.spec.ts` 15;
  - `room.spec.ts` 4;
  - `room-following.spec.ts` 6;
  - `room-walk.spec.ts` 6.
- **Unit:** `tile-view.test.ts` 4 of 4.
- **Captures** (sent to Luis): a shared screen with nine others (Sophia, three, «+7»), «In the call», and a gallery of eleven (3×3, «+5»).
  - The first capture showed the strip's tiles running into each other at 16:10; the five rows fixed it.
- **Mutations:** 7 of 7 killed, and the control survives:
  - no cap beside a screen;
  - no cap in the gallery;
  - the floor not kept;
  - the one showing not kept;
  - a speaker not kept;
  - the sheet held in the stage;
  - «+N» named without what it shows.
  - The first control, a comment, wasn't served; an equivalent code change (`2 + 2`) was, and it survives.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- None of this change's own.

## Next bounded action

Replies in the room's chat (A20, posted on #105), behind the vision flag.
