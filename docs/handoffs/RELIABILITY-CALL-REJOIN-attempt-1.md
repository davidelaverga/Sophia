# Handoff: a dropped call rejoins on its own, once

Goal and attempt: RELIABILITY-CALL-REJOIN (the reliability baseline's gap #9, `evaluacion-2026-10-19/fiabilidad/
linea-base.md` §1.5 and §5 row 9; metric M5), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-7`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-7`, branch `reliability/call-rejoin` from `origin/main`
`9a6b03a73` (R1 #470, R2 #472, group 6 #471 merged); not pushed
Writable scope: this worktree only (Studio code, its fixtures and checks, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` and `.claude-guards/safe-run.ps1`, two
workers).
Existing authority: Luis 2026-10-20, «Procede con el próximo lote y arregla tú los de Davide»; earlier «Lo que no se
mide, no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `826268020`. Against `9a6b03a73`:
`apps/studio/src/features/voice/{call-rejoin.ts,call-rejoin.test.ts}` (new), `call-end.ts`, `call-end.test.ts`,
`useProjectRoom.ts`, `livekit-room.ts`, `RoomDock.tsx`, `MiniDock.tsx`,
`apps/studio/src/features/conversation/discussion-view{,.test}.ts`, `apps/studio/src/features/studio/ProjectShell.tsx`,
`apps/studio/fixtures/{fixture-api.ts,room.tsx,app.tsx}`, `apps/studio/e2e/{room,room-discussion,room-recap,
voice-chat,app-auth}.spec.ts`, `docs/plans/call-rejoin.md`, this record.

## Outcome

- A call LiveKit gives up on (`dropped`) now tries once to get back in with a fresh token, as Try again would: the
  dock says «Connection lost. Rejoining the call…», then «Reconnected.» once (gone after 4 s); a failed try says the
  lost call's words with Try again, as before. Offline, the try waits for `online` once («You’re offline, so the call
  ended here. Back online, you rejoin it automatically.»), then tries once.
- Leave stays beside «Joining…» (dock and header's mini dock) while the try waits or runs, and in the places' bar out
  of sight; every leave stops the try (pressed, another project opened, a shut door, the room unmounting).
- Never after another tab or browser, being taken out, a closed room or a leave; never twice within two minutes; never
  for a call last seen live more than two minutes ago (a page asleep or frozen sees nothing).
- A join overtaken before it connects stops before LiveKit (no flash in the room); LiveKit's `reconnectPolicy` is
  written out (`RECONNECT_DELAYS_MS`, the 2.22.3 defaults).

## Evidence

- Plan: `docs/plans/call-rejoin.md` (`097ba0b70`; «Found while building» added with this record).
- **Pair 1, written first** `153500257`: units against an outline that throws «call-rejoin.ts: not written yet» (21
  checks), `noteRole` of the new lines «actual: 'alert', expected: 'status'», `offlineBarWords` under the waiting line
  (held message: the offline words instead of «Not confirmed: “Once only.”»). Browser (`pw-logs/rejoin-red.txt`,
  `room.spec.ts --grep BASE-03`): 10 failed, 7 passed. The new checks failed on «Expected: "Connection lost. Rejoining
  the call…" Received: "You were disconnected from the room."», «a new connection · Expected: 2 · Received: 1», «one
  try · Expected length: 2 · Received length: 1»; the offline ones on #467's words where the waiting line was
  expected; the two `@phone` ones because no try used the one refused token, so the person's Try again met it.
  Fixed in `fec86d60c`.
- **Pair 2, written first** `60e22ff72` (`app-auth.spec.ts`, from Home): proven red as a control on the fixed tree
  without `ProjectShell`'s line (`pw-logs/rejoin-control-places.txt`): «expect(locator).toBeVisible() failed … element(s)
  not found» (the bar's pill gone) and the bar's Leave click timing out, while the room token count still rose by one.
  Fixed in `826268020`.
- **Green through the guard:** `room.spec.ts` 21/21 (`rejoin-green-room`); `room-discussion`, `room-recap`,
  `voice-chat`, `muted-speech`, `room-dock`, `join`, `host-controls`, `dock-header`, `app-auth`, `call-keys`,
  `call-devices`, `room-people`, `room-basics`, `room-return` 210/210 (`rejoin-green-neighbours`); `app-auth` with
  the new checks and `signed-in-later` 60/60 (`rejoin-green-app`); the twelve new and offline checks
  (`room.spec.ts`, `app-auth.spec.ts`) repeated four times at `826268020`, 48/48 (`rejoin-repeat`).
- Units: `node --test` over `features/voice`, `features/conversation`, `personal/notice-view` and `app/one-call`:
  429/429 (`call-rejoin.test.ts` 21/21). Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio`, Prettier on
  every touched non-docs file: clean.

## Decisions and changes

- **The copy** (for Luis to approve): «Connection lost. Rejoining the call…» · «You’re offline, so the call ended
  here. Back online, you rejoin it automatically.» · «Reconnected.». Unchanged and reused: «You were disconnected from
  the room.», #467's «You’re offline, so the call ended here. Join again once you’re back.» (offline when no try waits)
  and «You’re back online. Try again rejoins the call.».
- **The two-minute window** (`REJOIN_WINDOW_MS`) is my choice: it covers LiveKit's own ~44–52 s of tries with room to
  spare, and keeps a woken laptop out of an old call. The same window spaces two tries, which is how «never twice for
  one drop» and a flapping network are both held.
- **The places' bar keeps the call during the try** (`useReportCall` reports `rejoining` as on). Without it, a drop out
  of sight unmounted the project and cancelled the try, with a toast that would soon be untrue.
- **Leave during the try opens no recap**: the drop ended the call; the press only declines the way back.
- **Checks that test the lost call's own state** (its words in the foot and panels, Chat with Sophia after it, a held
  message, no recap, captions and the mode's hello after Try again, #467's lines) now make the one try fail first with
  `failToken()`; their assertions are unchanged. The offline checks now expect the waiting line and the rejoin, and
  reach #467's back-online line through a failed try.
- **Fixture levers:** `window.fixture.holdToken(on)` (room tokens wait until let go) and `window.appFixture.drop()`.

## Remaining obligations

- Not observed with a real LiveKit server: the baseline's `room-media` check that cuts the container's network (M5's
  second half) is not built.
- Limits in the plan: `CLIENT_INITIATED` (pagehide, freeze) reads as `dropped`, so a frozen tab woken within two
  minutes rejoins; the camera comes back off; out of sight the bar says nothing of the try.
- M5 can now be measured in the fixture (drop → live without a press); `scripts/reliability-report.mjs` has no
  scenario for it yet.

## Next bounded action

- Luis: approve or change the three lines; say when to push (with the next group PR); merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the baseline.
