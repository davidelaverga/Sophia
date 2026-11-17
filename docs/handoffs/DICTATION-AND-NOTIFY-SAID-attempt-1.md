# Implementation-session handoff

Goal and attempt: DICTATION-AND-NOTIFY-SAID (`evaluacion-2026-11-16/textos-lote-18.md`, seams 4 and 6: Personal's
dictation stops in silence, and notifications blocked after asking say nothing; Luis 2026-11-16 approved the lines),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-6`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-6`, branch `personal/dictation-and-notify-said` from
`origin/main` `9495c87fc` (everything through #513 merged; not pushed)
Writable scope: this worktree only (`apps/studio/src/features/personal`, `apps/studio/src/features/access`,
`apps/studio/fixtures/personal.tsx`, `apps/studio/e2e`, `docs/plans`, `docs/handoffs`); no API or contract change.
Runtime unit: Luis's Windows host (Playwright through the session's guard); CI as the run on record.
Existing authority: Luis, the approval above; local only, nothing pushed.
Ending commit/tree: `ee9850edd`; the next commit adds only this record. Files changed against `9495c87fc`:
`dictation.ts`, `dictation-view.ts` (new), `dictation-view.test.ts` (new), `PersonalComposer.tsx`, `LobbyPanel.tsx`,
`fixtures/personal.tsx`, `e2e/personal.spec.ts`, `e2e/knock-alert.spec.ts`, `docs/plans/dictation-and-notify-said.md`,
and this record.

## Outcome

- **4 · Dictation says why it stopped.** On a recognition `error`, the composer's line above the bar (`Over`, polite
  `role="status"`) says: `not-allowed` / `service-not-allowed` → «Sophia can’t hear you: the microphone is blocked for
  this site.»; `no-speech` → «Didn’t catch anything. Try again.»; `network` → «Dictation needs a connection.». Any other
  code says nothing, as before. The first error of an attempt decides (the `aborted` our own `abort()` brings can't
  replace it); the line goes with the next attempt or the next word written; offline still wins. The mapping is the
  pure `dictationTrouble` (`dictation-view.ts`); the hook hands it as `said`, with `quiet()`.
- **6 · Blocked notifications are said.** After «Notify me when someone knocks», a `denied` answer replaces the offer
  with «Notifications are blocked in this browser, so knocks show only here.» (`.lobby-note`, `role="status"`).
  Granted or dismissed (`default`): nothing, as before.

## Evidence

- **4, unit, written first and failing** (at `3e06455af`): `dictation-view.test.ts` failed to load,
  `ERR_MODULE_NOT_FOUND ... dictation-view.ts`. Green after the fix: 4/4; `features/personal` and `features/access`
  unit files 230/230.
- **4, e2e, written first and failing** (`pw-logs/p6-dict-red.txt`, guard, detached at `3e06455af`): the four codes'
  cases fail at `expect(locator).toHaveText(...)`, `Expected: "Sophia can’t hear you: …"` (and each other line),
  `element(s) not found`; «goes with the next attempt» fails at `toBeVisible`, `element(s) not found`. «An error with
  no reason to give says nothing» passes, as it should on main (5 failed, 1 passed).
- **6, e2e, written first and failing** (`pw-logs/p6-knock-red.txt`, guard, detached at `12c7b9fcc`): «notifications
  blocked at the prompt» fails at `toHaveText`, `Expected: "Notifications are blocked in this browser, so knocks show
  only here."`, `element(s) not found`. The guard stopped that run for memory before the second new case ran; a rerun
  of the door's cases was refused for memory for over an hour (free RAM 4–7.9 GB against the 8 GB floor).
- **Green e2e: not run.** See remaining.
- Whole-repo `oxlint --type-aware` (exit 0), `tsc --noEmit -p apps/studio` (exit 0), Prettier on every touched file.

## Decisions and changes

- **Verified against the code first.** Both seams were open on main as described: `listenOnce` aborted on error and
  ended with nothing heard (`dictation.ts:77`), and `NotifyOffer` voided the permission answer (`LobbyPanel.tsx:178`).
- **«Already denied when pressed»**: the offer only shows while the permission is `default` when the door opens, so
  this is a block made after that (site settings); `requestPermission()` then answers `denied` at once and the same
  line shows. Its e2e case blocks the stand-in between load and press.
- The answer is read through `Promise.resolve(...)`, so an old callback-form `requestPermission` says nothing instead
  of throwing.
- `knock-alert.spec.ts`'s `standIns` takes an options interface (`Stand`) so it stays under the 60-line function limit.

## Remaining obligations

- **Run the e2e green through the guard** once memory allows: `knock-alert.spec.ts` and `decision-alert.spec.ts` in
  full, and `personal.spec.ts` (at least `-Grep "seams|Talk instead|dictation|offline|limit|less motion"`), on
  `personal/dictation-and-notify-said`; and the knock red rerun at `12c7b9fcc` (`-Grep "offer|blocked|dismissed"`) for
  the second new case.
- Home's «Speak instead» (`Welcome.tsx`) uses the same hook and gets `said`, but shows nothing yet: Home's line has no
  quiet status of its own. A follow-up if wanted.
- CI is the run on record.
