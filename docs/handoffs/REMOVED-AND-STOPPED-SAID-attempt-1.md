# Handoff: a removal mid-call and a screen an admin stopped, said once

Goal and attempt: REMOVED-AND-STOPPED-SAID (`evaluacion-2026-11-16/textos-lote-18.md` items 3 and 5), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `room/removed-and-stopped-said` from
`origin/main` `9495c87fc`; not pushed
Writable scope: this worktree only (Studio code, its fixtures and checks, `docs/plans`, `docs/handoffs`); no API;
nothing deployed, no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's guard, `pw-gentle.ps1`; never `pw-direct`, as
Wow.exe was not running).
Existing authority: Luis 2026-11-16 approved lote 18's lines («aprobados»), in English as written.
Ending commit: the branch's last commit; code last changed at `18ad93714` (review round). Against `9495c87fc`:
`apps/studio/src/features/studio/ProjectShell.tsx`, `project-door.ts` (+ test),
`apps/studio/src/features/voice/livekit-room.ts`, `useProjectRoom.ts`, `call-end.ts` (+ test), `room-view.ts`,
`apps/studio/src/features/personal/PlacesBar.tsx`, `apps/studio/fixtures/room.tsx`, `fake-livekit.ts`,
`apps/studio/e2e/removed-mid-call.spec.ts` and `host-stopped-screen.spec.ts` (new);
`docs/plans/removed-and-stopped-said.md` (new), this record.

## Outcome

- **Removed mid-call (item 3).** When a call in this project was live, reconnecting or trying back in as the door
  closed as `denied`, or the server had just taken the person out of it (the room's note was `removed`'s), the No
  access notice adds «Your call here ended when you were removed from the project.» under its body, as `role=status`,
  never focused. A plain visit, a sign-out (`expired`) and an unreachable project read as before. The room is read as
  the door closes, before the shell's own leave (`callEndedByRemoval`, `useLeaveBehindClosedDoor`).
- **An admin stopped your screen (item 5).** `stopsWhenHostStops` (the server's mute of the local screen share, A31)
  now also tells the room (`onHostStoppedScreen`), which sets the dock's device note to «An admin stopped your screen
  share.», listed in `noteRole`'s polite lines, so the dock says it from its standing `role=status` and the focus stays.
  The person's own Stop sharing and the browser's «Stop sharing» bar unpublish the share (livekit-client 2.22.3
  `handleTrackEnded`), never mute it, so they say nothing. The places bar's copy of the note now takes `noteRole` too
  (it was always `alert`).

## Evidence

- **Read first:** the claims held on `9495c87fc` (`ProjectShell.tsx:84-92` leave behind a closed door, `:1036-1072`
  the notice; `livekit-room.ts:247-257`). Found beyond the source: the API's `removeMember` also removes the person
  from LiveKit, so the call can end as `removed` before the snapshot's 403; the line covers both orders. The room has
  no toast of its own (it lives in `SignedIn`), so item 5 is said in the dock's note, the share's own place.
- **Item 3 written first** `f5ce6ecb1` (`pw-logs/removed-mid-call-red`, run detached at that commit): 2 failed, 1
  passed. «Locator: locator('.page.notice').getByRole('status') Expected: "Your call here ended when you were removed
  from the project." Error: element(s) not found», after the notice's h2 had passed; the plain-visit check passed,
  pinning today's notice. Unit: «does not provide an export named 'REMOVED_MID_CALL'». Fixed `40a554a34`.
- **Item 5 written first** `503f3648d` (`host-stopped-screen-red`): 1 failed, 2 passed. «Locator:
  getByRole('status').filter({ hasText: 'An admin stopped your screen share.' }) Expected: 1 Received: 0» (spec line
  39, after the toggle read «Share your screen» again); the own-stop and browser-bar checks passed, pinning silence.
  Unit: «does not provide an export named 'HOST_STOPPED_SCREEN'». Fixed `4a753558a`.
- **Green** at `4a753558a` (`removed-stopped-green`): removed-mid-call, host-stopped-screen, host-controls,
  dock-header, arrival-since, project-leave and room-dock, 74/74.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on every touched non-docs file: clean.
  `node --test` on `features/voice/*.test.ts` and `features/studio/*.test.ts`: 435/435.

## Review round (no P1; one P2, two P3)

- **P2, written first** `dc382c66d`, fixed `18ad93714`: Leave project in tab B (same browser) took tab A out of the
  call and out of the project, and A's notice said «…when you were removed from the project», untrue. Leave project
  now says so on the existing calls channel (`call-tabs.ts`, `sophia.calls.v2`: `leaving`/`left`) before the API
  call, taking it back on a refusal; `callEndedByRemoval` skips the line for a project this browser left. Check: two
  pages in one context, Leave project in B, then the server's removal and the 403 in A: the plain notice, no line.
- **P3 (a)**, same pair: the host screen line now goes after `REJOINED_FOR_MS` (4 s, «Reconnected.»'s), and any later
  note replaces it; checks for both. **(b)** the spec header and the plan cite livekit-client 2.22.3's lines.
- **Unit red** at `dc382c66d`: 3 failed, «a.calls.left is not a function», «a.calls.leaving is not a function», and
  `callEndedByRemoval` returned true with `left: true`. **Green** at `18ad93714`: voice and studio units 438/438;
  oxlint, tsc, Prettier clean.
- **E2E not run for this round:** the guard refused for about two hours (free RAM 2.2 to 7.7 GB, under its 8 GB
  floor for a gentle run), and once stopped a run that had started (`GUARD: stopping the run: free RAM down to 5.8
  GB`). Wow.exe was not running, so pw-direct was not allowed. Still to run: `removed-mid-call` and
  `host-stopped-screen` detached at `dc382c66d` (expected red: the P2 check and the timed-out host line), then those
  two plus host-controls, dock-header, arrival-since, project-leave, room-dock and room at the branch.

## Remaining

- The plan note's Limits: a call taken out by an admin's «Remove from call» whose note still stands when the person is
  later removed from the project says the line too; the line is the notice's, so a reload shows the plain notice; a
  Leave project from another browser or device isn't heard, so that tab would say the line.
- The review round's e2e runs (above).
- The fixture's LiveKit stands in for `livekit-room.ts`, so the host-mute-to-callback step there is covered by reading
  and types, not by a browser check against a real LiveKit server.
