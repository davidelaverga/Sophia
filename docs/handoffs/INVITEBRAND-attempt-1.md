# Implementation-session handoff

Goal and attempt: the invitation email carries the brand, minimal and premium, attempt 1. Luis: «Tambien verifica como
se ve la invitacion que llega al correo. Si tiene una plantilla estetica con el branding, minimalista y premium».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Goal ID: none in the pack's goal index (`docs/pack/delivery/GOAL_INDEX.md`): a slice from Luis's queue, named in «Goal and attempt».
Writable scope: `apps/api/src/invite-email.ts`, `apps/api/src/invite-email.test.ts`, `apps/studio/scripts/brand-assets.mjs`, `apps/studio/public/brand/umbral-mark.png`, this handoff and `docs/plans/invite-brand.md`.
Runtime unit: the API's invitation email (rendered, not sent) and one static Studio asset; no database, worker, mail send or deployment touched.
Existing authority: Luis's instructions in this session (quoted in «Goal and attempt»); merge on green CI with no Codex P1; no deploy, no production data, no comment on Davide's PRs.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `mail/invite-brand` from `main` (`c645af18e5bc242bf2b837c8e99430f6f079c54a`), 2026-10-07
Ending commit/tree: `b173165b20882d3079fc1dc24aa7305f95949923` (tree `8efb8baeea524459784a6e559cab0c56be58903c`). The commit after it adds only this handoff.

## Outcome

Design note: `docs/plans/invite-brand.md`. No API route, payload or send path changed; the subject and the text
version's link stay.

- The Umbral mark (24 px, from a new 96 px PNG made by `brand-assets.mjs`; the other rasters regenerate unchanged)
  replaces the «●» glyph, from the link's origin (`siteOf`, `markUrl`). A Studio address without a scheme no longer
  can throw while the invitation is sent: the email goes without the mark and shows the whole link.
- The inviter's initial in a ring and «Lucia invited you», then the project's title as the headline.
- The session on a soft plane with a warm rule, its time zone in words («Spain Time»), and «The calendar invitation
  is attached.»
- Shorter lead and guest note; «Or open studio…/join» linked, the token never printed.
- Solid hex inks instead of rgba (Outlook drops rgba), `bgcolor` on the outer table.

## Evidence

- `invite-email.test.ts` 8 passed: the mark's address (deployed, local), the PNG present in the Studio's
  `public/brand`, an address without a scheme (no mark, no throw, whole link), the inviter row, the title as headline,
  the time in words, the calendar line only with a session, the token never as text.
- Mutants, each killed with the control surviving: the mark from the full link, the glyph back, the raw address not
  a link, any protocol accepted, `new URL` left to throw, the token printed, the zone as an identifier, no inviter row.
- Renders of the guest and member emails at 720 and 390 px, before and after, and after with web fonts blocked (as
  Gmail shows them).
- Prettier, `oxlint --type-aware`, `tsc` for the API.
- Independent review: no P1; two P2s fixed (a scheme-less `STUDIO_URL` throwing after the invitation is written; the
  release order, since the Studio's rewrite hides a missing PNG behind a 200), and its P3s (rgba in Outlook,
  `word-break` on the cell, this handoff's image-blocking claim).

## Limitations and next action

- **Release order:** deploy the Studio (which serves `/brand/umbral-mark.png`) before the API that sends this email.
- Clients that block remote images until asked show a placeholder frame (Outlook) or nothing where the mark goes; the
  email reads the same without it.
- Not seen in a real inbox (Gmail, Outlook, Apple Mail): that needs Luis's mailbox or a paid preview service.
- A `STUDIO_URL` without its scheme still makes broken links; refusing it at start-up is Davide's config call.
- Next: merge on green CI with no Codex P1.
