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
Ending commit/tree: `410800e4b` (the review round's last fix); the next commit changes only the notes and this record. Files changed against `9495c87fc`:
`dictation.ts`, `dictation-view.ts` (new), `dictation-view.test.ts` (new), `PersonalComposer.tsx`, `LobbyPanel.tsx`,
`fixtures/personal.tsx`, `e2e/personal.spec.ts`, `e2e/knock-alert.spec.ts`, `app/theme.css`,
`docs/plans/dictation-and-notify-said.md`, `docs/plans/knock-alert.md`, and this record.

## Outcome

- **4 · Dictation says why it stopped.** On a recognition `error`, the composer's line above the bar (`Over`, polite
  `role="status"`) says: `not-allowed` → «Sophia can’t hear you: the microphone is blocked for this site.»;
  `audio-capture` → «Sophia can’t hear you: the microphone isn’t available.»; `no-speech` → «Didn’t catch anything.
  Try again.». Any other code says nothing, as before, `service-not-allowed` and `network` included. The first error
  of an attempt decides (the `aborted` our own `abort()` brings can't replace it); words heard before it land and
  keep «From your voice · edit it or send»; the line goes with the next attempt or the next word written; offline
  still wins. The mapping is the
  pure `dictationTrouble` (`dictation-view.ts`); the hook hands it as `said`, with `quiet()`.
- **6 · Blocked notifications are said.** After «Notify me when someone knocks», a `denied` answer replaces the offer
  with «Notifications are blocked in this browser, so knocks show only here.» in a polite live region (`.lobby-note
  .lobby-said`, `aria-live="polite"`, `aria-atomic`) mounted empty beside the offer. The press hands the focus to the
  door's title (`tabIndex={-1}`). Granted, dismissed (`default`) or a failed request: nothing, as before.

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
- **Review round** (independent review, no P1; then Luis's decision of 2026-11-16), each `test:` commit before its fix:
  - codes (`d37f71d98` → `d2fd21840`): `service-not-allowed` silent (review P2-1), `audio-capture` given its line and
    `network` silent (Luis). Unit, red: `actual: null`, `expected: 'Sophia can’t hear you: the microphone isn’t
    available.'`, and `actual: 'Sophia can’t hear you: the microphone is blocked for this site.'`, `expected: null`;
    green 4/4.
  - words heard keep their line (`2898daaac` → `5c7d6d03a`, review P3-3).
  - the door's live region and focus, and the quiet cases waiting for `asked === 1` instead of a 300 ms pause
    (`ae9f97d62` → `410800e4b`, review P2-2, P3-4, P3-7). The live region is `aria-live`, not `role="status"`:
    `lobby-door.spec.ts` and `knock-alert.spec.ts` find the door's title as its one status (`getByRole('status')`,
    strict), and a second status would break them.
  - review P3-1 (clear the network line on reconnecting) dropped with the line; P3-6, the knock-alert note's pointer,
    is in `410800e4b`.
  - the e2e red of these three pairs and every green e2e run: **not run**, the guard refused (below).
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

- **Run the e2e through the guard** once memory allows (refused all session, free RAM 4–7.9 GB against the 8 GB
  floor; pw-direct not allowed, Wow.exe not running):
  - green on `personal/dictation-and-notify-said`: `knock-alert.spec.ts`, `lobby-door.spec.ts` and
    `decision-alert.spec.ts` in full, and `personal.spec.ts` (at least `-Grep "seams|Talk instead|dictation|offline|
    limit|less motion"`);
  - red, detached: `12c7b9fcc` for the second blocked case; `d37f71d98` and `2898daaac` (`personal.spec.ts`,
    `-Grep seams`); `ae9f97d62` (`knock-alert.spec.ts`).
- Review P3-2 (network vs on-device) is with the coordinator for Luis; moot for the line now that `network` is silent.
- Home's «Speak instead» (`Welcome.tsx`) uses the same hook and gets `said`, but shows nothing yet: Home's line has no
  quiet status of its own. A follow-up if wanted.
- CI is the run on record.
