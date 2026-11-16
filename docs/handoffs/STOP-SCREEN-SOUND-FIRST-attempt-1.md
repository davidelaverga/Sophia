# Handoff: stop screen mutes its sound first

Goal and attempt: STOP-SCREEN-SOUND-FIRST (item 3 of the API follow-ups draft,
`evaluacion-2026-11-08/issue-api-followups.md`, Codex P2 on #369; Luis 2026-11-16 chose to fix the draft's points
ourselves instead of publishing the issue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-3`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-3`, branch `api/stop-screen-sound-first` from
`origin/main` `9495c87fc` (through #513; not pushed)
Writable scope: `apps/api/src/livekit.ts` and its test, `docs/plans`, `docs/handoffs`; no route, contract, SQL or copy.
Runtime unit: Luis's Windows host (unit tests only; no Playwright needed); CI as the run on record.
Existing authority: Luis, as above; local only, nothing pushed.
Ending commit/tree: `11585e8a3`, the last commit that changes code; the next one adds only this record. Files changed
against `9495c87fc`: `apps/api/src/livekit.ts`, `apps/api/src/livekit.test.ts`, `docs/plans/stop-screen-sound-first.md`,
and this record.

## Outcome

- **The sound before the share.** `muteSources` orders tracks by the sources it is given; `SCREEN_SOURCES` is
  `[SCREEN_SHARE_AUDIO, SCREEN_SHARE]`. The Studio stops sharing (and unpublishes the sound) when its share is muted
  (`apps/studio/src/features/voice/livekit-room.ts:252`), and ignores a muted sound alone.
- **A track already gone is done.** `isNotFound` (a `ServerError` with code `not_found` or status 404; a small helper
  near the top of `livekit.ts`) makes `muteUnmuted` skip that track: not counted, not a failure. Other errors unchanged.
  Microphone and camera mutes share it.
- **Seam.** `muteSources` takes the room client and is exported; `stopCamera` / `stopScreen` keep their signatures.

## Evidence

- **Checked against the code.** `livekit-server-sdk` 2.19.1 throws `ServerError(status, code)` for a 4xx. The pinned
  `livekit-server:v1.13.7` answers a mute of an unpublished sid with no error and no track, and a participant or room
  gone with psrpc `NotFound` → Twirp `not_found`, 404. So the draft's partial failure needs a `not_found` answer (the
  person left in between, or a server that refuses an unknown track); the reorder holds either way.
- **Written first and failing** (`0f5789d59`, `node --test apps/api/src/livekit.test.ts`, 3 of 7 failing): listed share
  then sound → `PartialMute` whose cause is the sound's `not_found`; a sound already gone → the raw `not_found`; a 500
  on the sound → `PartialMute` (muted 1) instead of the error itself, since the share went first.
- **Fix `11585e8a3`**: `livekit.test.ts` + `routes/host-acts.test.ts` 18/18; whole-repo oxlint exit 0; `tsc` api and
  studio exit 0; Prettier clean.

## Remaining

- Item 2 (`api/mute-all-past-a-leaver`, `Sophia-paper-2`) changes `muteEveryone` / `muteMicrophone` in the same file;
  this branch leaves both untouched, so they should merge cleanly. If that branch adds its own not-found check, it can
  reuse `isNotFound`.
