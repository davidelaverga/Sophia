# Small follow-ups (Codex P2s on #239, #240, #241, #260, #264)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». The remaining small ones, each a line or two, gathered so each is
not a PR of its own.

## What changes

- **Updates' person filter** (#239, 4249614619): «Everyone» and «You» are reserved: the viewer is always «You», and a
  member called either is told apart as two alike are («You (2)», «Everyone (2)»).
- **Recent** (#264, 4249597482): forgotten when the person changes (`forgetRecent`, with the conversations and the
  proposals in `forgetUnderWay`): another person on this browser never inherits it.
- **Palette rows' ids** (#264, 4250212890): by their place in the list (`<list>-<n>`), not the command's id, which may
  hold spaces from the service (`odd-id`).
- **A late copy** (#240, 4249590204): the latest copy settled, through or refused, an earlier write landing after it is
  said (`settled`); (#240, 4250221816) that warning and a refusal read as errors (rose).
- **The side row** (#240, 4250221807): saying something, a continued message's acts go under the bubble at its own edge
  and wrap, instead of beside it past the pane.
- **Personal's day divider** (#241, 4250199851): its day at the label size, 10.5 px.
- **The tracking check** (#260, 4249581694): a tracking that is not a number counts as off.

## Not here

- #239 4250212253 (a digest's task beyond the 50 the Tasks page reads): needs one task read by id, which the API does
  not serve; left for that read, answered in its thread.

## Checks (written first)

- `updates-narrow.test.ts` (the reserved labels), `palette-recent.test.ts` (`forgetRecent`).
- `conversation-acts.spec.ts` (a late copy over a refused one: said, in the rose), `personal.spec.ts` (the day at
  10.5 px), `palette-knows.spec.ts` (`odd-id`: the active row's id has no space and resolves to the option).
- Not run on this host: the machine guard refused Playwright (free RAM under 6 GB with AION2 open). CI is the run on
  record.
