# Words said whole: counts, possessives, dates, a name's limit

> 2026-11-23 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 25 to 27).
> Luis: «Yes, batch G»; on 26, «Releer en 24 h»: the Studio keeps its 24-hour clock (`time-words.md`), the browser's
> own fields stay, and the Studio's words read the choice back under them. Studio only, no API change.

## Measured

- **Plurals and possessives (25).** On `main` (`d1e6b1410`) «All 1 project» no longer shows: one project is its own
  row (`showsAllProjects`, demo-findings-1 #16). Still joined: the row to all projects read «All 4 projects · 2 from
  you» (`'All ' + workCount`), and Home's line in a call read «You’re in Sophia founder project (dev)’s room.» (a
  possessive put after a title, which often ends in a bracket).
- **Date and time (26).** Calendar's fields are the browser's own and follow the system («11/23/2026», «10:30 AM» on
  this machine); the calendar lists the same session as «Today · 10:30 – 11:30». The goal's target date: «12/15/2026»
  in its field, «15 Dec 2026» everywhere else. `time-words.md` sets the 24-hour clock as the Studio's language.
- **A name's limit (27).** «Start a project» and the first run's project field held 218 characters typed or pasted to
  180 (`useCapped`, counted as the API counts) and said nothing; Rename held them with `maxLength`, which counts an
  emoji as two, also silently. The tab carried the whole title, up to 180 characters.

## What changes

- **25 · Said whole** (`places-view.ts`: `allProjects`, `sophiaSays`, with tests).
  - The row to all projects says «All 4 projects» and, where you carried notes into them, «2 notes from you» on its
    own, in the row's note column as the other rows' notes are (one: «1 note from you»).
  - In a call, Home's line says «You’re in the room for **Launch plan**.»
  - A person's possessive stays («Marco’s camera», «Davide’s decision»): that is English, and a name doesn't end in a
    bracket.
- **26 · Read back on the Studio's clock** (`CalendarTab.tsx`, `GoalTargets.tsx`). Under Calendar's date and time,
  the session as the calendar will list it («Today · 18:30 – 19:30», `sessionLabel`); under the target date, the day
  as the Studio says it («15 Dec 2026», `dayOf`). Each is the fields' description (`aria-describedby`). The fields
  stay the browser's: no new control.
- **27 · The limit in sight** (`name-limit.ts` with tests, `NameLimit.tsx`, `useCapped`'s `onCut`; `document-title.ts`
  with tests). The project's name, in «Start a project», the first run and Rename:
  - held to 180 characters as the API counts them, Rename too (it had `maxLength`);
  - «165 / 180» under the field from 160 characters on, as its description, never announced at every key;
  - a paste that didn't all fit says «Only the first 180 characters fit.» politely, once, until the next change;
  - the tab says at most 60 characters of the title, then «…» (`tabTitle`), never cutting inside a character.

## Words (pending Luis's approval)

| Where                                | Words                                 | Alternative                      |
| ------------------------------------ | ------------------------------------- | -------------------------------- |
| Home, the row to all projects        | «All 4 projects»                      | «See all 4 projects»             |
| Home, that row's note                | «2 notes from you» / «1 note from you» | «You carried 2 notes into them» |
| Home, Sophia's line in a call        | «You’re in the room for Launch plan.» | «You’re in Launch plan’s call.»  |
| Under a project name near its limit  | «165 / 180»                           | «15 characters left»             |
| Under it, after a paste was cut      | «Only the first 180 characters fit.»  | «Cut to 180 characters.»         |

The read-backs of 26 use the Studio's existing formats (`sessionLabel`, `dayOf`): no new words.

## Checks

- `places-view.test.ts`: «All 2 projects», with and without notes from you, singular and plural; nothing while they
  load or under two; the call's line.
- `name-limit.test.ts`: the count from the last 20 characters, as the API counts (an emoji is one); the cut's words.
- `document-title.test.ts`: a title that fits is kept; a long one cut to 60 with «…», never inside a character; with
  who waits first.
- `e2e/words-whole.spec.ts`: Calendar reads 18:30 back as «… 18:30 – 19:30» and describes both fields; a target date
  reads «15 Dec 2026»; «Start a project» shows «165 / 180», a 218-character paste kept to 180 with its line, and a
  deletion takes the line away. `home.spec.ts` and `home-since.spec.ts` read the call's new line.
- Before and after in the browser (fixtures), dark and light, 1280 × 800 and 390 × 844: the row and its note laid
  out as the other rows' notes are, at the row's height (beside the title at 1280, 54 px; under it at 390, 58 px); Calendar's read-back and the goal's under their
  fields (the goal's in the field's column of its two-column form); the counter and the cut's line under the field.

## Not done

- Other joined counts in the Studio were not audited one by one; the evaluation named these.
- The tab's 60 characters are this note's choice; a narrower tab cuts the title further on its own.
