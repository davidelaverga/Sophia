# Retire scripts/add-member.ts (CON-01 Q5)

> 2026-10-26 · Luis, answering CON-01's Q5 (docs/coordination/CON-01/BINDING_MAP.md, «Audience: a rule, not a
> trigger», and its questions table): «Retirarlo».

## Why

- **What Q5 asks:** every writer that changes a project's membership must lock the project FOR UPDATE, bump
  `audience_revision` and change `project_members` in one transaction. That is how a published answer knows its
  audience. `accept_room_invitation` conforms.
- **What `scripts/add-member.ts` did:** it wrote `project_members` directly as the migration owner, with no lock, no
  bump and no activity record.
- **Why it can go:** it was born as an «operator stand-in until the membership invitation handler exists». That
  handler exists now (S1-04A invitations), and it follows the rule.

## What changes

- **`scripts/add-member.ts` is removed.** The local stack's banner now says to invite from the project and send the
  link it shows. Without a mailer, the Studio shows the invitation's link.
- **A guard:** `tests/unit/membership-writers.test.mjs` fails if any script or runtime source writes
  `project_members` directly. Tests, `packages/test-support` and the browser checks' support set fixtures up as the
  owner and are left out. It was red on `scripts/add-member.ts` and is green once the script is removed.
- **Q5's answer:** replaced by the Studio's invitations; no other membership writer is left outside the database's
  functions. The S1-02 handoff and evidence keep their mentions of the script as history.
