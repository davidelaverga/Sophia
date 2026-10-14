# Saying who accepts a direction

> 2026-10-14 · `evaluacion-2026-10-14/e2e-real/informe-e2e-real.md`, S1. Luis: «Arregla los puntos mencionados».

## What was measured

- The brief's direction form says «Save proposes the direction for the team to accept». On the real dev stack, the
  panel offers Accept to the one who proposed it, and through the API Davide (editor) proposed and accepted his own
  direction (202 `committed`); so did Luis (admin).
- That is the server's rule, not a slip: `decide_mission_change` lets any editor or admin decide (`can_edit`), and
  the voice flow relies on it — Sophia proposes for the speaker (`proposed_by` = the speaker) and puts the proposal
  back to them to confirm (`present_mission_proposal`, `decideChange`). Forbidding the proposer would break that
  confirmation; whether a second person must accept is a governance choice for Luis and Davide, not taken here.

## What changes

- **The form says what happens**: «Saving proposes it. Any editor or admin can accept it, you included.» It is in
  Save direction's tip, and in the button's accessible description (an `sr-only` line it names with
  `aria-describedby`), never as a sentence under it: «Say less» puts a sentence that explains a control in its tip
  (CONTRIBUTING.md; Codex P1 on #331). The words live in `mission-view.ts` (`SAVE_DIRECTION_NOTE`). Nothing else
  changes: who may decide stays the server's.

## Checks

- `mission-view.test.ts`, «who accepts a direction»: the note names any editor or admin, says «you included», and no
  longer says «the team to accept».
- `e2e/direction-who-accepts.spec.ts` (the rendered form, Codex P1 on #331): Save direction's description and its tip
  say the note, and no paragraph under it does.
- Prettier, type-aware lint, typecheck; unit tests; CI.

## Left

- If a second person should accept when the project has more members, the rule goes in `decide_mission_change` with
  a voice exception (the speaker confirming Sophia's proposal), and the panel shows «Waiting for someone else» to the
  proposer. That is Luis's and Davide's call.
