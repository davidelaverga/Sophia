# The room's hand-written colours, on paper

> 2026-10-17 · Luis: «Sí, empieza con las ramas 1 a 9», after the light-mode evaluation (informe-claro §6, row 2:
> D7 in part, D19, D24). Colours written by hand in a rule stay the room's on paper; each moves to a token with a value
> for each theme. The room renders as before. No API change.

## What was measured (WCAG's formula, on the paper `#fbf8f3`, the sheet's plane `#f4f0ea` and a white tile)

- **The newcomer's welcome** (`.welcome-band`, theme.css) casts black at 0.32 in either theme: on paper 1.8 times the
  toast's shadow (the paper's ink at 0.175), on the first screen a guest sees.
- **The seven model families' dots** (resources.css) read 1.48 (Haiku `#efc893`) to 2.95 (Opus `#d97757`) on the page,
  1.28 to 2.55 on a chip over the sheet's plane. Gemini CLI's accent `#8e75b2` already holds 3.2.
- **A plain effort bar** (Gemini CLI, Grok, Copilot, Cursor) is the tool's accent at 55 % over its track: 1.15 to
  1.80, the silver `#c3c7d4` 1.19. The tile's lantern (the edge light under the pointer, the same 55 %) peaks at 1.32
  in silver. Claude's bar below its top is the ink at 0.32: 1.96 on its track.
- **Ultracode**: Claude's dots `#b3a3f5` at 2.09 on the page (`--claude-ink`, `#5546b8` on paper, already exists), its
  glint the core (on paper the same `#5546b8`, so the glint vanishes), its sparks `#e4dcff` at 1.24. A waiting effort
  request's dot is the same lavender: 1.95 on the sheet's plane. The secret sweep («ultracode» typed) uses it too.
- **The lights that fly** (a note kept, `.c3-noteflight`; the glow leaving Home's light, `.c3-glowfly`) have a white
  core at 0.95: 1.005 on paper, with a pale lavender rim around it.

## What changes

- **theme.css**, one token per role, the room's value as it was and one for paper: `--claude-ink-rgb` (179 163 245 /
  85 70 184), `--claude-glint` (the core / `#8468ee`), `--claude-spark` (`#e4dcff` / `#8468ee`), `--flight-core`
  (white at 0.95 / `#8468ee`) and `--flight-rim` (lavender at 0.55 / `#8468ee` at 0.5). On paper a light is an ink: the
  paper mark's violet, 3.82 on the page. The welcome's shadow takes `--shadow-rgb` and `--shadow-k` as the other
  shadows do: black at 0.32 in the room, the paper's ink at 0.112 on paper.
- **resources.css** gets its own token blocks (the models' and tools' inks are its alone): `--opus-ink`, `--sonnet-ink`,
  `--haiku-ink`, `--gpt-ink`, `--gemini-ink`, `--gemini-pro-ink`, `--gemini-flash-ink`, `--silver-ink`, the room's hex
  as they were. On paper each keeps its OKLCH hue and chroma and darkens until it holds 3.2 as a dot on its chip (its
  ink at 7 % over the page, the plane or white) and as a bar on its track: 3.21 to 4.02; Opus `#b25435`, Sonnet
  `#a8693a`, Haiku `#9e7a47` (deepest first, as in the room), GPT and Codex `#5e78e9`, Gemini CLI `#7d65a0`, Pro
  `#8e73bc`, Flash `#3381dc`, the silver `#7c808c`. The family and tool rules read them; their selectors are unchanged,
  so the board's tiles keep the lavender they take by order today.
- `--effort-k`: a plain bar is its tool's ink at 55 % in the room, whole on paper (a part of it washes out over the
  track). `--claude-bar`: Claude's bar below its top, the ink at 0.32 in the room and at 0.5 on paper, 3.13 on its
  track over the plane and 3.22 over white (1.96 and 2.00 before).
- Ultracode's dots, glint and sparks, the waiting request's dot (and its ring and breath), the secret sweep, and both
  flying lights read the tokens.
- **The room stays as it is**: each token's room value is the literal it replaces, so every computed colour is the
  same (`var(--claude-ink)` is `#b3a3f5`, `rgb(var(--claude-ink-rgb) / 0.15)` is `rgba(179, 163, 245, 0.15)`,
  `--claude-glint` is `var(--core)`, `calc(0.32 * var(--shadow-k))` is 0.32 with the room's 1, `var(--effort-k)` is
  55 %). The alphas over Claude's ink are `rgb()` channels, not `color-mix()`, so the gradients they sit in stay
  all-legacy colours and keep interpolating in sRGB, as they did.

## Checks, written first

- `room-literals.test.ts` (unit): none of the room's literals (a fixed black shadow, Claude's lavender as hex or
  channels, the sparkle, the white core, the lavender rim) is written outside theme.css's two token blocks; those
  tokens keep the room's values exactly and have paper ones, the marks at 3:1 on the page; the family and tool rules
  take tokens, never a hex; resources.css's room inks are pinned; each paper ink holds 3:1 on its chip and its track,
  the bar fills whole, Opus is the deepest of its family, and no two inks or the halo are the same.
- `light-room-literals.spec.ts` (e2e, the resources, room and personal fixtures): on paper the seven dots on a tile and
  in a sheet, a plain bar in each tool's ink, Ultracode's dots, glint and sparks, and a waiting request's dot at 3:1 or
  more, and Claude's bar below its top; the welcome's shadow in the paper's ink, lighter than 0.32; both flying lights'
  cores at 3:1; in the room every value as it is today (the Opus dot, four accents, Ultracode's three stops and three
  sparks, Claude's plain bar at 0.32, the welcome's black at 0.32, the white cores at 0.95).

## Limits

- The lantern stays a light at 55 %: with the darker inks it peaks at 1.96 (silver) to 2.25 (Claude Code) on a white
  tile, up from 1.32. No row of the plan makes it an ink (row 9 leaves it as it is): it stays open.
- The welcome's shadow joins the 26 that read `--shadow-k`; row 6 (`light/elevacion`) moves them all to `--elev`.
- GPT's own look (its blue, its gradient and white sparks) sits on its fill, not on the paper, and is left as it is.
