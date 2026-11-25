# Handoff: her light under the formed mark on paper, attempt 1

Goal and attempt: UI-PAPER-LIGHT-RAYS (`docs/plans/paper-light-rays.md`; Luis 2026-11-24, «En light mode no hay brillo
o luz o elemento dinamico para el logo», then «2 · Luz con rayos» of three drawn directions), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/paper-light-rays` from `origin/main`
`dc2215118`.
Ending commit/tree and changed files: content commit `01bbf5378` (`Threshold.tsx`, `threshold.ts`,
`threshold.test.ts`, `engine.ts`, `app/theme.css`, `app/motion.test.ts`, `e2e/light-mark.spec.ts`,
`docs/plans/paper-light-rays.md`), this record (`5506464e2`), then the white with shadow (Luis 2026-11-25:
«La luz que sea blanca no morada», then «3 · Más sombra» of six drawn colours: `app/theme.css`,
`e2e/light-mark.spec.ts`, the note and this record, `bbc0769eb`), then the dark page's pattern instead of an even
fan (Luis: «Debe seguir el mismo patron que en dark mode», then «Sí, constrúyelo»: `threshold.ts`,
`threshold.test.ts`, `app/theme.css`, `app/motion.test.ts`, `e2e/light-mark.spec.ts`, the note and this record).

## Outcome

Where the light forms Umbral on paper (sign-in once through, Home, Talk), her light now stands under the mark as the
room's canvas draws it: one light behind the mark, blocked by the halves. Your half casts a deep shadow on the left
and hers a faint one on the right, and white light pours past them, up and down the line between you and out on her
side. The angles come from the mark's own shapes (`shadowArcs`). It breathes with her halo and moves towards the
pointer with the same springs the canvas uses; nothing turns. The room is unchanged.

## Evidence

- Three directions drawn over Home's fixture with injected CSS only, for Luis to choose from
  (`evaluacion-2026-11-22/logo-claro-direcciones.png` and `.mp4`, outside the repository). The before and after are in
  `evaluacion-2026-11-22/logo-claro-rayos.png` and `.mp4`. The white variants: `logo-claro-blanco.png`, then six
  colours in `logo-claro-colores.png`; the white fan on Home, the sign-in and Talk in `logo-claro-sombra.png` and
  `.mp4`. The dark page's pattern drawn beside it: `logo-claro-patron.png`; as built: `logo-claro-patron-construido.png`
  and `.mp4`.
- Unit, the fences, the browser checks and the measurements: the note's last section. Through the guard,
  `light-mark.spec.ts` 60 of 60 over three runs and the related specs 201 of 201.
- `prettier --check` on the changed files, `pnpm lint` and the Studio's `typecheck` return 0.

## Decisions and changes

- A span beside the SVG, not the orb's pseudo-elements: the orb keeps its own rules, and its step back where the mark
  forms stays as it was.
- Colours from `--sheen-rgb` and `--shadow-rgb` only (white with shadow, Luis's pick; violet first). One ambient
  loop, the breath, is added to `motion.test.ts`'s list beside the threshold's own; the 90 s turn went with the fan.
- The shadows keep their angles as the light moves towards the pointer (on the canvas they turn a few degrees): one
  conic per layer, no per-frame angles.
- No new words.

## Remaining obligations

- The PR is not merged.

## Next bounded action

Luis reviews the PR and the capture.

Source IDs consulted: `home-light-mark.md`, `light-paper-mark.md`, `paper-orb.md`, `signin-threshold.md`,
`Threshold.tsx`, `threshold.ts`, `engine.ts`, `shape.ts`, `shader.ts`, `app/theme.css` (`.threshold`, `.light[data-mark]`),
`glow.test.ts`, `motion.test.ts`, `e2e/light-mark.spec.ts`.
