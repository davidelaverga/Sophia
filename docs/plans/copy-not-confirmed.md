# An outcome nobody knows is said one way: «Not confirmed», then the next step

> 2026-10-10 · Luis: «Empieza con el 3 y el 2, luego sigue la cola». The microcopy review's fifth pattern: an outcome
> that isn't known, worded about ten ways, once as a failure. No API change.

## What was found

- A press with no reply said it failed: «Not sent. Try again.» on a task's Create and Done and on a review
  (`PassageTask`, `TaskList`, `ReviewRow`), while the request may have been recorded (Try again reuses its key, and a
  record the feed brings settles it).
- The same unknown outcome, put other ways: «Delivery is unconfirmed; nothing is resent automatically.» (`Composer`),
  «Delivery unconfirmed. Nothing is resent automatically.» and «Reply unconfirmed. Nothing is resent automatically.»
  (`useTypedChat`), «Your choice is unconfirmed. Check the brief before trying again.» (`ContinuityChoice`), «Not
  confirmed it was kept.» and «Not confirmed it was taken out.» (`passage.ts`).

## What changes

- One way, the house's own: «Not confirmed», then what the person can do or may find. «Not confirmed. Try again.»;
  «Not confirmed: it may have arrived. Nothing is sent again on its own.» (one constant, `DELIVERY_NOT_CONFIRMED`,
  for the room's chat and its foot); «Not confirmed: her reply may not come. Nothing is sent again on its own.»; «Not
  confirmed: check the brief before trying again.»; «Not confirmed: it may already be kept.»; «Not confirmed: it may
  already be out of the brief.»
- A refusal stays a refusal: «Not sent.» where the API said no, in its own words when it gave them.
- A state's one-word label («unconfirmed», «Unconfirmed» on a chip) is no sentence and stays.
- The check that reads what the Studio says (pattern 3's, `no-team-names.test.ts`) becomes `what-is-read.test.ts`,
  with this pattern's beside it: one reader of the strings, as TypeScript parses them, for both. A module shared by
  two test files would sit among what the Studio builds and trip the fixtures' boundary (`fixture-boundary.test.ts`).
- Left: the review's pattern C (explaining retries' plumbing: «never a second», «it won’t be written twice») is its own
  change; this one keeps what those lines promise and changes only how an unknown outcome is said.

## Checks (written first)

- `what-is-read.test.ts`: no string says an unknown outcome another way («Not sent. Try again.», «unconfirmed» in a
  sentence, «Not confirmed it was»). It failed first on exactly the ten strings above.
- `room-passage-task`, `room-review`, `room-passage`: a press whose reply is lost says «Not confirmed. Try again.» (a
  Keep, «Not confirmed: it may already be kept.»). They failed first, each on the old words, and pass.
- `chat-view.test.ts` reads the chat's foot with the constant.
- Mutants, with a control that passes: each old wording put back fails a check; a chip's one-word «Unconfirmed» kept
  passes.
