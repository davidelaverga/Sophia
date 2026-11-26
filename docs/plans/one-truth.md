# One truth about people and states

> 2026-11-22 · Independent evaluation of `df4b4a518` (`evaluacion-2026-11-22/mejoras-ui.md`, improvements 5, 18, 6 and
> 8). Luis: «Lee y ejecuta prompt-implementacion-mejoras-ui.md», batch A. Studio only, no API change.

## Measured

On the rehearse dev stack (`df4b4a518`, Studio on :5173), with Davide in the room and Luis out of it:

- **People before joining (5).** People said «Nobody is in the call yet.» while Home said «Davide and Sophia are in
  Sophia founder project (dev).» and Work's card «Davide and Sophia are in the room». People read only this tab's own
  connection to the call (`PeoplePanel.tsx`), which doesn't exist before joining; Home reads the server's presence
  (`ProjectSummary.room`). «Join the room» said nothing of who was in.
- **Names (18).** Outsider, after saving «Marta Ruiz»: Home «Good evening, Outsider.», Personal «Hi Outsider, I’m
  Sophia», the avatar «O»; the account menu alone said «Marta Ruiz». A participant whose room token carries no name
  read as the first eight characters of their id: «Af2c37aa» on a tile (capitalised by `shortName`), «ee2c828a» in the
  chat (`authorLabel` took the id as a name), «Ee2c828a raised their hand.». Three fallbacks in use: that id, «A member»
  (written out in thirteen places), and the server's «Someone».
- **The receipt under Hold (6).** «Sent · Hold requested. The status changes when Sophia confirms.» stayed under a
  badge already reading «Held» (262 ms after the press). Goals counted a stopped goal as «1 paused», and its sheet read
  «Paused · Stopped», while Stop's own question says «Stopped goals can’t be resumed.».
- **The pulse (8).** Every dot in Work pulse was the same teal: «Hold requested», «Goal held», «Goal stopped» alike.

## What changes

- **People and Join read Home's presence before joining** (`room-presence.ts`, `useRoomPresence.ts`). The same query
  as Home (`['projects', name]`, read again every 20 s), only while this person is out of the call. People lists the
  names Home gives (`shortName`, Sophia left to the stage, as Home leaves her out of who to join); with nobody in it
  keeps «Nobody is in the call yet.», now true by the server's word. The API sends `room: null` when it couldn't ask
  the room server in time (2.5 s) or has none: that is unknown, never nobody, and so is a failed read or a project the
  list doesn't hold; People then says «Who’s in the call shows once you join.». While the server is asked it says
  nothing. Leaving the call reads the list again, and nothing is claimed until that read answers, so the person who
  just left is never listed as still in. In the call, the call's own list wins, as before. A guest (the lobby's
  token, no project list) reads nothing. The query's options are Home's own (`projectsQuery` in `usePersonal.ts`).
