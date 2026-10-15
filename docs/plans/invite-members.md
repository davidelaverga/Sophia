# Invite opens where you are: members first for an admin, guests in a call; each role said; the demo answers

> 2026-10-13 · `evaluacion-2026-10-13/informe-equipo-20.md`, findings 2–4. Luis: «Sí, empieza con la PR 1».

## What was measured

- Both ways into Invite (the header's press, key I, and «Invite people» on an empty Goals) open on Guests: a link to
  the call only. From a project's page, and from Goals with nothing planned yet, the person sought is a teammate.
- Members offers «Editor ▾» and never says what either role may do.
- In the demo, «Send invitation» answers «That didn't go through. Try again.»: the fixture refuses the write. A dead end
  on the page shown to people.

## What changes

- **The first tab follows where you are** (`firstInviteTab`): an admin out of a call opens on Members; in a call (the
  guests are the call's) or for an editor (who may invite guests only), on Guests. The tabs stay as they are.
- **The role in one line** under the member's form, for the role chosen: «Editors work on the goals and tasks, and
  invite and let in guests.» · «Viewers read the project and change nothing.»
- **The demo answers invitations** as the API does: one created is listed (sent, with its link), sent again, or
  cancelled. Nothing is emailed: the page is labelled simulated.

## Checks

- `access-view.test.ts`: the first tab for each role, in and out of a call; the line for each role.
- `e2e/invite-members.spec.ts`: an admin in the demo opens Invite on Members, reads the role's line, changes it, sends
  an invitation and sees it listed; in a call it opens on Guests; an editor opens on Guests.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Invite sheet's
  suites (sheet-frame, tabs-scale, field-scale, toast-over-sheet, room-recap) through the guard when the machine allows.
