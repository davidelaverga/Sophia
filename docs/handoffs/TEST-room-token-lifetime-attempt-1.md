# Implementation-session handoff: the room-token lifetime test, attempt 1

- **Goal and attempt:** make `apps/api/src/rooms.db.test.ts` › "grant exactly this project room, as the verified actor, for ten minutes" stop failing at random. First attempt; not a pack goal. Asked by Luis on 2026-10-01 after the test failed in CI on #35.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `test/room-token-lifetime` from main `860a01a`, 2026-10-01; first commit `80bc5b6`.
- **End:** the PR's head when merged (#36); this file arrives in its last commit. Changed: `apps/api/src/rooms.db.test.ts` and this file.
- **Writable scope:** this repository. **No hosted service was changed.**

## Outcome

- The test asserted `exp - nbf === 600`. livekit-server-sdk 2.19.1 sets `exp` (`setExpirationTime('600s')`) and then `nbf` (`setNotBefore(new Date())`) from two reads of the clock in `AccessToken.toJwt()`, so when a second turns between them the lifetime reads 599 s. It failed once in CI on #35's push run (`actual: 599, expected: 600`) while the pull_request run of the same commit passed.
- The test now accepts 600 or 599 s from the token, with a comment saying why, and pins what the API asks of the SDK to exactly 600 s (`ROOM_TOKEN_TTL_SECONDS`), so a 599 s setting fails too (Codex's review). What else it checks (this room, this actor, the publish grants) is unchanged.
- Only the test changes; the token the API issues is the same.

Missing or unverified:
- Nothing here can reproduce the second turning on demand: the 599 s case is covered by reading the SDK's code and by the CI run that hit it.

## Evidence

- `SOPHIA_DISPOSABLE_DATABASE_URL=… node scripts/with-postgres.ts node --test apps/api/src/rooms.db.test.ts`: 5 pass.
- `pnpm lint`, `pnpm format:check` and the API's typecheck: clean.
- Positive controls: with `ROOM_TOKEN_TTL_SECONDS` set to 660 in `apps/api/src/livekit.ts` the test fails ("a room token lives 660 s"), and set to 599 it fails on the pinned 600 s (the file was restored after each).
- The CI failure it answers: #35, run `36845108450`, job "SQL, persistence and API on PostgreSQL 16" (re-run, then passed).

## Decisions and changes

- A tolerance of one second, not a mocked clock: the token is issued through the API over HTTP, and the two clock reads are inside the SDK.
- No other test measures a token's lifetime (searched for `nbf` and `ROOM_TOKEN_TTL_SECONDS` in every test).

## Remaining obligations

None: no hosted change, no data, no job left running.

## Next bounded action

- Review and merge #36. If livekit-server-sdk ever sets both claims from one clock read, the tolerance can go.