- **Join shows who is in**: their initials where its dot was (at most three, as Work's card shows them), and
  «Davide and Sophia are in the room» as its description (`aria-describedby` to a `hidden` element beside the button,
  so its name stays «Join the room» and the sentence is read once). The sentence is Work's card's own, now one function (`inTheRoom` in `places-view.ts`).
- **One way to name a person** (`app/person-name.ts`):
  - the signed-in person is named by the name they saved, then their provider's, then a dev identity's own, never an
    address (`ownName`); Home's greeting, Personal's first line, the avatar, the account menu and Settings read it
    through `useShownIdentity`, the account menu's own profile query, so a save shows everywhere at once;
  - in the call, their own participant takes that name at once (`withOwnName`, passed to `ProjectShell` as
    `ownName` from `SignedIn`, which reads the profile already: the fixture pages don't, and pass nothing); the
    others see it from their next join, since LiveKit names a participant by their room token;
  - anyone the Studio has no name for is one word, «A member» (`UNNAMED`): `shortName` and `spokenName` say it for a
    blank name, `toView` and the reactions keep LiveKit's empty name instead of an id, `mergeNames` never lets a blank
    name stand for a known one, and every written-out «A member» now reads `memberName` / `UNNAMED`.
- **The receipt says it waits only while it does:** taken over by `main` (`nextLine` in `labels.ts`,
  demo-findings-1.md #3), merged after this PR was opened, which does the same and more. This PR's own
  `awaitsConfirmation` was dropped when `main` was merged in (2026-11-24).
- **A stopped goal is not paused** (`goals-glance.ts`): a health of its own, «Stopped», counted apart («1 paused · 1
  stopped»), its row and sheet led by its state («Stopped», «Stopping · finished work is kept»), never «Paused ·
  Stopped».
- **Pulse dots by what happened** (`pulseTone`): asked in the halo's violet (a command sent, research requested, a
  guest at the door), done in teal, halted in amber (a goal held or stopped, a command not carried out or not
  confirmed, a guest's removal not confirmed yet). The words still say
  it; the dot only reinforces.

## Words

One new sentence; reused: «Nobody is in the call yet.», Work's «… are in the room», «A member». The words that are new
or read differently, for Luis to approve:

| Where | Before | After | Alternative |
| --- | --- | --- | --- |
| Goals' brief | «1 paused» (a stopped goal) | «1 stopped» | «1 ended» |
| A stopped goal's sheet | «Paused · Stopped» | «Stopped» | «Stopped for good» |
| A participant with no name | «Af2c37aa» | «A member» | «Someone», as the server says it on Home |
| Join's description (screen reader) | none | «Davide and Sophia are in the room» | «In the room: Davide and Sophia» |
| People, when the server can't say who is in | «Nobody is in the call yet.» (false) | «Who’s in the call shows once you join.» | «Join to see who’s in the call.» |

## Checks

- `person-name.test.ts`: the saved name first, then the provider's, then a dev identity's; never an address; one word
  for none.
- `own-name.test.ts`: this person's participant renamed, the call's list untouched, nothing changed when not needed.
- `room-presence.test.ts`: Home's short names and sentence; nobody (Sophia alone included); nothing before the read;
  three faces at most; no id for a nameless person; `room: null` is unknown, never nobody.
- `labels.test.ts`: `pulseTone` for asked, halted and done (the receipt's checks are `main`'s, for `nextLine`).
- `pulse.test.ts`: each row carries its tone. `goals-glance.test.ts`: «stopped» counted apart, its sheet line.
- `e2e/room-presence.spec.ts` (room fixture, `inroom=Davide,Sophia`): People lists Davide and Join is described by
  Home's sentence, its name still «Join the room»; nobody in (`inroom=`); `room: null` and a failed read say the
  unknown line, never «Nobody»; nothing claimed while the list is held, then its answer shows; in the call the call's
  list wins.
- In the browser, on the dev stack (:5176 against the same API) at 1280 × 800 and 390 × 844, dark and light: the
  measures in the PR.

## Left

- **«Someone» on Home** comes from the server (the project list's `room.people`), for a member with no display name; it
  can't change in the Studio. Dev identities carry no name in their room token, so for others Luis and Davide read «A
  member» in the call until they save a name: the Studio says one word instead of an id, the server would have to
  name them.
- **The resume event.** The evaluation asked to name the goal's resumption in the pulse. The API emits `goal.held` and
  `goal.stopped` (0012) and nothing when a goal resumes, so there is no event to name. That is an API change.
- **«A member» in mid-sentence** keeps its capital where a line puts a name inside a sentence («Pass to A member»,
  «Sophia sees A member’s screen»); before, those read an id. `StageMade` lowercases it; the others could follow.
- **The re-read after leaving** («nothing is claimed until it answers») is covered by the hook's code and the browser
  check on the dev stack, not by a spec: the fixture's call can't be left with the list held in one step.
- **Others see a saved name at their next join**: LiveKit names a participant by their room token. Renaming a
  participant in a live call would need the token's `canUpdateOwnMetadata` grant, an API change.
