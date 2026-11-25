# The formed mark keeps her light on paper, drawn as the room draws it

> 2026-11-24 · Luis, on Home's formed mark in light: «En light mode no hay brillo o luz o elemento dinamico para el
> logo». Three directions were drawn over Home's fixture (`evaluacion-2026-11-22/logo-claro-direcciones.png`, outside
> the repository); he picked «2 · Luz con rayos». 2026-11-25: «La luz que sea blanca no morada»; of six colours drawn
> (`logo-claro-colores.png`), «3 · Más sombra». Then, on the even fan of rays: «No me gusta esta como circular en vez
> de ser como el oscuro. Debe seguir el mismo patron que en dark mode»; the pattern drawn beside the dark page
> (`logo-claro-patron.png`), «Sí, constrúyelo». Studio only; no API, no words.

## What was measured

- In the room, where the light forms Umbral (sign-in once through, Home, Talk; `Threshold.tsx`), her WebGL light stands
  behind the halves on the line between you (`BEHIND`, 31.5 × 22 on the 48 grid). The shader (`shader.ts`, `through`)
  lets the halves block it: from that point your half covers the left, from 185.4° to 348.2° (0 up, clockwise), and
  hers the right, from 5.6° to 126.5°. The light pours past them in the two gaps left: a narrow one up the line between
  you, and a wider one down and out on her side. In the shadows the bloom falls to 40 %. The fan does not turn; it
  moves as the light leans towards the pointer (`lightBehind`, at most 3.5 on the grid).
- On paper the canvas is not drawn (`.light-gl { display: none }`, `paper-orb.md`). Where the light forms the mark,
  the paper orb steps back to nothing (`.light[data-mark] { --gc-op: 0 }`). What was left was the threshold's breath,
  a 4 → 12 px drop shadow on her half: on the warm paper, a smudge and nothing more.
- Paper is nearly white (251, 248, 243): a white light shows only against something darker.

## What changes

- **A paper light under the mark** (`.threshold-light`, drawn by `Threshold.tsx` beside the SVG, `aria-hidden`), on
  paper only. In the room it is not displayed, and the canvas does as before. It stands where the canvas's light
  stands behind the mark (`BEHIND`), scaled to the mark's size (`--ms`, 96 or 48 px).
  - **The halves' shadows**, close to the mark: a conic gradient from that point, deep (`--shadow-rgb` at 17 %) over
    your half's arc and faint (5 %) over hers, soft at each edge, fading within about a mark and a half.
  - **The light that gets past**, reaching further: white (`--sheen-rgb`) in the two gaps, softer (60 %) over her arc,
    none over yours; and a white line on the gap between two shadows (15 %), as the canvas's light shows through it.
    It breathes on the threshold's own breath (4.8 s, after 1.2 s).
- **The angles come from the mark.** A new pure `shadowArcs(source)` in `threshold.ts` gives each half's arc from the
  ends of its straight edge, from the same `UMBRAL` discs the shader blocks with. The CSS's edges stand on them, and a
  unit check holds them there.
- **It moves towards the pointer, as the canvas does.** The engine writes the lean in pixels on paper (`--bx`, `--by`,
  from the pure `paperBehind`), from the same springs. The whole light moves; its shadows keep their angles (on the
  canvas they turn a few degrees as the light leans, within about 7 px).
- **Colours from the theme's tokens only**: `--sheen-rgb` and `--shadow-rgb`. No literal colour, so `glow.test.ts`
  holds. Gradients, masks and a blur, no glow shadow.
- **Motion**: one ambient loop, the breath, recorded in `motion.test.ts` beside the threshold's own. No fan turns.
- **Reduced motion**: no breath and no lean (the engine gives no aim). The light stands still at its middle strength.
- **The bar's mark is untouched**, and so are the room's halves, the dark page and the paper orb elsewhere.

## Checks, written first

- **Unit** (`threshold.test.ts`): `paperBehind` gives 0 px at rest, 7 px for the full 3.5 on a 96 px mark, 0 with no
  mark. `shadowArcs(BEHIND)` gives your half 185.4° → 348.2° and hers 5.6° → 126.5°. The two conic gradients in
  `theme.css` (the shadows and the light) have their edges within a degree of those arcs. Red before: no such
  functions, and the even fan has no such edges.
- **Browser** (`e2e/light-mark.spec.ts`):
  - Home in light: the paper light is shown, under the mark (drawn just before it in the same box, neither lifted; the
    mark takes no pointer, so `elementFromPoint` can't say which is on top).
  - It is centred on the line between the halves (within 2 px of `BEHIND`) at 1280 × 800 and at 390 × 844.
  - Its shadows are a conic of `--shadow-rgb`; its light a conic of white, with no violet.
  - It breathes and nothing turns: one animation runs.
  - With the pointer far to the left of Home's mark (inside the page), it moves left.
  - The same light, centred, on the sign-in once the link has gone and on Talk, at both sizes.
  - In the room theme it is not displayed, on Home, the sign-in or Talk.
  - Under reduced motion, nothing animates.
- **Captures**: Home, the sign-in and Talk in light at 1280 × 800 and 390 × 844, and a short video, beside the dark
  page.

## What was measured after

- Unit: `threshold.test.ts` 16 of 16 (the edges' check red on the fan before the CSS changed); `features/light` and
  `app` 444 of 445, the one left `attention.test.ts`, which fails on this Windows host without any change and passes
  in CI. The `glow`, `motion`, `css-motion`, `elevation` and `material` fences pass.
- Browser, through `pw-gentle.ps1`: `light-mark.spec.ts` 60 of 60 over three runs; the specs that touch the threshold,
  the paper orb or the light (`paper-orb`, `light-room-paper`, `light-breath`, `light-shadows`, `light-webgl`,
  `signin`, `home`, `personal`, `brand`) 201 of 201. Earlier versions: the white fan 60 of 60, the violet 42 of 42
  plus 137 related.
- Home in light: 0 px off `BEHIND` under a 96 px mark; with the pointer far left it moves 6.6 px towards it. At
  390 × 844, under the 48 px mark, 0 px off. The sign-in once the link has gone and Talk: 0 px off at both sizes, no
  sideways scroll. On the phone's sign-in, the darkest paper behind «Check your email» is (244, 241, 237): 15.1:1
  against the ink. In the room, nothing changes.
- Captures: `evaluacion-2026-11-22/logo-claro-patron-construido.png` and `.mp4`, outside the repository.
- On the phone, Home's mark sits at the right edge, so the screen's edge cuts the light on her side.
