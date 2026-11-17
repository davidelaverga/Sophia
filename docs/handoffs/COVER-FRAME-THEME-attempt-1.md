# Handoff: Knowledge · a designed page's frames wait in the theme's surface, not white

Goal and attempt: `informe-ui-premium.md` (evaluacion-2026-10-11), the designed page's white flash, attempt 1  
Human owner / executor resource: Luis (owner, «es imposible que no se pueda avanzar mucho»); the Claude Code session
that built it  
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-6`, local branch `artifacts/cover-frame-theme` from main
`9495c87fc` (through #513)  
Changed files: `apps/studio/src/features/artifacts/artifacts.css`, `apps/studio/e2e/knowledge-library.spec.ts`,
`docs/plans/cover-frame-theme.md`, this file.

## Outcome

A designed page's cover frame (`.report-cover-frame`) and its full frame (`.report-html-frame`) had `background: #fff`.
Until the sandboxed `srcdoc` page painted, the room showed a white rectangle: a flash in the dark.

Both frames now wait in `--surface-raised`: `#121118` in the room, `#ffffff` on paper, so paper is unchanged and the
frame still stands as a white page on the paper ground. Nothing is injected into the frame; the page keeps its own
background. A page that sets none still reads as paper once painted: Chromium draws an opaque white backdrop behind a
frame whose document's colour scheme (light, undeclared) differs from the frame element's (the room's dark).

## Evidence

- Measured first (a dark root, a sandboxed `srcdoc` frame with background `#121118`, software Chromium through
  `safe-browser.cjs`): with the page's stylesheet held by a route that never answers, the frame's pixel is
  `rgb(18, 17, 24)`; a page with no background of its own, painted, is `rgb(255, 255, 255)`.
- Red, on `f784b0b3d` (test only): `knowledge-library.spec.ts` «in the room, a designed page’s cover and full frames
  wait in the theme’s surface» fails at the cover frame: expected `rgb(18, 17, 24)`, received `rgb(255, 255, 255)`. The
  paper case passes (white, unchanged), as it should.
- Green, on `f97b2f4fd`: through the guard, `knowledge-library.spec.ts` + `revise-section.spec.ts` +
  `report-design-trigger.spec.ts`: 23/24. The one failure was «a44 · its Markdown reads too…» (a Markdown pane with
  no frame; its `.md` not found in 5 s while two workers ran); rerun, `knowledge-library.spec.ts` +
  `report-design-trigger.spec.ts` with `--repeat-each 2`: 40/40, a44 among them. oxlint `--type-aware .` clean, `tsc`
  clean, prettier clean on the touched files.

## Deviations

- No lever holds a `srcdoc` page's paint in the fixture: its bytes are inline and its own CSP refuses every load. The
  check reads the frames' computed background, which is what shows until the paint (measured above with a held
  stylesheet outside the fixture), and that the page's own body keeps `rgb(251, 247, 239)` inside.

## Remaining limits

- The PDF's pages (`.pdf-page`, `#fff`) are paper by design and not part of this item.

## Next bounded action

Independent review of the two commits on `artifacts/cover-frame-theme`, then batch with the next verified branches.
