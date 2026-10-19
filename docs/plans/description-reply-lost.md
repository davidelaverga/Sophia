# A description saved without a reply says it was saved

> 2026-10-18 · Luis: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual.
> Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando» · seam #9 of
> `evaluacion-2026-10-18/experiencia/costuras.md` (judge's adjustment: the hunter's line reworded, and the slot says it
> as a status in the past tense, not an alert). Studio only, no API, one PR.

## Measured

- **The cause is known:** a save that hears nothing back fails in `callApi`'s fetch catch as `outcome_unknown`
  (`api/client.ts`). `SummaryEditor.tsx`'s `save` (now lines 90-103) keeps the form open, says «No reply from Sophia: it
  may have been saved. It will show here when the list reads again.», and `onSaved()` reads the cards again. The
  `PATCH` carries no Idempotency-Key (`api/artifacts.ts`, now lines 72-73), and the draft keeps the revision it began
  from (`summaryEdit`, `report-view.ts` 623-636).
- **What the person sees:** the cards come back with the words sent, but the line stays and the form stays open over
  them. A second Save sends the old revision. The API refuses it as `stale_revision`, the form closes, and the line
  says «Someone changed this description since you opened it. Theirs is shown; edit again if you need to.» «Theirs»
  is the person's own save.
- **A real conflict loses the typed words:** on `stale_revision`, `stop()` closes the form whatever the description
  now reads. `ProfileSheet` keeps a typed name over a conflict and offers it again over the new revision.
- **The API trims with `btrim`** (`db/migrations/0027_report_facts.sql`). `summaryEdit` trims first, so the card
  reads back exactly the words sent.
- **Against the report's main (787c28fc4):** only line numbers moved. `problemOf` is at 36-45 and `edited()` in
  `fixtures/fixture-api.ts` at 1470. `window.fixture.describeElsewhere(text)` already exists (`fixtures/room.tsx`).

## What changes

- **The decision** (`report-view.ts`, `settleUnheard`): a save whose reply was lost, or refused as stale, is
  _unheard_. It keeps the words sent and the revision they were sent against. A card read again at that revision
  settles nothing. A newer card that reads the words sent means the save went through: the form closes if it still
  holds those words, and the line says «Saved. The reply was lost on the way, but the description reads as you wrote
  it.» A newer card with other words means someone else's are there. The typed words stay, the draft moves to the
  revision now read, and the line says «Someone changed this description since you opened it. Cancel to see theirs,
  or Save to use yours.» With the form already closed, theirs shows on the card, attributed, and nothing more is said.
- **The editor:** `outcome_unknown` keeps its line until the cards settle it. `stale_revision` says nothing until then
  (no more «Someone changed…» before the text is known); a card already newer settles it at once. The saved line is
  `role=status` in its own quiet class (`.report-saved`, the attribution's ink), never the rose alert. Edit clears the
  line and any unheard save, so it is said once per lost save. Leaving the form (Cancel, Esc) takes its line with it,
  unless a save still waits to be heard.
- **The lever** (`fixtures/fixture-api.ts`'s `edited()`): `room.html?place=knowledge&summary=lost` applies the first
  edit, then throws a `TypeError` instead of answering, as the other lost-reply levers do. Later edits answer.

## Checks (written first)

- **Unit** (`report-view.test.ts`): a card at the revision sent settles nothing, even when it reads the same words; a
  newer card with the words sent closes a form that holds them and says the saved line, politely; words typed since
  stay, over the new revision; a newer card with other words keeps the typed words, moves the base and says the
  conflict as an alert; with the form closed, someone else's words say nothing.
- **Browser** (`knowledge-quiet.spec.ts`): `summary=lost`, Edit, type, Save: the form closes on the read, the card
  reads the new words, the saved line is a status and there is no alert; Edit takes the line away, and Save with no
  change never says «Someone changed». A stale save whose text is already the person's
  (`describeElsewhere` with the same words, then Save) says the saved line too. The control: `describeElsewhere` with
  other words, then Save: «Someone changed…», the words still in the field, and Save again puts them on the card.
- **Browser** (`report.spec.ts`, the conflict check): the typed words stay after the conflict, and Cancel shows theirs
  with the focus back on Edit.

## Limits

- Words typed and sent from another tab look the same as a lost reply here: the card reads them, so the line says
  saved.
- A card read that fails after a stale refusal leaves the form open with no line. Save asks again, and the next read
  settles it.
