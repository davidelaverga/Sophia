# Handoff: what Sophia made keeps what its room holds, attempt 1

Goal and attempt: UI-MADE-FITS (`docs/plans/made-fits.md`; Luis 2026-11-23, «Sí, arréglala», on a finding from #554's
CI), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/made-fits` from `origin/main`
`516cb8547`.
Ending commit/tree and changed files: content commit `f6c3a3351` (`StageMade.tsx`, `made-view.ts`,
`made-view.test.ts`, `app/theme.css`, `e2e/room-made.spec.ts`), then the note and this record.

## Outcome

The object under Sophia's line no longer runs its words over the captions. It keeps what its room holds, and its one
row always stands. On a very short phone stage the earlier caption gives way to it.

## Evidence

- **Browser pane, fixtures (:5181):** 1280 × 800, 390 × 844, 360 × 740, 375 × 667 and 1366 × 657, with two captions.
  390 × 844 was also measured with #554 merged in a scratch branch. Dark and light.
- **Unit tests:** `made-view.test.ts` passes 15 of 15.
- **Through `pw-gentle.ps1`:**
  - the spec without the fix failed 3 of 4;
  - with the fix, `room-made`, `room-captions`, `show-everyone` and `light-shadows` passed 47 of 47;
  - merged with #554, `room-made`, `room-dock`, `room-captions` and `light-shadows` passed 67 of 67.
- `pnpm format:check`, `lint` and `typecheck` all return 0.

## Decisions and changes

- The object's room is measured in script, not in a CSS container query. A size container on the lens body would
  answer the unnamed `@container` queries of everything inside it, such as the 760 px summary rule.
- The object never shrinks (`flex-shrink: 0`). Squeezed, its box stayed the room's size, so a ResizeObserver never
  heard its words grow.
- The earlier caption gives way only on a very short phone stage (≤ 560 × 640). This is a fixed CSS condition, not a
  measurement: a measured one would bring the caption back as soon as the room grew, and hide it again.

## Remaining obligations

- The PR is not merged. It is independent of #554, and both merge in either order; together they were checked in a
  scratch merge.
- On a phone the title still has about 40 px beside Open and Show everyone, so it shows a few letters. That is a
  layout question for the object's row, left as it was.

## Next bounded action

Luis reviews the PR.

Source IDs consulted: `room-made-object.md`, `room-stage-captions.md`, `StageMade.tsx`, `made-view.ts`,
`app/theme.css` (`.stage-made`, `.stage-body`, `.lens-body`, `.stage-captions`), `e2e/room-made.spec.ts`.
