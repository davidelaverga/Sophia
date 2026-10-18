# The surfaces climb on paper

> 2026-10-17 · Luis: «Sí, empieza con las ramas 1 a 9», after the light-mode evaluation (informe-claro §6, row 5: D6).
> Studio only, CSS only; the room renders as before.

## What was measured

- On paper `--plane` (#f4f0ea) sits 1.07:1 _under_ the page (#fbf8f3) and `--plane-2` (white) 1.06:1 over it: the scale
  turns back on itself. The room's climbs: the void #050408, the plane #0b0a0f 1.036:1 over it, the raised plane
  #121118 1.051:1 over that.
- On main 19 declarations paint `--plane` (the report counts 17 on the integration branch, where `ui/light-elevation`
  moved the sheet's): Conversations' list, its context and the proposal's field; the room's side panel, tiles, spotlight
  and presented report; a card's cover; the sheet and its head, the report pane and its tables' covers and pinned cells,
  the resource sheet's head light; Personal's notes, project rows, their faces and its notices; the ring between a plan
  tab's faces. Each sank on paper where the room raises it.
- informe-claro's captures: Conversations' list on a phone 1.07:1 under its bar; the room's chat panel level with the
  stage beside it (1.02:1).

## What changes

- **Tokens (theme.css):** `--surface-page`, `--surface-well`, `--surface-raised` and `--surface-overlay`, the levels of
  informe-claro's third principle (page < well < white sheet < overlay; row 1's `light-paper.md`). In the room they are
  today's void, plane and raised plane, the overlay as raised (a menu, a tip and the palette paint `--plane-2`; its
  shadow sets it apart). On paper the page and the raised sheet stay the paper and white, and the well is `#fdfbf8`: a
  step toward white, with the room's two steps kept in proportion inside paper's 1.059:1 from page to white (1.026:1,
  then 1.033:1 to white).
- **Rules:** the 19 declarations read `--surface-well`, and none paints `--plane`. Selectors and order stay.
- **The room, pixel for pixel:** `--surface-well` is `var(--plane)` there, so every migrated rule computes #0b0a0f,
  inside its gradients and colour mixes too. Nothing redefines `--plane` in a subtree, so the root's value is the one
  each rule read before.

## Checks, written first

- `surfaces.test.ts` (unit, on theme.css and the Studio's CSS): the levels climb in both themes (page < well < raised ≤
  overlay); the room's are #050408, #0b0a0f, #121118 and #121118; on paper each of the two steps is 1.02:1 or more; no
  declaration but a token's paints `--plane`.
- `light-surfaces.spec.ts` (e2e, fixtures): on paper Conversations' list and context and a Knowledge cover stand 1.02:1
  or more over the page; a cover sits under its white card and over the page; the Invite sheet and its head stand over
  the page; on a phone the list stands at or over its bar; the room's chat stands 1.08:1 or more over the stage 24 px
  beside it (about 1.03 today, by the stage's field). In the room (the controls) the list, the context, the cover and
  the chat keep #0b0a0f.

## Limits

- The 38 declarations on `--plane-2` (cards, menus, the palette, fields) keep it: raised and overlay are named here for
  rows 6, 8 and 16, which move them with their shadows, states and veil.
- A sheet and the report pane stand at the well in both themes, as in the room; white over a veil on paper is the
  unpushed `ui/light-elevation`'s (and row 16's). Its `--sheet-plane` and its wells on a white sheet read `--plane`,
  whose paper value stays defined for them: merged, they read `--surface-well`, and the check above names any rule left.
- A Markdown cover's page (#f8f6f1, the document's own paper) now sits 1.046:1 under its well, where it stood 1.051:1
  over the old plane; both are faint, and the desk under documents is row 20's.
