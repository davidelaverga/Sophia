# Personal's day menu: a day's date on one line, your words as you wrote them

> 2026-10-13 · Luis: «sigue con los puntos 2–5», after `informe-personal-real.md` (Personal on the real stack, a month
> of conversation), finding 3.

## What was measured

- The day pill's menu («Earlier days») at 350 px: a day's date wraps to two lines («Sep / 12») in 9 of 30 rows. A menu
  row is a flex row whose label is a bare text node; beside a long detail it shrinks and wraps.
- A day's topics, and Home's «Continue» line, read the person's words in lower case: «davide and i…», «starting over
  today…». `topicOf` lowercases the words it quotes, so names and «I» lose their capitals.

## What changes

- **A menu row keeps its label on one line**, in every menu of the kit (`white-space: nowrap` on the row); the detail,
  already cut with an ellipsis, gives way.
- **Quoted words keep their case and stop at the first sentence**: «Davide and I…», «Starting over». A topic Sophia
  names («the pitch», «sleep», «someone close») stays as she names it, in lower case.

## Checks

- `conversation-view.test.ts`: `topicOf` keeps a name and «I», and stops at the first sentence; the day list as before
  with quoted words in their case.
- `e2e/personal-day-menu.spec.ts` (@phone 350): every date in the day menu on one line.
- `home.spec` reads «the launch pressure» in any case. `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware
  .`, `tsc --noEmit -p apps/studio`, the Personal and menu specs through the guard.
