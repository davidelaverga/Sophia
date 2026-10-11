# Implementation-session handoff

Goal and attempt: UIKIT-12 (informe-30 §2.5: a light page on the report's paper), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/light-mode` from `ui/widths` at `f419c9b3`
(stacked on PR #233 → #232 → #231 → #230 → #229 → #228 → #227 → #224 → #223 → #222 → #221 → #220; the base retargets
as each merges)
Ending commit/tree: `e98f6987` (tree `e4b6bed68980`): 22 files, 3 new (`app/theme.ts`, `e2e/light-mode.spec.ts`,
`docs/plans/light-mode.md`); the rest are the seven sheets (the channel swap), `AccountMenu.tsx`, `main.tsx` and ten
fixture pages (`bootTheme`). The commit after it adds only this handoff.

## Outcome

- Ten channel tokens beside the colour tokens; 264 hand-written alphas over the room's inks are `rgb(var(--x-rgb) / a)`.
- `:root[data-theme='light']` with the paper palette, the accents a step darker, the grain gone, Sophia's light a
  halo on paper (the WebGL canvas hidden there).
- `app/theme.ts`: `readTheme`, `resolveTheme`, `applyTheme`, `setTheme`, `bootTheme`, `useTheme`; the choice kept as
  `sophia.theme`; the account menu offers Dark · Light · Follow the system.
- `e2e/light-mode.spec.ts`: eight pages in light (root, paper, grain, no dark plane left, `lowContrast` clean) and the
  menu's choice (shown, kept, followed with `emulateMedia`).
- Unverified here: the Playwright run of the spec (the guard keeps refusing a browser run beside the open game); CI is
  the run on record, for the light page and for the dark room's own specs after the channel swap (contrast, ink
  states, every scale spec).

## Evidence

- `pnpm format:check`, `pnpm lint` (type-aware), `pnpm typecheck`: clean (Node 24.21.0 from `~/.sophia/node`); the
  Studio's 1020 unit tests pass.
- Measured in the page (the browser pane, 1280×800, served on 5197), the spec's own logic (the contrast measure is
  `contrast.ts`'s, ported) on the eight light pages (sign-in, home, personal, the room, Conversations, Tasks,
  Knowledge, Resources): root `data-theme="light"`, body `rgb(251, 248, 243)`, `body::after` `display: none`, no
  visible box on `rgb(5, 4, 8)` / `rgb(11, 10, 15)` / `rgb(18, 17, 24)` / `rgb(12, 11, 17)`, no word under 4.5:1
  (3:1 from 24 px).
- The dark room after the swap: body `rgb(5, 4, 8)`, a tag's plane `rgba(156, 130, 245, 0.12)`, `--text-3`
  `rgb(236 235 241 / 0.52)`: the same colours as before.
- The menu, on the room: items Dark (checked) · Light · Follow the system; «Light» → root light, body paper,
  `sophia.theme` = light, the item checked, the menu still open; «Dark» → the root bare, kept dark; «Follow the
  system» → kept system, the root as the system says (dark here).
- The contrasts chosen, computed before the change (WCAG, on paper / on white): ink at 0.74 7.0 / 7.3, at 0.64 4.95 /
  5.0, at 0.52 (the dark room's step) 3.45 — hence 0.64; halo 4.9 / 5.2; halo text 6.7 / 7.1; core 12.6 / 13.3;
  warm `#c8794a` (the informe's) 3.15 / 3.34 — hence `#965328` 5.6 / 5.9; teal 6.1; amber 5.6; rose 5.9; an amber word
  over its own tint at 0.1 on white 4.6.
- Seen in the pane: Tasks, the room, Conversations, Resources and sign-in on paper; the account menu with the three.

## Decisions and changes

- Channels rather than per-rule overrides: 264 alphas in seven sheets would have needed 264 light rules; one swap of
  ten channels does it, and the dark room computes the same values (measured).
- The paper's inks: `--text-3` at 0.64, not the informe's `--soft #5d5966` (4.9 as a solid; the step keeps the ink's
  alpha logic the dark room has). The warm darkens past the informe's `#c8794a` (3.15:1 as text) to `#965328`.
- Sophia's light on paper is the fallback gradient's kin (a halo), not the canvas: `mix-blend-mode: screen` only
  adds light and vanishes on paper.
- The choice is explicit (the menu), dark by default: the Studio's brand is the room; «Follow the system» is the third
  option, not the first.
- Fixture pages ask for a theme in the address (`theme=light`) without keeping it (`asked`, not `localStorage`), so a
  spec's run leaves nothing behind.

## Remaining obligations

- Watch CI for `light-mode.spec.ts` and the dark room's specs after the channel swap; fix in this PR what the pane did
  not see.
- The independent review (Codex) with no P1/P2 before merge. The base is `ui/widths` until #233 merges.

## Next bounded action

Informe-30 §2 is in, all of it: the kit (§2.1, UIKIT-01…08), the leadings and weights (§2.2, UIKIT-09), the answers
(§2.3, UIKIT-10), the widths (§2.4, UIKIT-11), the light page (§2.5, UIKIT-12). What is left is named in the notes:
a `--shadow` token for paper, a fifth «Blocked» lane when one exists, Home's right half (the feature F2).
