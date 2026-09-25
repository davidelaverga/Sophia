# Implementation-session handoff: S1-04A room access, attempt 1

- **Goal:** bring people into a project's room by QR code or an emailed invitation, keep them in a lobby until someone inside lets them in, and put sessions on the room's calendar. Added by Luis on 2026-09-25; the pack names membership invitation as product work and has no lobby or calendar.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Branch:** `rooms/access`, stacked on `studio/vision` (#9), which is stacked on `s1-04/studio-shell` (#8).
- **Writable scope:** this repository. **No hosted service was changed.** Migration 0010 is not on the hosted database, and Render and Supabase are untouched.

## Outcome

- **Record:** [docs/evidence/S1-04A/2026-09-25-attempt-1.md](../evidence/S1-04A/2026-09-25-attempt-1.md).
- **Contract:** amendment A02 (`packages/contracts/amendments/`).
- **Schema:** migration 0010.
- **API:** `apps/api/src/routes/access.ts`, with links (`invite-token.ts`), email (`mail.ts`, `invite-email.ts`) and the guest gate in `app.ts`.
- **Studio:** `apps/studio/src/features/access/`.

## For review

- Amendment A02, in particular:
  - the snapshot now carries the lobby and sessions;
  - one's own role is a separate read (`getProjectMembership`), so the snapshot stays identical for every member.
- The guest boundary: anonymous actors reach three routes only (`GUEST_ROUTES`).
- Link derivation. Rotating `INVITE_TOKEN_SECRET` retires every open link.
- Member invitations need Supabase sign-ups open, which conflicts with the pending "disable public sign-ups" (deploy/supabase/README, "Room access").

## To turn it on (owner actions)

1. Apply migrations 0009 and 0010 to the hosted database: first a dry run, then for real.
2. On Render, set `INVITE_TOKEN_SECRET` and `STUDIO_URL`, and, for email, `RESEND_API_KEY` and `INVITE_FROM`. Resend needs an account and a verified domain.
3. In Supabase, allow anonymous sign-ins for guests, with CAPTCHA if possible.
4. Deploy the stack (#8 → #9 → this).

## Next bounded action

- Davide reviews A02 and the guest boundary.
- Luis creates the Resend account, verifies a domain and sets the Render variables.
- Then run the real flow on the hosted stack: a guest from a phone scanning the QR, and a member invitation to a real address.
