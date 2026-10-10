# An outcome nobody knows is said one way: «Not confirmed», then the next step

> 2026-10-10 · Luis: «Empieza con el 3 y el 2, luego sigue la cola». The microcopy review's fifth pattern: an outcome
> that isn't known, worded about ten ways, once as a failure. No API change.

## What was found

- A press with no reply said it failed: «Not sent. Try again.» on a task's Create and Done and on a review
  (`PassageTask`, `TaskList`, `ReviewRow`), and «Not sent to the room: “…”» on a message to the room
  (`useRoomMessage`), while the request may have been recorded (Try again reuses its key, and a record the feed brings
  settles it).
- The same unknown outcome, put other ways: «Delivery is unconfirmed; nothing is resent automatically.» (`Composer`),
  «Delivery unconfirmed. Nothing is resent automatically.» and «Reply unconfirmed. Nothing is resent automatically.»
  (`useTypedChat`), «Your choice is unconfirmed. Check the brief before trying again.» (`ContinuityChoice`), «Not
  confirmed it was kept.» and «Not confirmed it was taken out.» (`passage.ts`).

## What changes

- One way, the house's own: «Not confirmed», then what the person can do or may find. «Not confirmed. Try again.»;
  «Not confirmed: “…”» for a message to the room (as a project's conversation already says it), with Try again;
  «Not confirmed: your message may have arrived. Nothing is sent again on its own.» (one constant,
  `DELIVERY_NOT_CONFIRMED`, for typing to Sophia in the room and the chat's foot); «Not confirmed: her reply may not come. Nothing is sent again on its own.»; «Not
  confirmed: check the brief before trying again.»; «Not confirmed: it may already be kept.»; «Not confirmed: it may
  already be out of the brief.»
- A refusal stays a refusal where it is told apart: the API's own words, «Not sent.» if it gave none, and «Not sent:
  it’s back in the field» where the words are handed back. (`ContinuityChoice` doesn't tell a refusal apart from no
  reply, and says «Not confirmed» for both, as it said «unconfirmed» before.)
- Out of this change: the media bridge's own words for typing to Sophia (`apps/media-bridge/src/room-session.ts`:
  «Delivery is unconfirmed…», «Reply unconfirmed…», sent as a `refused` packet). The Studio shows a packet's text as
  it comes, so in a live room the bridge's words may replace the Studio's once its 60 s pass. Changing them, and
  whether an unknown outcome should travel as `refused`, is the bridge's (and its contract's) own change, for Davide.
- Other unknown outcomes said in other words stay for now: «Sophia didn’t answer.» (`AdmissionNote`, for invitations
  and the calendar: pattern D, Sophia as the server), «Sent, and not confirmed yet…» (`explore/direction.ts`, a fixture
  view), and a bare «Not confirmed.» whose next step is its button (`MeetingRecap`, `ShowEveryone`).
- A state's one-word label («unconfirmed», «Unconfirmed» on a chip) is no sentence and stays.
- The check that reads what the Studio says (pattern 3's, `no-team-names.test.ts`) becomes `what-is-read.test.ts`,
  with this pattern's beside it: one reader of the strings, as TypeScript parses them, for both. A module shared by
  two test files would sit among what the Studio builds and trip the fixtures' boundary (`fixture-boundary.test.ts`).
- Left: the review's pattern C (explaining retries' plumbing: «never a second», «it won’t be written twice») is its own
  change; this one keeps what those lines promise and changes only how an unknown outcome is said.

## Checks (written first)

- `what-is-read.test.ts`: no string says an unknown outcome another way («Not sent. Try again.», «Not sent to …»,
  «unconfirmed» in a sentence, «Not confirmed it was»). It failed first on exactly the strings above (ten, then the
  room's message, which the review found).
- `room-passage-task`, `room-review`, `room-passage`, `room-discussion`: a press whose reply is lost says «Not
  confirmed. Try again.» (a Keep, «Not confirmed: it may already be kept.»; a message to the room, «Not confirmed:
  “…”»). They failed first, each on the old words, and pass. The older notes that quoted the old words
  (`room-passage-task.md`, `room-review.md`, `room-discussion.md`) quote the new ones.
- `chat-view.test.ts` reads the chat's foot with the constant.
- Mutants, with a control that passes: each old wording put back fails a check; a chip's one-word «Unconfirmed» kept
  passes.
