# The lens in the address, and the background's work one press away

> 2026-10-11 · Luis: «encola las tareas». Informe-pasada-3 §2 and §5 (items 6 and 7): the Studio's lens persists
> between loads but is not in the address, so a link does not reproduce what one sees; «Working on 1 task in the
> background» is text, not a press (already in the pass of 25). No API change.

## What was measured

- The lens is viewer-local (`viewer-state.ts`): kept per account and project in `localStorage`, read at load. The
  pane came back on Build from an earlier probe; nothing in the address said so.
- Sophia's line under the light says «Working on N tasks in the background» (`roomLine`) as a `<p>`: the tasks are
  in Tasks, a view away by the mouse.
- The lenses with nothing in them (Explore, Build: «what is coming») stay shown. Hiding them is a product call
  (Davide's three lenses; `viewer-state` keeps a lens per viewer; two checks seed and press them), left to Luis and
  Davide, not taken here.

## What changes

- **The lens in the address** (`useViewerState`): `?lens=explore|build` at load wins over the stored lens (a shared
  link shows what was seen); a lens chosen is written to the address (`replaceState`, no history entry), the default
  Converse written as none. The route's own moves (`useProjectRoute.go`) carry the report's parameters only, so
  another view drops the parameter and the Studio view regains the lens from storage: the address says the lens only
  while the Studio view shows it.
- **The background's work, one press** (`RoomStage`): the note is a `text-button` that goes to Tasks; with exactly
  one task working it names that task in the address (`#task-<id>`: its tile opens, or its card takes the focus).
  `Arrival` for Tasks takes an optional task.

## States

- Address without a lens: the stored one, else Converse. A lens the address names that is not a lens: ignored.
- No work running: the note is not there (as before).
- After the review (Codex on #242): a shell kept out of sight for its call neither reads nor writes the address (it is
  another view's); the task is named only when it is the whole count the line says (`soleWorkingTask`), never one of
  several.

## Checks (written first)

- `e2e/studio-lens-address.spec.ts`: `?lens=explore` opens Explore; Build chosen → `lens=build` in the address;
  Converse → no parameter; a reload with `?lens=build` wins over the stored Converse.
- The same file: in the demo, «Working on 1 task in the background» is a press; pressed, Tasks is current and the
  address names the task.
- `pnpm check` clean; `app-auth.spec.ts`'s lens restore unchanged (no parameter: the stored lens).

## Left

- The lenses without content, shown or not: a product call (above).
