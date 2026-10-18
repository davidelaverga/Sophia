# Paper as its own material: the principles and the roles

> 2026-10-17 · Luis: «el modo claro es como un adicional/traducción»; then, on informe-claro's plan: «Sí, empieza
> con las ramas 1 a 9». Branch 1 of that plan: this note and the stale comments. No API change; nothing renders
> differently. The D-numbers are informe-claro's findings; the branch numbers are its plan's rows.

## What was measured

- informe-claro (2026-10-17, 28 paired captures at 1440×900 and 390×844, on `local/integration-light-2026-10-17`: main
  with the unpushed light branches): paper scores 609 against the room's 746 (82 %); material and atmosphere 53 %. Of
  119 effects drawn for the dark ground, 7 have a paper rule and 16 have nothing. Its verdict: a translation, the
  room's system with other numbers.
- On main (`f37006560`), counted for this note: 45 colour and material tokens on `:root`; paper redefines 44 and adds
  none (`--sheen-rgb` has no paper value). 23 paper selectors in 3 CSS files (16 in theme.css, 3 in conversations.css,
  4 in personal.css). 26 shadows read `--shadow-k`, 13 rules `--lift`, 17 backgrounds `--plane`, 64 backgrounds are the
  ink at an alpha. No `--elev`, `--state-*`, `--focus-ring`, `--glow` or `--danger` token.
- Stale words: theme.css's header said «The Studio is dark-only» (paper has been there since light-mode.md,
  2026-10-11); QrCode.tsx called its card «the only light surface in the Studio»; ToolLogo.tsx and its check in
  resources.spec.ts said a one-colour mark «reads on the dark theme».

## What changes

- This note: eight principles for paper from here on, and the inventory of roles each later branch fills in.
- **Comments only**: theme.css's header names the two themes and points here; QrCode.tsx says its inks are fixed, not
  the theme's, because a camera wants dark on light; ToolLogo.tsx and resources.spec.ts say the mask reads on either.

### The principles (proposed: Luis decides them, plan row 1)

1. **Two materials, one inventory.** Every role is born with a room value and a paper value at once, as a scope any
   subtree can take (a video is room, a document is paper). Paper inherits nothing by default (D6, D12, D22).
2. **On paper, light is whiter paper.** The lit plane is the lightest (`#fffdf9` over `#fbf8f3`), warm at its edges;
   never a violet at an alpha, which on paper only darkens (D1–D4).
3. **Elevation is ink and shadow.** Page < well < white sheet < overlay, always in that order; shadows in two layers
   (contact and ambient); the bevel in ink; glass only over video or the orb (D6–D9).
4. **States are said in ink.** Selected is a white piece rising over its track; live is a solid ring or an opaque fill.
   No coloured glow but Sophia's own (D20, D21).
5. **Accents ranked by role.** An accent that means something outweighs the second ink, by fill, value or weight.
   Violet is Sophia's; her voice, links and the primary are three inks; people are one warm ink of low chroma
   (D11–D14).
6. **One Sophia, and she is the light.** She lights the paper around her, her small appearances are small orbs, the
   mark forms from her. Her palette is one ramp the CSS and the JS share (D3, D16, D17).
7. **Attention shows.** Her voice and the floor move brightness, shadow and tint toward whoever speaks, by a readable
   10–15 % of her radius (D2).
8. **Texture and weight, decided.** A chosen paper fibre, or plain paper decided in writing; type weights per theme,
   tuned until the ink covers what it covers in the room (D5, D15).

### The roles, in both themes

«main» is on main today; a number is the plan row that adds or changes it; «local» is an unpushed branch.

