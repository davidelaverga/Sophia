# The invitation email, with the brand

> 2026-10-07 · Luis: «verifica cómo se ve la invitación que llega al correo… plantilla estética con el branding,
> minimalista y premium», then «¿se siente como un correo de una app que pagarías 20 dólares?». Builds on S1-04A's
> email (`apps/api/src/invite-email.ts`). The subject, the links and the calendar file stay as they are.

## What reads as unfinished (rendered guest and member, 720 and 390 px)

- The logo is a «●» glyph beside «Sophia», not the Umbral mark the Studio uses.
- Nobody is in it: the inviter is a word in the headline, the project a quoted phrase.
- The session sits in a boxed card under a violet mono «WHEN», its time zone an identifier («Europe/Madrid»), and the
  attached calendar file goes unmentioned.
- The lead runs three lines; the guest note reads like a clause.
- The raw link prints the whole token in mono, unlabelled, and is not a link.
- The greys are rgba: Outlook's Word engine drops them (black text on the void).

## What changes

- **The Umbral mark** beside «Sophia»: a 96 px PNG (`public/brand/umbral-mark.png`, from `brand-assets.mjs`), shown at
  24 px; mail clients do not draw SVG. It is served by the Studio the link opens (the link's origin): no new host,
  nothing about the reader in its address, the token never in it. When the address is not a web one (a
  `STUDIO_URL` without its scheme), the email still goes out, without the mark and with the whole link shown.
- **Who invites, then where:** the inviter's initial in a ring and «Lucia invited you», then the project's title as
  the headline.
- **The session on a soft plane** with a warm rule: the title, the time named as people say it («Spain Time»,
  `Intl` `shortGeneric`), and «The calendar invitation is attached.»
- **Two short sentences** for the lead; the guest note says what a guest reaches, plainly.
- **«Or open studio…/join»**: the site and path, linked to the whole address; the token is never printed.
- **Solid inks** for every grey, the same values over the void.

## Order of release

The Studio must serve `/brand/umbral-mark.png` before the API sends this email: its SPA rewrite answers a missing
file with `index.html` and a 200, so a broken image would show nowhere but in the inbox.

## Checks (written first)

- The mark's address is the link's origin plus `/brand/umbral-mark.png`, for a deployed and a local Studio; the file
  exists in the Studio's `public/brand`.
- An address without a scheme renders without the mark and shows the whole link, without throwing.
- The email carries the mark, not the glyph; the inviter row; the title as headline; the address linked twice (the
  button, the site), the token never as text.
- The time reads «… 10:00 – 11:00 Colombia Time»; the calendar line only with a session.
- The existing email checks pass (escaping, the member's words, the calendar file).
