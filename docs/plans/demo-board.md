# The demo's Tasks show the rollout's plan as a board

> 2026-10-09 · Luis: «sigue evaluando e iterando», after the «$20» evaluation. Measured: the demo's Tasks
> (`room.html?demo=1`, Tasks) repeat Goals' three goals with their presses and a Work pulse of one line; the board the
> Studio draws for a planned goal is only on `work.html`, with another project's words. Fixture data only; nothing the
> Studio builds changes.

## What is wrong

- The demo serves no plan (`/plans` answers each goal with none), so the Tasks a presentation opens look like Goals
  again. The board — lanes, who works on what, what waits on whom — is what the vision is about, and the demo can't
  show it.

## What changes

- The demo's board serves a plan for its running goal, «Roll the new onboarding out to every region»: the same plan the
  board fixture uses (its shape, its sessions, its decisions, exactly as the service would admit them), in the
  onboarding pilot's words. The tasks:
  - Map where new admins get stuck · Write the admin-change checklist (Luis, by hand)
  - Translate the checklist for the second region (Claude Code) · Review the translation (after it)
  - Review the first-week report (Codex) · Write the rollout note (Luis, after the translation)
  - Measure days to a first shared report (nobody yet)
- The other two goals keep no plan, as a ready and a completed goal would. Goals doesn't change.
- Without `?demo=1` nothing changes.

## Checks (written first)

- `views-goals.spec.ts`: the demo's Tasks draw the rollout's board: its lanes, the translation task among the active
  ones, its next checkpoint said; none of the board fixture's words («PDF», «render», «ReportPane») anywhere.
