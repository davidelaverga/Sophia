# Personal: carry only what you choose

> 2026-10-06 · Luis · Davide's vision, chapter 1 «Contribute» («Your perspective. Your choice to share.»), behind the vision flag · "Continua con esos"

## The gap, measured

A note can already be carried from Personal to a project, one at a time, exactly as written (`carryPersonalNote`). What Davide's chapter asks for is a deliberate crossing: review an exact package, choose what goes and where, and see what the team will receive, knowing that the conversation stays here. Today a person carrying three findings presses Carry three times, choosing the project each time, with no single view of what goes.

## What changes

**«Review what to carry»** at the top of the notes, when there is a note and a project to carry it to. It opens the package, in the panel:

- **«Carry to»:** the person's projects (one is picked when there is only one).
- **The notes,** each with a box. None is chosen at first: nothing goes unless chosen.
- **«Stays here: this conversation, and every note you leave out.»**
- **«The team will receive»:** the chosen notes, exactly as written, in order.
- **«A selected copy, as yours. Not access to your space.»**
- **«Carry 2 notes to Product launch»** carries them. It is unavailable (aria-disabled) until a note and a project are chosen. Cancel closes the package and keeps nothing of it; while notes are on their way, Cancel waits.
- **What goes is fixed as Carry is pressed.** A carried note leaves the notes, as the space lists only kept ones, so the package counts from that batch and stays open as the list empties.

**Carried:** the package says «Carried 2 notes to Product launch. Your team sees them as yours, exactly as written.», with «Take back», which takes them all back, and Done.

**A note that doesn't go** (a refusal, or no reply) stops the package there.

- It says how many went and why («Carried 1 of 2 to Product launch. The rest wasn’t sent.», then the API's reason), with Try again for the rest and Take back for those that went.
- A note with no reply, or one that left the list meanwhile, may have gone: the package says «1 note may already be there: see Work.», never «wasn’t sent», and never carries it again (Try again skips it).
- Each note is the existing carry, one write per note, with its own key.

**Take back is honest:** «Taken back from Product launch.» only when every release came back. Otherwise it says what is still in the project, with Try again. A take-back with no answer may have come back: asked again, it goes under the same key, so the API answers as it did. The focus goes to what the package says after each step.

**Only under the vision flag.** Without it, the notes keep their single Carry as today.

## Out of scope

- One atomic package write (a proposed API could carry the notes in one receipt); for now each note is its own carry.
- Where the carried copy shows inside the project: the next PR.

## Checks (written first)

- **Browser** (`e2e/personal-carry.spec.ts`):
  - Review what to carry opens the package; nothing is chosen; Carry is unavailable;
  - two chosen show in «The team will receive», exactly as written; the unchosen one doesn't;
  - Carry carries those two, to that project, once each; the package says so; Take back takes both back;
  - a carry that fails stops the package, says how many went, and Try again carries the rest only;
  - Cancel keeps nothing; with no project, the package isn't offered;
  - carrying every note keeps the package as the notes leave the list, and the focus goes to what it says;
  - a take-back that fails says what is still in the project, and Try again takes it back;
  - a take-back whose reply was lost is asked again under its own key, and says it came back;
  - Personal's measured rules (control heights, the type scale) hold with the package open;
  - a note whose reply was lost may have gone: never carried again, and the rest goes on Try again;
  - Done after every note went puts the focus on the notes, never the page.
