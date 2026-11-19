# Handoff: one motion vocabulary

Goal and attempt: MOTION-TOKENS (informe-30 §2.6, a small set of motion tokens and a fence), attempt 1
Executor: Claude Code subagent in worktree `D:\Descargas\SophiaV4\Sophia-paper-4`
Starting commit: branch `kit/motion-tokens` from `origin/main` `c9c226c94`; not pushed, no PR
Writable scope: this worktree only (Studio CSS, its unit fences, `docs/plans`, `docs/handoffs`); no API, nothing
deployed, no remote touched.
Commits: `d689135b5` (the fence, red), `400ff8287` (the migration, green), then this record.

## Outcome

- `theme.css` `:root` declares 11 duration tokens (`--motion-fast` 140 ms, `-base` 220, `-medium` 300, `-slow` 400,
  `-slower` 500, `-long` 600, `-flourish` 900, `-sweep` 1.4 s; loops `-pulse` 1.6 s, `-breath` 2.4 s,
  `-breath-slow` 2.8 s) and `--ease-in-out` beside `--ease`. `--fast` and `--base` are gone; their 153 reads say
  `--motion-fast` / `--motion-base` (same values).
- 99 hand-written durations moved to a token, 2 literal `cubic-bezier(0.2, 0, 0, 1)` to `var(--ease)`, 13
  `ease-in-out` to `var(--ease-in-out)`. 21 exceptions (22 items) stay listed with reasons in `motion.test.ts`.
  Mapping and reasons: `docs/plans/motion-tokens.md`.
- Largest shifts (one-shots only; loops are exact): 1.6 s → 1.4 s (buddy hello ×2, ultra sweep; −200 ms, −12.5 %),
  700 ms → 600 ms (`hw-draw`, −14.3 %), 0.8 s → 0.9 s (`meter-fill`, +12.5 %), 1 s → 0.9 s (`.umbral` filter).
- `prefers-reduced-motion` blocks untouched (`animation: none`, `transition: none`, `0.01s`, `1ms !important`).
- `public/entry.css` (the opening, loaded before the app's sheets) is outside the fence on purpose.

## Evidence

- **Red first** `d689135b5`: `node --test apps/studio/src/app/motion.test.ts` → 0 pass, 3 fail (122 hand-written
  items, 86 distinct not listed; listed entries not found; no `--motion-*` declared). The refactored fence (lint
  max-depth fix, same logic) also fails 3/3 against `d689135b5`'s sheets.
- **Green** `400ff8287`: motion, css-motion, states, elevation fences 19/19. All Studio units: 2465 tests, 2463 pass;
  the 2 failures are the known Windows-only `attention.test.ts` and `browser-imports.test.ts`.
- `pnpm -s lint` exit 0, `pnpm -s typecheck` exit 0, Prettier clean on touched files.
- **E2E not run:** the guard (`pw-gentle.ps1`, log `b19-motion-tokens`) refused: «free RAM 6 GB». Planned specs:
  `resources`, `resource-control-status`, `light-material`, `home`, `light-breath` (meter fill, `.arrive`, the
  orb's loops, reduced motion). E2E mostly waits on `getAnimations()`, not on fixed times; no spec reads `--fast`,
  `--base` or a duration value.

## Open

- Run the five specs above through the guard when RAM allows, at the branch head.
- JS-driven motion (`entry.ts`, `Threshold.tsx`, `note-flight.ts`, `usePlaceMotion.ts`) keeps its own timings; none
  mirrors a CSS duration changed here (`ResourceTile.tsx` 1400 ms still matches `--motion-sweep`, `Toast.tsx` 8000 ms
  matches the allowlisted 8 s).
