# What a person reads says what Sophia does, never what runs her

> 2026-10-10 · Luis: «Empieza con el 3 y el 2, luego sigue la cola». The microcopy review's first pattern, engineering
> words in what users read: this part is the «runtime» where the subject is Sophia herself. No API change.

## What was found

- A task of Sophia's spoke of her runtime, not of her: «Admitted» · «Waiting for Sophia’s runtime to pick it up.», «Sent
  to the runtime; not confirmed running yet.», «The runtime is drafting.», «…waiting for the runtime to confirm.», «The
  runtime could not finish it.», «The runtime is researching.»; the heading over them, «Briefs from Sophia’s runtime»;
  a research card, «Waiting for the research runtime.»; the room's log, «Brief waiting for Sophia’s runtime»; the source
  review, «No runtime carries the reviewer right now; the review starts when one does.»

## What changes

- Sophia is the subject: «Queued» · «Waiting for Sophia to start it.», «Sent to Sophia; not confirmed started yet.»,
  «Sophia is drafting.», «…waiting for Sophia to confirm.», «Sophia could not finish it.», «Sophia is researching.»;
  «Briefs from Sophia» (research, work); «Waiting for Sophia to start the research.»; «Brief waiting for Sophia»;
  «Sophia can’t take the review right now; it starts as soon as she can.» What was not confirmed still says so.
- Left for its own decision: the board's words for its agents' work («the lead», «observed», «plan in force»,
  «assignment», and «runtime» where it means a coding agent's host, in an act's steps). They name concepts the board is
  built on (WBC): renaming them is a product decision, with the review's fourth pattern, not a copy cleanup.

## Checks (written first)

- `conversation-view.test.ts`: no phase of a brief, a research or a design names a runtime or says «admitted»; the
  headings say Sophia's work. `report-view.test.ts`: a queued research waits for Sophia. Each failed first, and passes.
- `report`, `work`, `room`: unchanged, pass (246); unit tests (1018).
- Mutants, with a control that passes: «runtime» back in a phase, «Admitted» back, a heading or the research's note
  back to the runtime: each fails.
