# Handoff: mute everyone past a leaver

Goal and attempt: MUTE-ALL-PAST-A-LEAVER (item 2 of the API follow-ups draft,
`evaluacion-2026-11-08/issue-api-followups.md`, from a Codex P2 on #369; Luis 2026-11-16 chose to fix these points
ourselves instead of publishing the issue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `api/mute-all-past-a-leaver` from
`origin/main` `9495c87fc` (through #513; not pushed). **Stacked on `api/stop-screen-sound-first`** (item 3, worktree
`Sophia-paper-3`) at its final `1f699cdff`, at the coordinator's request: it reuses that branch's `isNotFound` (the
Twirp code alone, the rule this branch's `bad_route` test asks for) and `muteSources(rooms, …)`.
Writable scope: this worktree only (`apps/api/src/livekit.ts` and tests, `scripts/livekit-test.ts`, `docs/plans`,
`docs/handoffs`); no SQL, no contract, no copy, nothing of #514–#519.
Runtime unit: Luis's Windows host (unit tests); CI as the run on record (`pnpm test:db`, `pnpm test:livekit`).
Existing authority: Luis, the quote above; local only, nothing pushed.
Ending commit/tree: `2b5aa67ca`, the last commit that changes code; the next one adds only this record. Files changed
against the base `1f699cdff`: `apps/api/src/livekit.ts`, `apps/api/src/livekit.test.ts`, `apps/api/src/host-mute-all.db.test.ts`,
`apps/api/src/host-leaver.livekit.test.ts` (new), `scripts/livekit-test.ts`, `docs/plans/mute-all-past-a-leaver.md`,
and this record.

## Outcome

- **The room server's `not_found` reads as nothing to mute.** One helper, `publishedTracks`, asks for someone's tracks;
  item 3's `isNotFound` (`livekit-server-sdk`'s `ServerError` with Twirp code `not_found`) answers `[]`.
  `muteMicrophone` and `muteSources` use it.
- **Mute everyone** carries on past someone who left after the list: the rest are muted and counted, and the whole act
  is recorded. Any other failure stops it as before (`PartialMute` with those muted so far).
- **A single mute, camera stop or screen stop** of someone who left after the route's check answers 204 and records
  nothing (was 503 `unavailable`: a `ServerError` isn't a `DomainError`, so `handleError` gave its fallback). 204 is
  in the contract for all four routes. Gone just before the route's `memberInRoom` check, the same leaver gets 422
  «They aren’t a member in the call» instead; both are in the contract, and the Studio's row is gone either way.

## Evidence

- **Written first and failing** (`fd92e760f`), `node --test apps/api/src/livekit.test.ts`, 5 pass, 2 fail:
  - «mute everyone carries on past them»: `PartialMute: The room server failed after muting some of them`, `muted: 1`,
    cause `Not Found: participant not found` (`status: 404, code: 'not_found'`) from `getParticipant`.
  - «a single mute … of someone gone»: rejected with `Not Found: participant not found` instead of `false`.
  - The two guards («any other failure still stops it», «a 404 that is not not found») pass before and after, as
    they should; control mutants prove they bite: matching `status === 404` fails the `bad_route` test, swallowing
    every error fails both.
- **Fix `615fa94e6`**: `livekit.test.ts` 7/7. Whole-repo `oxlint --type-aware` exit 0; `tsc --noEmit` for `apps/api`
  and `apps/studio` exit 0; Prettier clean on every non-docs file touched.
- **Not run here** (CI runs them): `host-mute-all.db.test.ts`'s two new cases (needs PostgreSQL) and
  `host-leaver.livekit.test.ts` (needs the LiveKit image; Docker isn't running on this host; it skips locally).

## Decisions and changes

- **The unit tests use a room server over HTTP**, not an injected client: `muteEveryone` builds its own
  `RoomServiceClient`, and this way the code sees the SDK's real `ServerError`. Same pattern as `host-mute-all.db.test.ts`.
- **A real-server check** (`host-leaver.livekit.test.ts`, added to `scripts/livekit-test.ts`): a mute and both stops of
  someone not in an open room answer `false`. It pins that the pinned server says `not_found`, not just the fakes.
- **`host-mute-all.db.test.ts`'s `events()` now reads every `room.host_%` type**, so the single-act case also sees a
  camera or screen record if one were written.

## Remaining obligations

- Someone who leaves between `getParticipant` and `mutePublishedTrack` is item 3's «track already gone» case, handled
  on the base branch (`muteIfThere`).
- A deleted room (the call ended) most likely answers `not_found` too: a single act 204, mute everyone 0, as
  `roomParticipants` reads a missing room as empty. Unverified on the real server.
- `host-leaver.livekit.test.ts` pins «a participant the room never had», not «joined, then left»; an rtc-node
  join-and-disconnect case would cover that later.
- Not pushed; CI is the run on record.
