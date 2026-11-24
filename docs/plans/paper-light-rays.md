# The formed mark keeps her light on paper: a beam on the line, a wash, slow rays

> 2026-11-24 · Luis, on Home's formed mark in light: «En light mode no hay brillo o luz o elemento dinamico para el
> logo». Three directions were drawn over Home's fixture (`evaluacion-2026-11-22/logo-claro-direcciones.png`, outside
> the repository); he picked «2 · Luz con rayos». Studio only; no API, no words.

## What was measured

- In the room, where the light forms Umbral (sign-in once through, Home, Talk; `Threshold.tsx`), her WebGL light stands
  behind the halves on the line between you (`BEHIND`, 31.5 × 22 on the 48 grid). It pours past them in soft rays that
  turn as it leans towards the pointer (`lightBehind`, at most 3.5 on the grid).
- On paper the canvas is not drawn (`.light-gl { display: none }`, `paper-orb.md`). Where the light forms the mark,
  the paper orb steps back to nothing (`.light[data-mark] { --gc-op: 0 }`). What is left is the threshold's breath, a
  4 → 12 px drop shadow on her half: on the warm paper, a smudge and nothing more. Home at 1280 × 800, light: no pixel
  past 12 px from the mark differs from the page.

## What changes

- **A paper light under the mark** (`.threshold-light`, drawn by `Threshold.tsx` beside the SVG, `aria-hidden`), on
  paper only. In the room it is not displayed, and the canvas does as before. It is placed where the light stands
  behind the mark: the line between you, `BEHIND` on the grid, scaled to the mark's size (`--ms`, 96 or 48 px).
  - **A beam** on the line: a narrow vertical light, blurred, about twice the mark's height, as the canvas pours
    through the gap. It breathes with her halo, on the threshold's own breath (4.8 s, after 1.2 s).
  - **A wash**: a soft radial of her halo around it, about three times the mark across. It breathes with the beam.
  - **Rays**: a fan of faint spokes from the same point, masked to fade outward, blurred, turning once in 90 s.
- **They lean towards the pointer, as the canvas does.** The engine already moves the light behind the mark towards
  the pointer (`sourceX`, `sourceY`). On paper it also writes that lean in pixels (`--bx`, `--by`), from a new pure
  `paperBehind` in `threshold.ts`. The light follows it, so the rays' centre shifts the way the canvas's does. Same
  springs, same reach, no new listener.
- **Colours from the theme's tokens only**: `rgb(var(--halo-rgb) / α)`, paper's violet. No literal colour, so
  `glow.test.ts` holds. Gradients and a blur, no glow shadow.
- **Motion**: two ambient loops, the breath (the threshold's 4.8 s, after 1.2 s) and the turn (90 s linear). Each is
  recorded in `motion.test.ts`'s ambient list beside the threshold's breath.
- **Reduced motion**: no turn, no breath, no lean (the engine gives no aim). The light stands still at its middle
  strength.
- **The bar's mark is untouched**, and so are the room's halves, the dark page and the paper orb elsewhere.

## Checks, written first

- **Unit** (`threshold.test.ts`): `paperBehind` gives 0 px at rest; on a 96 px mark leaning the full 3.5 on the grid to
  the right, 7 px; with no mark, 0 px. Red today: no such function.
- **Browser** (`e2e/light-mark.spec.ts`, Home in light):
  - The paper light is shown, under the mark: drawn just before it in the same box, neither lifted (the mark takes no
    pointer, so `elementFromPoint` can't say which is on top).
  - It is centred on the line between the halves (within 2 px of `BEHIND`) at 1280 × 800 and at 390 × 844.
  - Its rays turn and it breathes, so both animations run.
  - With the pointer far to the left of Home's mark (inside the page; one that leaves it is no one to lean to), its
    centre moves left.
  - In the room theme it is not displayed.
  - Under reduced motion, nothing animates.
  - Red today: there is no paper light.
- **Captures**: Home in light at 1280 × 800 and 390 × 844, and a short video, set beside the dark page for Luis.

## What was measured after

- Unit: `threshold.test.ts` 14 of 14 (`paperBehind` red before); `features/light` and `app` 442 of 443, the one left
  `attention.test.ts`, which fails on this Windows host without any change and passes in CI. `glow`, `motion`,
  `css-motion`, `elevation` and `material` fences pass, with the two loops recorded in `motion.test.ts`.
- Through `pw-gentle.ps1`: `light-mark.spec.ts` 42 of 42 over three runs (the four new checks red before), and the
  specs that touch the threshold or the light (`brand`, `home`, `home-phone-needs`, `light-breath`, `light-mode`,
  `light-room-paper`, `light-shadows`, `light-webgl`, `paper-orb`, `signin`, `signin-lede`, `card-scale`): 137 passed
  in one run, the only failures the new checks before their fix.
- Home in light, headless: at 1280 × 800 the light stands on the line (0 px off `BEHIND`) under a 96 px mark; with the
  pointer far left it leans 6.6 px towards it. At 390 × 844, under the 48 px mark, 0 px off, no sideways scroll. In
  the room the paper light is not displayed and the canvas looks as before.
- Not checked: the sign-in's and Talk's formed mark by eye (they draw the same `Threshold`, so the same light).
