# A description saved without a reply says it was saved

> 2026-10-18 · Luis: «Que sigue>», after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual.
> Si se puede hacer en un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando» · seam #9 of
> `evaluacion-2026-10-18/experiencia/costuras.md` (judge's adjustment: the hunter's line reworded, and the slot says it
> as a status in the past tense, not an alert). Studio only, no API, one PR. Review round 1 (five P2s) is folded in
> below.

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
  now reads. `ProfileSheet` keeps a typed name over a conflict, names the new one (`conflictWords`: «Changed elsewhere
  to «X». Save to use yours instead.») and offers the typed one again over the new revision.
- **The API trims with `btrim`** (`db/migrations/0027_report_facts.sql`). `summaryEdit` trims first, so the card
  reads back exactly the words sent. `edit_report_summary` overwrites the description and keeps no history of it.
- **Against the report's main (787c28fc4):** only line numbers moved. `problemOf` is at 36-45 and `edited()` in
  `fixtures/fixture-api.ts` at 1470. `window.fixture.describeElsewhere(text)` already exists (`fixtures/room.tsx`).
- **Review round 1:** a second Save, or Cancel and then Edit, before the cards read again replaced the unheard save
  (`setUnheard` kept only the last words, and `begin()` dropped it), so the first save's words came back as
  «Someone changed…». The conflict line asked for Save without showing the teammate's words. The saved line stayed on
  the closed card after a teammate's later edit. And the rule «a stale refusal says nothing first» was checked only in
  the final state, so a mutant that said «Someone changed…» for a moment survived.

## What changes

- **The decision** (`report-view.ts`, `settleUnheard`): saves whose reply was lost, or refused as stale, are
  _unheard_. They keep every text sent while unheard and the revision they were sent against (`unheardWith`: a second
  Save adds to them, never replaces them). A card read again at that revision settles nothing. A newer card that reads
  any of the words sent means a save went through: the form closes if it holds the words the card reads, and the line
  says «Saved. The reply was lost on the way, but the description reads as you wrote it.» A newer card with other
  words means someone else's are there. The typed words stay, the draft moves to the revision now read, and the line
  names theirs: «Someone changed this description to “…” since you opened it. Save to use yours instead.» With the
  form already closed, theirs shows on the card, attributed, and nothing more is said.
- **A line only while true** (`liveNote`): the saved line and the conflict line carry the words they speak of
  (`reads`). Once the card reads otherwise (a teammate's later edit, read on the window's focus), the line goes.
- **The words** (`summaryProblem`, moved from `SummaryEditor.tsx` beside the decision): `stale_revision` says nothing
  until the cards settle it, never «Someone changed…» first; `outcome_unknown` keeps its line until then.
- **The editor:** a card already newer settles a stale refusal at once. The saved line is `role=status` in its own
  quiet class (`.report-saved`, the attribution's ink), never the rose alert. Edit takes the line away, so it is said
  once per lost save, but keeps what is still unheard, and starts from the last words sent while one is (`draftFrom`),
  not the older words a slow read still shows. Leaving the form (Cancel, Esc) takes its line with it, unless a save
  still waits to be heard.
- **The levers** (`fixtures/fixture-api.ts`): `room.html?place=knowledge&summary=lost` applies the first edit, then
  throws a `TypeError` instead of answering, as the other lost-reply levers do; later edits answer.
  `window.fixture.holdReports()` holds Knowledge's card reads until `releaseReports()`, which answers them with the
  cards as they are then, as a slow API would.

## Checks (written first)

- **Unit** (`report-view.test.ts`): a card at the revision sent settles nothing, even when it reads the same words; a
  newer card with the words sent closes a form that holds them and says the saved line, politely; words typed since
  stay, over the new revision; a newer card with other words keeps the typed words, moves the base and names theirs
  in an alert; with the form closed, someone else's words say nothing. Two saves sent while unheard are both kept,
  and a card that reads the first is the person's own. Edit starts from the last words sent while unheard, else from
  the card. A line that speaks of the description goes once the card reads otherwise; a problem line stays. A stale
  refusal says nothing.
- **Browser** (`knowledge-quiet.spec.ts`): `summary=lost`, Edit, type, Save: the form closes on the read, the card
  reads the new words, the saved line is a status and there is no alert; Edit takes the line away, and Save with no
  change never says «Someone changed». A stale save whose text is already the person's
  (`describeElsewhere` with the same words, then Save) says the saved line too. The control: `describeElsewhere` with
  other words, then Save: «Someone changed this description to “A teammate’s description”…», the words still in the
  field, and Save again puts them on the card. With the card reads held: a second Save with other words, then the
  read: the saved line, the typed words kept, and Save puts them on the card; Cancel and Edit: the field holds the
  words sent, and Save closes the form as saved. The saved line goes once a teammate's edit is read. Every line said
  is recorded as it appears, so «Someone changed…» is caught even if replaced before an assertion.
- **Browser** (`report.spec.ts`, the conflict check): the line names theirs, the typed words stay, and Cancel shows
  theirs with the focus back on Edit.

## Limits

- Words typed and sent from another tab look the same as a lost reply here: the card reads them, so the line says
  saved.
- A card read that fails after a stale refusal leaves the form open with no line. Save asks again, and the next read
  settles it.
- After two unheard saves, a card that reads the first while the field holds the second says the saved line over the
  open form: the first landed, and the second is offered again over the revision now read.
- A teammate's words are named in full (up to 240 characters), so the conflict line can run to three lines on a
  phone.
