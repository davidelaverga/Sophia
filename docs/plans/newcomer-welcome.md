# The newcomer's welcome: who brought you, as what, what the project is for, where to start

> 2026-10-13 · `evaluacion-2026-10-13/informe-equipo-20.md`, finding 5. Luis: «sigue con la PR 2».

## What was measured

- «Accept and open the project» lands the new member in the room, empty: «The room is ready». Nothing says who invited
  them or as what, what the project is for, or where to begin, though the invitation, the mission and the goals know.

## What changes

- **Remembered at the door**: accepting a member's invitation keeps, for this tab, the project, who invited them and
  the role they joined as (`rememberWelcome`, session storage; nothing if storage is refused).
- **Said once, in the project**: under the project's bar, one quiet band: «Welcome to “Onboarding pilot”», «Lucia invited
  you as an editor.», what the project is for (the mission's purpose, else its statement, when the ledger reads), its
  goals in a word («3 goals», «No goals yet»), and two presses: «See the goals» (opens Goals) and «Got it». Either
  press, or a week passing, ends it; it never comes back for that project.
- Nothing for a guest (a guest never accepts an invitation), nothing on any other project, nothing in a project
  opened without having just joined.

## Checks

- `welcome.test.ts`: kept and read back for its project only, within a week; forgotten once ended; the band's words (the
  role, the goals, a missing inviter, the purpose else the statement).
- `e2e/newcomer-welcome.spec.ts`: a project just joined (`welcome=1` on the room fixture) says the welcome; «See the
  goals» opens Goals and the band is gone, also after a reload; «Got it» ends it; a project not just joined says nothing.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; CI as the run on
  record while the machine refuses local browser runs.
