# Stop screen: the sound first, and a track already gone is done

> 2026-11-16 · Item 3 of the API follow-ups draft (`evaluacion-2026-11-08/issue-api-followups.md`, Codex P2 on #369).
> Luis 2026-11-16 chose to fix the draft's points ourselves instead of publishing the issue. API only
> (`apps/api/src/livekit.ts`); no route, contract, SQL or copy changes.

## Measured

- **Order by the participant's list.** `stopScreen` → `muteSources` mutes the participant's tracks whose source is
  `SCREEN_SHARE` or `SCREEN_SHARE_AUDIO`, in the order `getParticipant` lists them (`muteUnmuted`, one
  `mutePublishedTrack` per track still on).
- **The Studio answers the share's mute by stopping the share.** `apps/studio/src/features/voice/livekit-room.ts:252`:
  on `TrackMuted` of its own `ScreenShare`, it calls `setScreenShareEnabled(false)`, which unpublishes the share and its
  sound. A mute of `SCREEN_SHARE_AUDIO` alone is ignored there. So with the share first, the sound's mute races the
  unpublish; with the sound first, it doesn't.
- **How «gone» comes back** (checked against the code, not only the draft):
  - `livekit-server-sdk` 2.19.1 throws a `ServerError` (`status`, the HTTP status; `code`, Twirp's code string) for any
    4xx, without failover (`TwirpRPC.js`, `toTwirpError`).
  - The pinned server (`livekit/livekit-server:v1.13.7`, `scripts/lib/livekit.ts`) answers a mute of a sid that is no
    longer published with **no error** and no track (`RoomManager.MutePublishedTrack` → `SetTrackMuted` returns a nil
    `TrackInfo`). It answers a participant or room that is gone with psrpc `NotFound` (`ErrParticipantNotFound`,
    `ErrRoomNotFound`), which reaches Twirp as `not_found`, HTTP 404.
  - So on the pinned server the race the draft describes does not turn into a failure today; it does where the answer
    is `not_found` (the person left between the read and the mute, or a server that refuses an unknown track). The
    draft's fix stands for both: the sound is muted by the host rather than left to the client's unpublish, and
    `not_found` is no longer a failure.

## What changes

1. **The sound before the share.** `muteSources` orders the tracks by the sources it is given (stable within one
   source), and `stopScreen` gives `[SCREEN_SHARE_AUDIO, SCREEN_SHARE]`. `stopCamera` gives one source: unchanged.
2. **A track already gone is done.** In `muteUnmuted` (through `muteIfThere`), a mute refused as not found
   (`isNotFound`: a `ServerError` with the code `not_found`, a small helper near the top of the file), or answered with
   no track, is skipped: not counted, not a failure. The code alone, never a bare 404: Twirp's `bad_route` and a proxy's
   error page are 404 too, and read as gone, every mute would answer done having done nothing (review round, accepted
   from the sibling branch). Any other error fails as before: `PartialMute` after some were muted, the error itself before any. The same tolerance
   reaches `muteMicrophone` and `stopCamera` (they share `muteUnmuted`): a microphone or camera gone before its mute is
   now «nothing muted», not an error. Nothing else of theirs changes.
3. **Testable without a server.** `muteSources` takes the room client (as `muteUnmuted` already does) and is exported
   with `SCREEN_SOURCES`; `stopScreen` and `stopCamera` keep their signatures for `routes/rooms.ts`.

Kept apart from item 2 (`api/mute-all-past-a-leaver`, `muteEveryone` / `muteMicrophone`'s `getParticipant`): this
change touches only `isNotFound`, `muteUnmuted`, `muteSources` and the stop functions.

## Tests (unit, `apps/api/src/livekit.test.ts`, a fake room client)

- The sound is muted before the share, whichever order the participant's list has.
- The sound gone after the share's mute (`not_found` on its mute): the stop succeeds, counting the one it muted.
- Any other error on that second mute is still a `PartialMute` of 1; on the first, the error itself.
- The code `not_found` alone is gone; a 404 with no code, or with `bad_route`, still fails; a mute answered with no
  track counts as nothing muted.
