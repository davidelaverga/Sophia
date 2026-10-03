# Implementation-session handoff: LFE-06, attempt 23 (one type scale for the work views)

- **Goal and attempt:** this is the last item of Luis's review of Resources: "ten font sizes down to four or five". It covers Resources and the plan's board in Tasks, which share their pieces.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `polish/type-scale` from main `784c601`, 2026-10-03.
- **End:** content commit `343a5a8`; its checks ran on it.
- **Writable scope:**
  - `theme.css`, for the tokens only;
  - `resources.css`, `planning/board.css` and `planning/plan.css`;
  - two checks and a shared helper;
  - CONTRIBUTING and LFE-06's records.

  **No contract changed.**

## Outcome

- **Four tokens in `theme.css`:** `--type-title` 14, `--type-body` 13, `--type-small` 12, and `--type-label` 10.5 for mono labels. They sit under a view's title (20) and a sheet's title (15, the app's `Sheet`). Only these views use them, so the room and the personal space are unchanged.
- **Every size in the three stylesheets maps to them:**

  | Before | Token |
  |---|---|
  | 17, 15, 14.5, 14, 13.5 | title |
  | 13, 12.5 | body |
  | 12, 11.5, 11 | small |
  | 10.5 | label |

  Avatar initials stay a glyph sized to their circle (9.5, 8.5, 11).
- **The app's pieces inside these views keep to the scale:**
  - a tag;
  - a request's quiet line;
  - a task's link;
  - a goal card's title and outcome;
  - a task sheet's report age, now a label, as on its tile.
- **Measured, the sizes on a screen:**

  | Screen | Before | After |
  |---|---|---|
  | Resources view | 9 | 5 |
  | Resource sheet | 7 | 4 |
  | Tasks board | 10 | 5 (a goal without a plan included) |
  | Task sheet | 7 | 4 |

- **What it changes by sight:**
  - a compact goal's title goes from 17 to 14 px (still semibold), so the hierarchy is a little flatter;
  - a task tile's title goes from 13.5 to 14 px, so one in the Done lane wraps to two lines;
  - a dependency line on a tile cuts a few letters sooner.

## Evidence

- **Checks:** 2 browser checks (`type ·`) count the sizes a person sees:
  - the Resources view, exactly five;
  - its sheet, five at most;
  - the board with a goal without a plan, exactly five;
  - a task's sheet, on the scale.

  Each failed when one size was put back: 12.5 on a tile's owner, 13.5 on a task's title, 15 on a goal without a plan.
- **Independent review:** no P1, 1 P2, 8 P3.
  - **The P2:** a goal without a plan kept 15 and 13.5 px, so Tasks showed seven sizes. Fixed, and now checked.
  - **P3, fixed:**
    - an avatar's initial kept at 11;
    - Sophia's answer at body size;
    - the sheet's report age as a label;
    - a declaration that never applied removed;
    - one shared helper.
  - **P3, accepted and said here:** the flatter goal title, and the wraps above.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 653, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 278 of 278.
