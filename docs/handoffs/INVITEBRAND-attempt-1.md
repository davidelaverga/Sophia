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
Ending commit/tree: `5504faef918c00794798575e5ca1403d8af7e6af` (tree `54af3b63e73e93855ef43e9c6d969b132486339d`). The commit after it adds only this handoff.

## Outcome

Design note: `docs/plans/invite-brand.md`. No API route, payload or send path changed.

- The Umbral mark (24 px, from a new 96 px PNG made by `brand-assets.mjs`; the other rasters regenerate unchanged)
  replaces the «●» glyph. Its address is the link's origin (`markUrl`), so it comes from the Studio the reader is
  invited to.
- The session on a soft plane with a warm rule, no «WHEN» label.
- «Or open this link:» above the raw address, now a link, quieter.

## Evidence

- `invite-email.test.ts` 7 passed (a new check: the mark's address for a deployed and a local Studio, no glyph, the
  address linked twice and labelled).
- Mutants, each killed with the control surviving: the mark from the full link (token included), the glyph back,
  the raw address not a link, the label dropped.
- Renders of the guest and member emails at 720 and 390 px, before and after.
- Prettier, `oxlint --type-aware`, `tsc` for the API.

## Limitations and next action

- Clients that block remote images until asked (Outlook, some Gmail settings) show «Sophia» alone; the email reads
  the same without the mark (`alt=""`).
- Next: merge on green CI with no Codex P1.
