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
Ending commit: the branch's last commit; code last changed at `24b1024a7` (after the fourth review). Against `9a6b03a73`:
`apps/studio/src/features/voice/{call-rejoin,call-tabs,mic-while-connected}{,.test}.ts` (new), `call-fence{,.test}.ts`, `call-end.ts`, `call-end.test.ts`,
`useProjectRoom.ts`, `livekit-room.ts`, `RoomDock.tsx`, `MiniDock.tsx`,
`apps/studio/src/features/conversation/discussion-view{,.test}.ts`, `apps/studio/src/features/studio/ProjectShell.tsx`,
`apps/studio/fixtures/{fixture-api.ts,room.tsx,app.tsx,fake-livekit.ts}`, `apps/studio/e2e/{room,room-discussion,room-recap,
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
- Limits in the plan: another device isn't seen before a try (needs the API's presence: a follow-up for Davide's
  lane, «list the room's participants before a try back in»); a black-holed network reaching `dropped` past two
  minutes makes no try (fails safe); a heavily throttled hidden tab stops counting as seen; Try again's tip still says
  the device's microphone choice; the camera comes back off; out of sight the bar says nothing of the try.
- M5 can now be measured in the fixture (drop → live without a press); `scripts/reliability-report.mjs` has no
  scenario for it yet.

## Next bounded action

- Luis approved the three lines and the window (2026-10-20). Next: the review's second look at `11d3c1bd5`; push with
  the next group PR when Luis says; merge on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and the baseline.

## After the independent review (2026-10-20: one P1, two P2s, P3s)

Each point was checked against the code, written first, proven red, then fixed; the plan's «After the independent
review» says how. Runs: `pw-direct.ps1` (Luis allowed it while he plays; one worker, below normal), logs in the
session's `pw-logs/`.

- **P1, a microphone off came back on.** Written first `f199e9714` (new lever `fixture.mutedByHost()`); red
  (`review-red-p1`): both checks «expect(locator).toHaveAttribute(expected) failed · Expected: "false" · Received:
  "true"». Fixed `671770b87`: the connection keeps the microphone as it was while last connected (`micWas`), and a
  `dropped` end makes it the next join's choice (`stand`), for the try and Try again.
- **P2, late connection and a page LiveKit left.** Written first `fe560c0c7`; units red on «actual: 'now', expected:
  null» (CLIENT_INITIATED) and «the try hands its join a gate · actual: undefined»; browser red (`review-red-p2`):
  both checks never reached «You were disconnected from the room.» (the try had rejoined). Fixed `efe0799d8`:
  `selfLeft` from `onEnded`, and the gate `still` that `openRoom` asks right before LiveKit (try ≤ 30 s, call inside
  the window, no Leave since).
- **P2, another tab of this browser.** Written first `54c2bafdd`; units red («'now' !== null», «1 !== 0», «true !==
  false»); browser red (`review-red-tabs`): the first page rejoined while the second held the call. Fixed `0b2ad5171`:
  `call-tabs.ts` (a BroadcastChannel), asked by the plan, the gate and the offline wait. Other devices: not built, see
  Remaining obligations.
- **P3s.** Written first `5be15712c`; units red («the page didn’t run in between · 11001 !== 1000», «Error: the join
  threw»); browser red (`review-red-p3`): «Expected: "You’re offline. Join once you’re back." Received: "You’re
  offline, so the call ended here. Join again once you’re back."» and «toBeFocused() failed · Received: inactive»; the
  hello and the held-message checks passed before and after. Fixed `11d3c1bd5`. The fixture's `holdToken(true)`
  twice no longer drops held answers (in the test commit).
- **Green at `11d3c1bd5`:** `room.spec.ts` 28/28 (`review-green-room`); room-discussion, room-recap, voice-chat,
  muted-speech, room-dock, join, host-controls, dock-header, app-auth, call-keys, call-devices, room-people,
  room-basics, room-return and signed-in-later 220/220 (`review-green-calls`). Units over `features/voice`:
  315/315 (`call-rejoin.test.ts` 29/29). Whole-repo oxlint, tsc, Prettier: clean.
- Plan: `02c1476f2` (written while the worktree was briefly detached by an interrupted run, then cherry-picked
  onto the branch; the detached copy `da0ce5100` is unreferenced).

## After the second review (2026-10-20: one P1, one P2, P3s)

Same rules; runs through `pw-direct.ps1` while Luis played WoW, none while Aion 2 was open (the runs waited for it to
close). The plan's «After the second review» says how each point was closed.

- **P1, a microphone muted during «Reconnecting…» came back on.** Written first `35e325371` (the rule moved, unchanged,
  into `mic-while-connected.ts`; the fixture keeps the microphone as strictly as that rule); units red «actual: true,
  expected: false» (a mute in Reconnecting; Reconnected not read again); browser red (`review2-red-p1`): «Expected:
  "false" Received: "true"». Fixed `07444167f`: `micWas() && micOnJoin()` at the drop, and the rule hears mutes in any
  state but disconnected and reads again on `Reconnected`.
- **P2, a try left with Leave wrote the old microphone back.** Written first `2dc3186d5`; browser red
  (`review2-red-p2`): «Expected: "false" Received: "true"». Fixed `4bfde864a`: only the current join writes the next
  join's choices.
- **P3s.** Written first `83d9c7bcf` (this commit doesn't type-check until the fix: the checks ask for the new shapes);
  units red: «does not provide an export named 'callTabs'», «rejoin.scoped is not a function», «does not provide an
  export named 'keptIfStill'»; browser red (`review2-red-p3`): «toBeFocused() failed · Received: inactive». Fixed
  `0281cf271`: scoped claims (`scopeOf`, the token's subject), `joining` claims, `keptIfStill` after connecting, a clock
  set back is stale, focus to Try again after a failed try, `call-tabs.ts` as a factory with 7 unit checks.
- **Found in the green run:** the round-2 fixture model missed an admin's mute, so «muted by an admin, Try again keeps
  the microphone off» failed for the fixture (`review2-green-room`: 30 passed, that 1 failed); fixed in the fixture
  alone, `5874795e6`.
- **Green:** `room.spec.ts` 31/31 at `5874795e6` (`review2-green-room-2`); the call specs (room-discussion,
  room-recap, voice-chat, muted-speech, room-dock, join, host-controls, dock-header, app-auth, call-keys,
  call-devices, room-people, room-basics, room-return, signed-in-later) 220/220 at `5aeb4e272`, before the fixture-only
  fix (`review2-green-calls`). Units: 443/443 over `features/voice` and `features/conversation` (`call-rejoin` 32,
  `call-tabs` 7, `call-fence` 6, `mic-while-connected` 5). Whole-repo oxlint, tsc, Prettier: clean.
- Plan: `5aeb4e272`. Not built, recorded: a crashed tab's stale claim (the try waits for the person).

## After the third review (2026-10-20: one P1, P3s)

Neither game was open, so the runs went through the guarded `pw.ps1`. The plan's «After the third review» says how.

- **P1, the microphone's cap was read once, at the drop.** Written first `ee10c79e0`; browser red (`review3-red-p1`):
  both checks «Expected: "false" Received: "true"» (off chosen during the offline wait; off chosen before Try again).
  Fixed `3e3a61153`: the drop keeps the call's microphone marked `capped`, and each join reads this device's choice
  as it begins.
- **P3s.** Written first `3d7333280` (the fixture now reports a leave's disconnect as LiveKit does, holds LiveKit's
  connect, and resets its link at each connection and drop; `keptIfStill`'s third argument doesn't type-check until
  the fix); units red: the quiet-before-leave order, «'now' !== null» for a call seen live in the future, the stuck
  `joining` claim; browser red (`review3-red-p3`): «Expected: "You were disconnected from the room." Received:
  "Couldn’t connect to the room. Check your connection and try again."» (the quiet leave's end taken for the call's).
  Fixed `9caf36cce`.
- **Green at `6c190af17` (code `9caf36cce`):** `room.spec.ts` 34/34 (`review3-green-room`); the call specs 220/220
  (`review3-green-calls`). Units 446/446 over `features/voice` and `features/conversation`. Whole-repo oxlint, tsc,
  Prettier: clean.
- Plan: `6c190af17`. Documented only: the channel's v1→v2 change (a tab opened before the deploy isn't heard until it
  reloads); what the check after connecting can't spare (DUPLICATE_IDENTITY).
- `origin/main` has moved on since the branch began (the worktree reads 252 commits behind): a rebase or merge is for
  the group PR, not done here.

## After the fourth review (2026-10-20: no P1, no P2; three P3s)

- **Every carried microphone capped as its join begins.** Written first `5f9770d66`; browser red (`review4-red`,
  `device-check.spec.ts`): «Expected: "false" Received: "true"». Fixed `f3499d539` (`capped` removed; the cut applies to
  every carried microphone).
- **Unit checks for the open and the cut.** `24b1024a7`: `call-open.ts` (moved unchanged) with 7 checks; mutant runs
  (local, not committed): no quiet guard → «a try no longer wanted once connected is left quietly …» fails; no cut →
  «a carried microphone is never on unless …» and «reads the choice as the join begins …» fail.
- **The «left quietly» check** reads `asked` from after the drop (in `5f9770d66`).
- **Green at `24b1024a7`** (guarded `pw.ps1`; no game open): `room.spec.ts` + `device-check.spec.ts` 45/45
  (`review4-green-room`); the call specs 219/220 (`review4-green-calls`): the one failure was
  `app-auth.spec.ts:808`, «page.goto: net::ERR_NO_BUFFER_SPACE» on the fixture's favicon (the machine out of socket
  buffers, nothing of this branch's); `app-auth.spec.ts` alone right after: 53/53 (`review4-green-app-again`). Units
  453/453 over `features/voice` and `features/conversation`. Whole-repo oxlint, tsc, Prettier: clean.

## After Codex's P2 on #475 (2026-10-20: a call that froze once was never seen live again)

Source: `seguimientos-p2.md`, last entry. Worktree `D:\Descargas\SophiaV4\Sophia-paper-1`, branch
`reliability/rejoin-liveness` from `origin/main` `a8a66d260` (#475 merged); not pushed. The plan's «After Codex's P2
on #475» says how.

- **Real, as read.** `stillSeen` compared every beat with the same old «seen», so after one gap over 10 s no later beat
  moved it: two minutes on, that call's drop never tried again, however long it ran in the foreground.
- **Checked first:** LiveKit's pong timeout, which decides how fast a woken page finds a dead link, is the server's
  `pingTimeout`: 15 s, pings every 5 s, read from the join response of `livekit-server` v1.13.7 `--dev` (a throwaway
  container on `127.0.0.1:17880`, stopped after; the repo sets neither). livekit-client 2.22.3 resets that timer on
  each pong, so after a longer gap it is past due and fires as the page wakes.
- **Written first** `158e4c6e7`; red: «a page that froze once counts as live again once it runs steadily · actual: 0,
  expected: 1». Its partner, «never for a laptop that woke into a dead link» (an hour asleep, beats for 25 s, then
  «Reconnecting…» and the drop 50 s on), passes before and after: it guards the earlier reviews' rule.
- **Fixed** `ad020bca6`: each beat is compared with the beat before (`Liveness`: seen, last beat, when the run began);
  a gap (over two beats, or a clock set back) leaves «seen» and starts a run; after 30 s of beats on time
  (`STEADY_MS`, twice the pong timeout) each beat is «seen» again; going live is seen at once, as before. The pure
  check of `stillSeen` took the new shape in the same commit (its cases kept, plus the run, its renewal at 30 s, a
  gap inside the run, a clock set back).
- **Mutants (local, not committed):** «previous beat only» (every beat on time renews) fails the laptop check, «never
  for a page that slept past the window» and the run check («actual: 1, expected: 0»; «actual: 65000, expected: 0»);
  `STEADY_MS` 20 s fails the laptop check and the pin.
- No browser check: the fixture has no clock, and a run of beats past the two-minute window takes minutes of real time.
- **Green at `ad020bca6`** (guarded `pw.ps1`, after waiting for Blender to close): `room.spec.ts` + `room-dock.spec.ts`
  50/50 (`liveness-green-room`). Units: `call-rejoin.test.ts` 37/37; `features/voice` 345/345. Whole-repo oxlint,
  tsc, Prettier on the two touched files: clean.
