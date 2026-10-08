# The invitation email, with the brand

> 2026-10-07 · Luis: «verifica cómo se ve la invitación que llega al correo… plantilla estética con el branding,
> minimalista y premium». Builds on S1-04A's email (`apps/api/src/invite-email.ts`). Words, links and the calendar
> file stay as they are.

## What reads as unfinished (rendered guest and member, 720 and 390 px)

- The logo is a «●» glyph beside «Sophia», not the Umbral mark the Studio uses.
- The session sits in a boxed card under a violet mono «WHEN»: the loudest thing after the button.
- The raw link is a bare mono line with no word for what it is, and it is not a link.

## What changes

- **The Umbral mark** beside «Sophia»: a 96 px PNG (`public/brand/umbral-mark.png`, from `brand-assets.mjs`), shown at
  24 px. Mail clients do not draw SVG. It is served by the Studio the link opens (the link's own origin), so no new
  host and nothing about the reader in its address; the token sits in the fragment and never reaches it.
- **The session on a soft plane** with a warm rule at its edge, no label: the title, then the time in the second ink.
- **«Or open this link:»** above the raw address, which is now a link too, quieter (11.5 px mono, 0.48 ink).

## Checks (written first)

- The mark's address is the link's origin plus `/brand/umbral-mark.png`, for a deployed and a local Studio.
- The email carries the mark, not the glyph; the address is linked twice (the button, the raw link), labelled.
- The existing email checks pass unchanged (escaping, the member's words, the calendar file).
