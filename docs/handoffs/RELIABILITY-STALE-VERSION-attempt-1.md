# Handoff: after a deploy, a stale tab says so and hears of the new version

Goal and attempt: RELIABILITY-STALE-VERSION (seam #4, `evaluacion-2026-10-18/experiencia/costuras.md` §4 and «Qué
falta» item 4; the reliability baseline's M9, `evaluacion-2026-10-19/fiabilidad/linea-base.md` §4 row M9), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-1`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-1`, branch `reliability/stale-version` from
`origin/main` `167bb9088`; not pushed
Writable scope: this worktree only (Studio code, its fixtures and checks, the reliability report, `docs/plans`,
`docs/handoffs`); no API; nothing deployed, no remote touched.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1`, and `pw-direct.ps1` while WoW was open
and Aion 2 was not; production builds and a throwaway 127.0.0.1 server driven by `.claude-guards/safe-browser.cjs`).
Existing authority: Luis 2026-10-22, «Procede con tu recomendación, el lote con 1, 2 y 3»; earlier «Lo que no se mide,
no se puede mejorar».
Ending commit: the branch's last commit; code last changed at `dd1fa46b1`. Against `167bb9088`:
`apps/studio/src/features/voice/{part-gone,part-gone.test}.ts`, `StalePart.tsx` (new), `call-end.ts`,
`useProjectRoom.ts`, `RoomDock.tsx`, `DeviceMenu.tsx`, `DeviceCheck.tsx`; `apps/studio/src/app/{version-probe,
version-probe.test}.ts` (new), `new-version-signal{,.test}.ts`, `new-version-early.ts`, `theme.css`;
`apps/studio/build-version.ts` (new), `vite.config.ts`, `vite.app.config.ts`, `tsconfig.json`;
`apps/studio/fixtures/{fake-livekit.ts,app.tsx}`; `apps/studio/e2e/new-version.spec.ts`,
`apps/studio/e2e/reliability/version.spec.ts` (new); `scripts/reliability-report.mjs`, `scripts/lib/reliability.mjs`,
`tests/unit/reliability-report.test.mjs`; `docs/plans/{stale-part-call,version-probe}.md` (new),
`docs/plans/reliability-measure.md`, this record.

## Outcome

- **Seam #4.** After a deploy that touched the room, a tab left open meets a LiveKit part the host no longer has. A
  Join (dock, mini dock, the check's) now says «This tab is on an older version of Sophia, so the call couldn’t load.»
  with Reload, politely (`role=status`), never «Check your connection»; the check's rows say «Needs a reload», never
  «Not allowed» or «site settings», and the check says the line with Reload. Only for the browser's TypeError after
  Vite's `vite:preloadError`; a refused permission, LiveKit's own failure and the API's answer keep their words.
  Nothing reloads by itself; offline lines still win.
- **M9.** The build names its version in its page and serves it as `version.json` (an id from the files it wrote:
  same tree, same id; no chunk renamed by it). The tab asks when it comes back into focus or view (at most once a
  minute) and every ten minutes in view; a different version raises the same «Sophia was updated» notice once, and the
  asking stops. Nothing reloads by itself.
- **M9 is measured** in the reliability report, and leaves «not measurable».

## Evidence

- **Observed first** (stale-part-call.md «Observed first»): the build wraps the room's three LiveKit imports in Vite's
  preload helper; a tab on build 1 with the host on build 2 gets one `vite:preloadError` whose payload is
  «TypeError: Failed to fetch dynamically imported module: …/assets/livekit-room-Ci7Q-Idk.js», and the same TypeError
  rejects the call; a second call fails the same way with no second request (one 404 in all). Same tree twice: every
  chunk name alike. One line in `livekit-room.ts` or in `useProjectRoom.ts` renames the LiveKit chunk (it imports from
  `RoomStage`); one line in the notice or on Home doesn't. 12 of the last 30 merges to main touched
  `features/voice/`. Scripts and outputs: the session's `scratchpad/stale-obs/` (`observe.cjs`,
  `observe-1to2.json`, `real*.files`).
- **Pair A, written first** `399d0ee3a`: units red on the outline («part-gone.ts: not written yet» ×4) and
  `noteRole` («actual: 'alert', expected: 'status'»); browser red (`pw-logs/stale-part-red`): 2 failed, 1 passed;
  the page showed «alert: Couldn’t connect to the room. Check your connection and try again.» and «Microphone: Not
  allowed». Fixed `0c3b6750c`; `dd1fa46b1` restores `new-call.test.ts` («window is not defined» once the room imported
  the page's ear).
- **Pair B, written first** `781c72c5a`: units red («version-probe.ts: not written yet» ×10, «signal.tell is not a
  function»); browser red (`version-probe-red`, `version-probe-red-2`): no notice on focus or back into view; at ten
  minutes no request and no notice; the same version: the page never asked. Fixed `78eb0b0a1`. On production builds:
  two builds, one id (`5f9672781ccbb820`); one line on Home, another (`cfe28f942199015c`); a tab on the first with the
  local host switched, back into focus → the notice 50 ms later, not reloaded (`observe-probe.json`).
- **Pair M9, written first** `bef2129a9`: «does not provide an export named 'summarizeM9'». Fixed `86c22628d`.
- **Green:** A's specs and neighbours at `0c3b6750c` 99/99 (`stale-part-green`: new-version, call-devices,
  device-check, room-dock, dock-header, room); B at `78eb0b0a1` 84/84 (`version-probe-green`: new-version, app-auth,
  signed-in-later, opening); at `dd1fa46b1` 202/203 (`stale-version-neighbours`: new-version, device-check,
  call-devices, camera-flip, room-discussion, room-recap, voice-chat, muted-speech, join, host-controls, call-keys,
  room-people, room-basics, room-return, light-mode, profile-editor, skip-link). The one failure, `join.spec.ts:33`
  «used_up link», found a blank page on load; `join.spec.ts` alone ×3 right after: 27/27 (`stale-version-join-again`).
- **Units:** `apps/studio/src/**` 2149/2151 (the two known Windows path-separator failures: `attention.test.ts`,
  `browser-imports.test.ts`); `tests/unit/reliability-report.test.mjs` 27/27. Whole-repo `oxlint --type-aware`, `tsc
  --noEmit -p apps/studio`, Prettier on every touched non-docs file: clean.
- **The measuring suite** at `dd1fa46b1`: 37/37 (`measure-stale-version-suite`), collected with `node
  scripts/reliability-report.mjs --fixture --out scratchpad/measure-stale-version` (complete, exit 0). M9: focus 3/3
  noticed, 0 reloads, p50 6 ms · p95 13 ms; back into view 3/3, 0, p50 8 ms · p95 8 ms; interval (page clock) 3/3, 0,
  3/3 within 15 min, p50 7.1 min · p95 9.8 min (changes 0, 3 and 7 min after load: 10.1, 7.1 and 3.0 min). The rest
  as R2 left them (M6 6 visible / 10 silent of 16).

## Decisions and changes

- **The copy** (for Luis to approve): «This tab is on an older version of Sophia, so the call couldn’t load.» with
  «Reload» (dock note and the check); «Needs a reload» (a check row with no device named); «Reload this tab to choose
  one» (the in-call menu, unreachable today). Unchanged: «Sophia was updated. Reload to keep going.».
- **Polite, not an alert:** the notice at the top has already said it.
- **The test is the class, not the words:** a `TypeError` while heard. Firefox and Safari word it differently.
- **Ten minutes, one minute:** the interval keeps one request per ten minutes in view; coming back asks at once but at
  most once a minute.
- **The id is in the page, not in a script,** so a redeploy of the same tree renames nothing and breaks no tab.
- **Audio settings** is offered only in a call, where LiveKit is already loaded: the seam's «Audio settings» surface
  is, before a call, the check beside Join, which is what the checks cover.

## Remaining obligations

- **The measure ran through `pw-direct.ps1`** (one worker), then the report collected: `measure.ps1` refused twice
  («not starting while a heavy app is open: Wow»). Same suite, same collection; rerun `measure.ps1` once WoW is closed
  if a guarded run is wanted on record.
- Not observed: Firefox and Safari; a signed-in production Studio press (the observation drove build 1's real helper
  with `RoomStage`'s deps list from the page).
- The interval's times are to the 5 s step and one step late (the route counts the request after the step).

## Next bounded action

- The independent review; push with the next group PR when Luis says; merge on
  green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository, the seams report and the
  baseline.

## After Luis's decision (2026-10-22)

Luis approved the three copy lines and the probe's cadence (every 10 min in view; on focus or view at most once a
minute; never a reload by itself), and asked that Try again be hidden where the part is gone. The plan's «After
Luis's decision» says how.

- **Written first** `0512ba3c9` (new lever `refuse=connect`); red (`pw-logs/stale-retry-red`): «toHaveCount ·
  Expected: 0 · Received: 1» on Try again beside the line; the control (a join that couldn't connect keeps Try again)
  passed before and after. Fixed `3861d3850`: the dock's and the mini dock's Join are hidden while the note is the line;
  only Reload is offered. The check beside Join stays.
- **Merged `origin/main`** at `a66d10381` (#477) in `adc42d3fe`: conflicts in the reliability report, its lib, its
  units and `reliability-measure.md`, resolved by keeping M5 (and M2r) beside M9 (`FIXTURE_METRICS` M1–M9, M5's rows
  and table and M9's rows, both fake-suite levers); «not measurable» now lists only M3/M4's fallback. `a93454619`: the
  fake LiveKit's connect was 61 lines with main's changes; its two refused connects share a helper.
- **Green at `a93454619`** (guarded `pw.ps1`, no game open): new-version, device-check, call-devices, room-dock, room,
  join 94/94 (`stale-retry-green`). Units: `apps/studio/src/**` and `tests/unit/reliability-report.test.mjs`
  2183/2185 (the two known Windows path failures); the report's own 29/29. Whole-repo oxlint, tsc, Prettier: clean.
- The measuring suite was not rerun after the merge (only the report's units, as asked).
