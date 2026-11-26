# Handoff: what Sophia made keeps what its room holds, attempt 1

Goal and attempt: UI-MADE-FITS (`docs/plans/made-fits.md`; Luis 2026-11-23, «Sí, arréglala», on a finding from #554's
CI), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/made-fits` from `origin/main`
`516cb8547`.
Ending commit/tree and changed files: content commit `f6c3a3351` (`StageMade.tsx`, `made-view.ts`,
`made-view.test.ts`, `app/theme.css`, `e2e/room-made.spec.ts`), then the note and this record. On 2026-11-24, option B
for the phone row (`ce514caae`, which added the kit's `show` glyph), then a one-line object
(`6a6bee3a9`, `db6cca20c`, from a misread of Luis's choice), then the row he meant, content commit `a4e47247b`
(`StageMade.tsx`, `app/theme.css`, `elevation.test.ts`, `material.test.ts`, `e2e/room-made.spec.ts`,
`e2e/room-present.spec.ts`).

## Outcome

What Sophia made is one row under her line, in the dock's own material: what it is, its kind and version, Open, and
Show everyone and Close as glyphs. It never runs over the captions, at any size measured.

## Evidence

- **Headless captures** (software Chromium, `safe-browser.cjs`, fixtures on :5181): 1280 × 800, 1366 × 657, 390 × 844,
  375 × 667 and 360 × 740, dark and light, with two captions.
- **Three directions** were drawn over the real room with injected CSS only, for Luis to choose from
  (`evaluacion-2026-11-22/made-direcciones.png`, outside the repository). He meant the third; the second was built
  first from a misread, then replaced.
- **Unit tests:** `made-view.test.ts` 7 of 7; `glow`, `elevation`, `motion`, `material` and `css-motion` fences pass.
- `pnpm format:check`, `lint` and `typecheck` all return 0.
- **Through `pw-gentle.ps1`:** `room-made`, `made-refusal`, `present-refused-exit`, `room-present`, `room-captions` and `light-shadows`, 66 of 66. The @phone one-row test failed with the row stacked (205 px tall).

## Decisions and changes

- Her description and the facts left the stage: they are the chat card's and the viewer's.
- The lit-card prototype (a lit edge, a paper cover, a glide into the viewer) stays on the local branch
  `ui/made-aaa`, unpushed: Luis rejected it.

## Remaining obligations

- The PR is not merged. It is independent of #554.
- The `show` glyph was approved by Luis on 2026-11-24 («Sí, déjalo»).

## Next bounded action

Luis reviews the PR.

Source IDs consulted: `room-made-object.md`, `room-stage-captions.md`, `StageMade.tsx`, `made-view.ts`,
`app/theme.css` (`.stage-made`, `.stage-body`, `.lens-body`, `.stage-captions`), `e2e/room-made.spec.ts`.

## After the review (2026-11-26)

Codex's P1 on Close's touch target was true and is fixed: on touch, Show everyone and Close are at least 40 × 40 px
(the note's last section). The P1 on the Open tip named a rule the one-row rewrite had already removed. The P2 on
Show everyone's failure line goes to the follow-up list.
