# The fixture's stopped feeds, and one builder for a sheet's link

> 2026-10-19 · two follow-ups from the triage (`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`): #369
> (`fixtures/fake-people.ts`, «Remove stopped tracks from fixture feeds») and #413 (`resources/link.ts`, «Make
> addressOf the single sheet-link builder»); Luis 2026-10-19: «Entonces sigue trabajando en lo que viene mientras
> esperamos». Studio only, no API. Stacked on batch 5 (`group/follow-ups-5`), which stacks on #468, the PR the triage
> said to wait for before touching the fixture.

## What was read

- **The fixture's feeds come from the address alone.** `feeds()` (`fake-people.ts`) gives a camera to everyone still
  here for `video=camera`, the `screenBy`th person's screen for `video=screen`, and the first two screens for
  `video=screens`. An admin's Turn off camera or Stop screen sharing lands in `cameraOff` / `screenOff`, which only
  `person()` reads: the person's `cameraOn` / `screenOn` turn false, and People drops the menu item, but the feed stays.
  `theirs()` (`fake-livekit.ts`) filters the feeds only by `incoming`, so the stage keeps drawing a video LiveKit would
  have unpublished. The same holds for a person an admin removed: `others()` drops them, `feeds()` doesn't.
- `host-controls.spec.ts` checks only that the act reaches the server (`served`), never the stage. No other spec or
  fixture reads `cameraOff` or `screenOff`.
- **Two builders of a sheet's address.** `addressOf(id, prefix)` (`link.ts`, work-copy-links.md) joins the page's
  origin, path and query with `linkHash`. `OpenConversation.tsx` keeps its own `conversationLink`, the same string
  with `CONVERSATION`, for its «Copy link» (#375, conversation-address.md). A grep for the join finds only these two.

## What changes

- **A feed is a person's camera or screen while it is on** (`feeds()`): each feed is read from the people
  `others()` lists, a camera where `cameraOn`, a screen where `screenOn`. A camera turned off or a screen stopped
  leaves the stage, as LiveKit's unpublish does, and so do the feeds of someone removed from the call. What the
  address asks is unchanged: `person()` already says who has which on. The one difference past the brief: a
  `screenBy` past the number of people now shows no screen, where it showed a screen with no one behind it. No spec
  asks for one (`camera-flip` and `room-tiles` use `screenBy=8` with nine people).
- **`addressOf` is the one builder.** The conversation's «Copy link» copies `addressOf(c.id, CONVERSATION)`, and
  `conversationLink` goes. Nothing on screen changes.

## Checks (written first)

- **Browser,** `host-controls.spec.ts`: with `video=camera`, Lucía's tile has a video; an admin turns her camera off
  and the video leaves her tile, while Marco's stays. With `video=screen`, an admin stops Marco's screen and the shared
  screen leaves the stage. Red today: the video stays. `room-tiles.spec.ts` and `camera-flip.spec.ts`, which lean on
  the feeds, stay green.
- **Unit,** `link.test.ts`: in the Studio's source, only `resources/link.ts` joins the page's origin, path and query
  with a link hash. Red today: `OpenConversation.tsx` does too. The copy-link checks stay green
  (`conversations-polish.spec.ts`, `conversation-moves.spec.ts`, `goals-overview.spec.ts`, `work.spec.ts`).

## Not here

The API side of #369 (mute-all past a participant who left, a screen's audio before its unpublish) is Davide's lane.
The fixture's own camera (`ownFeed`) already follows the viewer's switch and is untouched.
