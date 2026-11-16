# «Mute everyone» carries on past someone who left

> 2026-11-16 · item 2 of the API follow-ups draft (`evaluacion-2026-11-08/issue-api-followups.md`, from a Codex P2 on
> #369). Luis chose to fix these points ourselves instead of publishing the issue. API only, no Studio, no copy.

## What was read (at `9495c87fc`)

- **The loop stops at the first leaver.** `muteEveryone` (`apps/api/src/livekit.ts:254-266`) lists the room once
  (`roomParticipants`), then calls `muteMicrophone` for each person in turn. `muteMicrophone` (`:229-233`) first asks
  `rooms.getParticipant(roomId, identity)`. Someone who left after the list makes that reject, the `catch` at `:262`
  turns it into `PartialMute` when someone was muted before them (or rethrows it when no one was), and everyone after
  them keeps a live microphone. The draft's claim holds as written.
- **How the SDK says «not found».** `livekit-server-sdk` 2.19.1 (`src/TwirpRPC.ts`): any non-2xx answer becomes a
  `ServerError` (exported; `TwirpError` is its deprecated alias) carrying the HTTP `status` and the Twirp `code` from
  the JSON body. The LiveKit server answers a participant or a room that isn't there with Twirp `not_found` (HTTP 404),
  which is also what `host-mute-all.db.test.ts`'s room server answers. A 404 is not enough on its own: Twirp's
  `bad_route` (a wrong path) is a 404 too, and that is a failure, not a leaver. So the match is
  `err instanceof ServerError && err.code === 'not_found'`.
- **The same read serves the single acts.** `muteSources` (`:238-242`, A31's `stopCamera` and `stopScreen`) asks
  `getParticipant` the same way. The routes (`apps/api/src/routes/rooms.ts:156-172`, `:223-256`) check
  `memberInRoom` first, so someone who leaves between that check and the act reaches the same rejection.
  - A `ServerError` is not a `DomainError` and has no `statusCode`, so `handleError` (`app.ts:574-587`) answers
    **503 unavailable** today: the host is told the server failed though nothing did.
  - `false` answers **204** and records nothing (`recordedIfDone`, `routes/host-acts.ts`): the act's «already off»
    path. 204 is in the contract for all four routes (`openapi.json`, A24/A31), so the answers stay inside it.

## What changes

- **Stacked on `api/stop-screen-sound-first`** (item 3), which added `isNotFound` and a `muteSources(rooms, …)`.
- **`livekit.ts`:** one helper reads a person's published tracks; a `not_found` from the room server (`isNotFound`,
  narrowed to the Twirp code, for the 404 reason above) reads as no tracks. `muteMicrophone` and `muteSources` use it. Nothing else changes:
  - A single mute or stop of someone who just left answers `false`: 204, nothing recorded, as for a microphone already
    off.
  - `muteEveryone` gets `false` for the leaver and carries on: the people after them are muted and counted. When it
    finishes, the whole act is recorded (`room.host_muted_all`), which is true: everyone still in the call is muted.
  - Any other error stops the batch as today: `PartialMute` with the people muted so far, or the error itself when no
    one was.

## Checks, written first

- `livekit.test.ts` (unit), against a room server over HTTP whose answers the test sets, so the SDK's own
  `ServerError` is what the code sees:
  - three people listed, the second gone by their turn: the first and the third are muted, the count is 2, no
    `PartialMute`.
  - the second's read fails otherwise (`internal`, 500): `PartialMute` with the first alone, the third never asked.
  - a 404 that isn't `not_found` (`bad_route`) still fails.
  - a single mute, camera stop or screen stop of someone gone answers `false`.
- `host-mute-all.db.test.ts` (CI's `pnpm test:db`): a member who left after the list: 204, the rest muted, the whole
  act recorded once.
- a new `host-leaver.livekit.test.ts`, added to CI's `pnpm test:livekit` (the pinned server image): a mute and both
  stops of someone not in an open room answer `false`. That pins the real server's answer, not the fake's.
- `host-mute-all.db.test.ts` also: a single mute, camera stop or screen stop of a member who left after the route's
  check answers 204 and records nothing (today 503).

## Limits

- Someone who leaves between `getParticipant` and `mutePublishedTrack` still fails the act. That is the «track
  already gone» case, item 3 of the same draft, on another branch; this one leaves `muteUnmuted` as it is.
- The LiveKit server's `not_found` is checked in CI (`test:livekit`), not on this machine: Docker isn't running here.
- A room that no longer exists at all is not pinned against the real server: whether its `GetParticipant` answers
  `not_found` or another code wasn't verified. If it answers otherwise, the act fails as it does today.