| Role | Token today | Room | Paper | Where |
|---|---|---|---|---|
| **Inks** | | | | |
| Ink | `--text` | `#ecebf1` | `#1d1b22` | main |
| Second to fourth ink | `--text-2/-3/-4` | ink at 0.66 · 0.52 · 0.26 | ink at 0.74 · 0.64 · 0.34 | main: alphas retuned to the room's contrasts |
| Lines | `--line/-2/-3` | ink at 0.08 · 0.14 · 0.22 | ink at 0.10 · 0.16 · 0.24 | main |
| **Surfaces** | | | | |
| Page | `--void` | `#050408` | `#fbf8f3` | main; `--surface-page` in 5 |
| Well | `--plane` | `#0b0a0f`, over the page | `#f4f0ea`, 1.07:1 *under* it (D6) | main; 5: `--surface-well`, `#fdfbf8` on paper, 1.026:1 over the page; the 19 rules that painted `--plane` read it |
| Raised | `--plane-2` | `#121118` | `#ffffff` | main; `--surface-raised` in 5 |
| Overlay | `--glass` | `rgba(12, 11, 17, 0.74)` | `rgba(251, 248, 243, 0.8)`: the paper itself (D8) | main; 5: `--surface-overlay` takes `--plane-2` (`#121118` · `#ffffff`); 7: paper's `--glass` is `--plane-2`, and the stage's glass (`--glass-stage`) keeps the paper at 0.8 |
| Veil | none: `.sheet-backdrop` and `.conv-scrim` write `rgb(var(--void-rgb) / 0.5 · 0.55)` | the void at 0.5 · 0.55 | the paper at the same alphas | main; local `ui/light-elevation` adds `--veil` (ink at 0.18 on paper); 16 |
| Sheet over the veil | none | — | — | local `ui/light-elevation`: `--sheet-plane`, `--plane` · `--plane-2` |
| Desk under a document | none | — | ~`#ebe6de` | 20 |
| Video ground | none: `#000` in `.video`, `.screen-main` | black | black | 15 |
| **Elevation** | | | | |
| Shadow ink, strength | `--shadow-rgb`, `--shadow-k` | black, ×1 | the ink, ×0.35 | main (one layer, 15 geometries, D7); 6: `--shadow-k` goes, the ink stays |
| Levels | `--elev-<role>`: 21 roles (card, task, knob, thumb, page, dock, composer, tip, welcome, menu, sheet, context…) | each piece's own layer, to the value | the roles point at `--elev-1/-2/-3` (a contact and a wider ambient), `--elev-side` for side sheets, and an upward pair for the page | 6: the room's 15 geometries kept; cards rest on paper through `:where(.card)` |
| **Material** | | | | |
| Top light | `--lift` | `inset 0 1px 0` white at 0.04 | white at 0.7: 1.00:1 on white (D8) | main; 7: on paper a lower edge, `inset 0 -1px 0` ink at 0.04 |
| Sheen | `--sheen-rgb` | white | none: the room's white | main; 7: declared on paper (white), so nothing falls through |
| Primary's bevel | `.pill.primary` reads `--void-rgb` | darker below | lighter below (D8) | 7: `--bevel`, ink at 0.36 on paper (1.42 darker below; the room's 1.43) |
| Glass blur | 17 `backdrop-filter` | blur | the same blur | 7: paper's glass is opaque but on the stage; the blur stays declared on the opaque rules (a follow-up) |
| Grain | `body::after` | on | `display: none` | main; 18 |
| **Accents** | | | | |
| Sophia's halo | `--halo` | `#9c82f5` | `#6d5bd0` | main |
| Her text, links | `--halo-text` | `#b9a8ff` | `#5546b8` | main; `--sophia-ink` and `--link` in 10 |
| Primary press | `--core` | `#f4f0ff` | `#5546b8`, as `--halo-text` and `--claude-ink` (D12) | main; 10 |
| Claude's ink | `--claude-ink` | `#b3a3f5` | `#5546b8` | main; Ultracode and `.effort-asked-dot` take it in 2 |
| People | `--warm` | `#f1dcc7` | `#965328`, chroma 0.036 → 0.106 (D12) | main; chroma ≤0.05 in 10 |
| Teal, amber, rose | `--teal`, `--amber`, `--rose` | `#7fd6c4`, `#efbf86`, `#ee9fb0` | `#0f6b5b`, `#8f5717`, `#a8375a` | main |
| Soon | `--soon` | `#e8c48d` | `#8f5717`, the amber (D12) | main; its own in 10 |
| Hovers, inks on fills | `--core-hover`, `--on-core`, `--warm-hover`, `--on-warm` | `#fff`, `#0c0a16`, `#fff4e8`, `#1a1512` | `#4a3ca6`, `#fbf8f3`, `#7a4220`, `#fbf8f3` | main |
| Fills with words | `--teal-fill`, `--amber-fill`, `--rose-fill`, `--on-*` | the accent, the void's ink | `#dae4de`, `#ece1d4`, `#efddde`, the accent's ink | main (light-fills.md) |
| Model families, a tool's accent | `--chip-ink` literals, `--tool-accent` | per family | the room's: 1.48–2.95:1 (D19) | 2: `--opus-ink` … `--silver-ink`, each darkened along its hue to 3.2:1 or more on paper |
| **Mark** | | | | |
| You, Sophia | `--mark-you`, `--mark-sophia` | `--warm`, `--core` | `#16151b`, `#8468ee` | main (light-paper-mark.md) |
| **States** | | | | |
| Focus | none: `:focus-visible` writes `--halo-text-rgb` at 0.7 | halo text at 0.7 | the same; a field's edge whole | 8: `--focus-ring` |
| Hover, selected | none: the ink at 10 alphas over 63 layers (D20) | the ink lifts | the ink sinks | 8: `--state-hover`, `--state-selected` (no rule presses with a layer of its own, so no `--state-press`); 14 hovers keep their own alpha |
| Field, control | none | the ink at 0.03–0.08 | — | 8: `--field`, `--field-focus`, `--control`, `--control-quiet`, `--control-selected`, `--control-selected-quiet`, `--control-selected-shadow`, `--control-track`; on paper white pieces, the selected one on `--elev-1`, its track sunk (ink at 0.04) |
| Live | none: accent glows, 1 of 33 with a paper rule (D21) | a glow | a stain | 9: 27 `--glow-<role>` tokens, each the room's own layer; on paper `--glow-sm` and `--glow-lg`, a ring or a fill; `@keyframes tile-changed` (a tile's own accent) the one exception |
| Danger, success | none: `--rose`, `--teal` | — | — | no row yet |
| **Sophia's ramp** | | | | |
| Her light | renderer.ts: `#9c82f5`, `#f7f4ff`, `#7486f5`, ember `#6a4bb6` | the canvas, `screen` | a CSS halo: white at 0.96 and 0.86, `rgb(85 70 184 / 0.4)`, `--halo-rgb` | main; local `light/orb-result`: the orb, 10 literals, a warm ember |
| Her trace | `ROOM_INKS`, `PAPER_INKS` (trace.ts) | light added | ink laid down | main, in TS |
| The ramp | `--sophia-1..6` | — | — | 13: the CSS, the shader and the trace read it; a violet ember in 12 |
| **Scope and type** | | | | |
| Scopes | only `:root[data-theme='light']` | — | — | `[data-theme=room]`, `[data-theme=paper]` on any subtree in 15 |
| Type weight | none | — | — | per theme in 17 |

## Checks, written first

- None in code, so no `test(light)` commit: this branch is a note and four comments, and nothing renders differently.
- `grep -rn "dark-only\|only light surface\|on the dark theme" apps/studio` finds nothing; prettier passes on the four
  changed files and oxlint on the three TS ones; `tsc --noEmit` passes.
- Each later row carries its own measured check (informe-claro §6); this note is checked by review, and its principles
  by Luis.

## Limits

- The inventory is main's. The report's counts are the integration branch's, where `ui/light-elevation` adds
  `--sheet-plane` and `--veil` and `light/orb-result` replaces the paper halo with the orb: principles 6 and 7 speak of
  that orb, which main does not have yet.
- Danger and success have no row in the plan; they are named here so they are not forgotten.
- Rows 10 to 18 change the look and wait for Luis; the inventory fills in as each lands.
