# Each place has a main part and a first-level heading

> 2026-11-27 · Luis: «Sigue con la cola de mejoras de UI». P2-14 of the independent evaluation
> (`evaluacion-2026-11-22/evaluacion-independiente.md`), not among the 29 improvements. Studio only; no API change, no
> new words.

## Seen (fixtures, 1280 × 800, on main 4e2ba1cbc)

| Place    | `main` | `h1`                                     |
| -------- | ------ | ---------------------------------------- |
| Home     | none   | none (the greeting was an `h2`)          |
| Personal | none   | none («You and Sophia» was an `h2`)      |
| Work     | none   | none («Your projects» was an `h2`)       |
| Room     | none   | «Fixture project» (the top bar's name)   |

A project's other views already had their `main` (ProjectShell's page), and sign-in and the legal pages theirs.

## Change

- Home's view (`.c-home`, Places), Personal's and Work's (`.c3-space`) are `main` rather than `div` / `section`. Only
  the place on screen lacks `hidden`. For the moment a place hands over to another (usePlaceMotion, under 1.5 s), both
  show, as they did before.
- The room's root (`.studio`, StudioShell) has the `main` role, except in a shell kept out of sight for its call
  (`background`), so the page on screen keeps the only main part. It stays a `div` either way: switching its element
  would make React rebuild the room on every visit Home and back, losing a brief being written and the chat's place
  (Codex on #569).
- Home's greeting, Personal's «You and Sophia» and Work's «Your projects» are `h1`. Their rules in personal.css follow
  the tag (`.c3-head h1`). Sizes measured before and after: the same at 1280 × 800 and 390 × 844 (greeting 46.08 / 38 px,
  «You and Sophia» 12 px, «Your projects» 20 px).
- The Home fixture's frame mirrors Places (`main.c-home`). app-auth.spec's Work locator names the place, not the tag.

## Not covered

- The guest's room (GuestRoom) has no `main` either. Its frame is the guest bar and the stage under `.shell`; left for
  its own change.

## Checks

- E2E: `landmarks.spec.ts`: one `main` and one `h1` on Home, Personal, Work and the room, with the room's stage and
  controls inside its `main`. CI is the record (the Playwright guard refuses while Opera is open). Seen failing on main:
  0 `main` on all four, and 0 `h1` on Home, Personal and Work.
