# A goal's owner and date, or a member's role, saved without a reply says what landed

> 2026-11-16 · Luis approved the lines of `evaluacion-2026-11-16/textos-lote-18.md`, items 1 and 2 (seams: «lo que el
> sistema ya sabe y calla»). The pattern is Knowledge's (seam #9, `description-reply-lost.md`): when a save's reply is
> lost, the Studio reads again and says what really landed. Studio only, no API.

## Measured (on main `9495c87fc`)

- **Both writes have no key and no `outcome_unknown`.** `setGoalTarget` and `changeMemberRole` (`api/client.ts`) call
  `apiFetch` with no catch: a network failure rejects as the browser's `TypeError('Failed to fetch')`, and the write
  timeout (`inTime`) as an `AbortError`. Neither is an `ApiError`. A 502/503/504 with no body becomes `http_5xx`
  («That didn’t go through. Try again.»).
- **Goals** (`work/GoalTargets.tsx`, `GoalTargetSection.save`, lines 179-193): any failure that is not
  `stale_revision` says «Couldn’t save the owner and date. Try again.» and reads nothing again. The form stays keyed
  to the revision it began from, so when the save had landed, a second Save sends the old revision and the API
  refuses it as `stale_revision`: «Someone changed it meanwhile; here is what it says now.» The teammate is the person.
- **Roles** (`access/InProject.tsx`, `useRoleChange.change`, lines 44-60): a failure says `err.message` on the row.
  For a lost reply that is the browser's own words («Failed to fetch», or the abort's), raw; the members are not read
  again, so the select shows the old role even when the new one stands.

## What changes

- **One rule for «the reply was lost»** (`api/reply-lost.ts`, `replyLost`): no `ApiError` at all (network, timeout),
  status 0 (`outcome_unknown`), a 5xx, or a reply that could not be read (`contract_violation`). The write may have
  landed. A 4xx is the API's answer: it keeps today's words («Someone changed it meanwhile…», «Couldn’t save the owner
  and date. Try again.», the API's refusal on the role's row).
- **Goals:** after a lost reply, the targets are read again. The goal's owner and date as sent: status «Saved. The
  reply was slow, so we checked.» Otherwise: alert «Not saved. Try again.» Either way the targets read again, so the
  form stands on the revision now read and a second Save never blames a teammate for the person's own save. A save
  that hasn't landed keeps the typed owner and date (the revision didn't move).
- **Roles:** after a lost reply, the members are read again. The member's role as sent: status «Saved. The reply was
  slow, so we checked.» on the row; otherwise alert «The role wasn’t changed. Try again.» The members and one's own
  membership are read again either way, so the select shows the role that stands.
- **The lever** (`fixtures/fixture-api.ts`, `window.fixture.loseNextSaveReply(landed)`): the next goal target or role
  `PUT` loses its reply as a network failure, after it is recorded (`true`) or before it reaches the API (`false`,
  nothing recorded).

## Checks (written first)

- **Unit** (`api/reply-lost.test.ts`): a `TypeError`, an `AbortError`, `outcome_unknown`, a 503 and an unreadable
  reply are lost; a 409 `stale_revision`, a 403 and a 422 are answers.
- **Browser** (`goal-owner-date.spec.ts`): lost after landing, the saved line as a status and no alert; Save again with
  another date says «Saved», never «Someone changed it». Lost before landing, «Not saved. Try again.», the typed date
  kept, and Save again lands it.
- **Browser** (`member-roles.spec.ts`): lost after landing, the saved line on Marco's row and the select reads the new
  role; lost before landing, «The role wasn’t changed. Try again.» and the select reads the old one.

## Limits

- If the read after a lost reply fails too, nothing is known: today's words stay («Couldn’t save the owner and
  date. Try again.», «Couldn’t change the role.»), and the next read as the project moves shows what stands.
- A teammate's change landing between the lost save and the read looks like «Not saved» (it is not the person's), or,
  if they chose the same owner and date or role, like «Saved».
