# Handoff: five decisions for Luis (11, 12, 19, 22, 23) and the check of 7, attempt 1

Goal and attempt: UI-FIVE-DECISIONS (`docs/plans/five-decisions.md`; improvements 7, 11, 12, 19, 22 and 23 of the
independent evaluation of 2026-11-22, the ones outside its batches), attempt 1. Batches A–G are #544–#550.
Human owner / executor resource: Luis (decisions, review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-propuesta` from `origin/main`
`d1e6b1410`.
Ending commit/tree and changed files: two files under `docs/` (the note and this record); no code.

## Outcome

- A proposal, no code: for each of 11, 12, 19, 22 and 23, what was measured, two options, what each costs, and a
  recommendation. Recommended: 11 keep the scale (close), 12 widen the target under a mouse (34 × 28, nothing drawn
  changes), 19 keep the room empty, 22 a glyph of its own for «Take the floor», 23 the phone's panel toggles above the
  dock after a mock-up.
- 7 checked and closed with no change: the bar says «Reconnecting» when the API is cut and «Up to date» once it answers.

## Evidence

- Fixture pages on `main` (`ui-mejoras-fixtures`, :5181), browser pane:
  - 7: `room.html?discussion=3`, `window.fixture.outage(true)` and `dropStream()`: «Reconnecting» at 61 ms, the
    project and its dock on screen, «Up to date» about 3 s after the API was back; `window.fixture.unexpected` empty.
  - 11: a probe of every press under 48 px, every field (as its group) and every painted radius on `work.html`,
    `room.html?demo=1&place=work`, `room.html?discussion=3`, `resources.html`, `personal.html`, `home.html`: presses
    24 · 28 · 32 · 36 only (two 20 px fixture buttons), fields 36 (Home's line 45), radii 4 · 6 · 8 · 12.
  - 12: `elementFromPoint` on every pixel within 20 px of Hold and Stop on `work.html` at 1280, fine pointer: 28 × 24
    targets, 6 px apart.
  - 22, 23: `room.html?call=on` at 1280, 390 × 844 and, on `ui/mejoras-e-visual` (#548), 640: two hand icons in the
    compact dock.
- `prettier --check docs/plans/five-decisions.md` passes.
- Not checked on the real stack: Docker did not answer (`docker info`), and was not restarted, as the prompt says.

## Decisions and changes

- No decision taken: each of the five waits on Luis. No text proposed for the Studio yet; option B of 19 names one
  only as an example.

## Remaining obligations

- The PR is not merged.
- Ask Luis whether Docker should be up to repeat 7 on the rehearse stack.

## Next bounded action

Luis answers the five (A or B each). Every yes becomes a small batch of its own: design note, code, checks, PR.

Source IDs consulted: `evaluacion-2026-11-22/mejoras-ui.md` (7, 11, 12, 19, 22, 23), `CONTRIBUTING.md` (Studio UI),
`docs/plans/control-heights.md`, `field-scale.md`, `chips-radii.md`, `goal-controls-text.md`, `raise-hand.md`,
`phone-dock.md`, `light-stage.md`, `features/studio/project-door.ts`, `feed-loop.ts`, `features/voice/RoomDock.tsx`,
`RoomStage.tsx`, `packages/ui/src/Icon.tsx`, `app/theme.css` (`.stage-corner`, `.text-button`).
