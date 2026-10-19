# Implementation-session handoff

Goal and attempt: SEAM-PROJECT-ARRIVAL-SINCE (costuras.md seam #7, its second half; Home's half is #468 and batch 5,
whose handoff names this as the next step; Luis 2026-10-19: «Entonces sigue trabajando en lo que viene mientras
esperamos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-5`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-5`, branch `seams/project-arrival-since` from the local
`group/follow-ups-5` (`56c61c61e`, not pushed; it stacks on #468 `group/seams-4` and holds batch 5)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API (A34 is served).
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-19, the quote above; local only, nothing pushed; merges on green with no open P1 once
pushed, after #468 and batch 5.
Ending commit/tree: `f4a188b1d820` (tree `2fdd79f822ee`), the branch's last commit that changes code (the next one
adds only this record and the note's measured lines). Files changed against `56c61c61e`: `e2e/arrival-since.spec.ts`,
`fixtures/data.ts`, `fixtures/fixture-api.ts`, `fixtures/meeting-data.ts`, `fixtures/room.tsx`,
`src/app/attention.test.ts`, `src/app/theme.css`, `src/features/personal/places-view.ts`,
`src/features/personal/useSinceNews.ts`, `src/features/studio/ProjectShell.tsx`,
`src/features/updates/ArrivalSince.tsx`, `src/features/updates/since-said.test.ts`,
`src/features/updates/since-said.ts`, `docs/plans/project-arrival-since.md`, and this record.

## Outcome

- Where Updates is served (the vision or the attention flag), opening a project after others decided, made or kept
  something since the person last marked it seen shows a card under the bar, where the newcomer's welcome goes:
  «Since you last looked: 2 notes kept. Open Updates», with Dismiss (×). Before, nothing inside a project said it;
  «Since you last looked» showed only if the person opened Updates themselves.
  - The counts are Home's words (`newsWords`, now beside `newsOf` in `since-said.ts`). The bar names the project, so
    the line doesn't.
  - Only what someone else did (`freshIn`): the person's own decision, report and note are no news to them.
- **Once per window, project, account and device, shared with Home.** The line is kept as soon as it is decided
  (`rememberSaid`, the window's lines whole), so neither Home nor the next open says it again. What Home said, or
  Updates showed, is not said on arrival.
- **Nothing is said** when the visit begins at Updates or with the newcomer's welcome, in a call in that room (a
  project kept out of sight behind its call is always in one), for an empty window, one never marked seen, one with
  only proposals and tasks, or while the project's call read is pending.
- **It goes** with Open Updates (which opens Updates), any move to Updates, a call starting, or Dismiss, and doesn't
  come back in that open.
- **Announced, never taking the focus**: an empty `role="status"` element is under the bar from the shell's first
  frame. The card is put in it after a commit, even when the window was already in the cache.
- **Request budget**: at most one `/since` read per project open, made once the project is drawn (loaded, not refused),
  under Home's key and freshness (`homeSinceKey`, 20 s). So an open within 20 s of Home's read sends none, and it reads
  nothing at Updates, in a call, or after it has decided. It is never polled, retried or read on focus. A read of a
  call's pending project ends that wait, as Home's does (`readOf`).

## Evidence

- Plan: `docs/plans/project-arrival-since.md`, committed before the tests (`ab2fb17fb`).
- **Pair 1, the decision.**
  - Written first and failing (`b502046b2`): `since-said.test.ts` «The requested module './since-said.ts' does not
    provide an export named 'arrivalOf'».
  - Fix `b48ee854d`: `arrivalOf` and the moved `newsWords`. since-said and places-view: 52/52.
- **Pair 2, the line.**
  - Written first and failing (`1c0b4cb68`), with the fixture's levers in the same commit:
    - `attention.test.ts`: «The input did not match the regular expression /\{ drawn, inCall, atUpdates, welcomed,
      enabled = SINCE_SHOWN \}: ArrivalOptions/».
    - `arrival-since.spec.ts` (log `pw-logs/arrival-since-red.txt`), 6 failed. The line is missing: «Expected substring:
      "Since you last looked: 2 notes kept."», «element(s) not found». Nothing is read on arrival: «Expected: > 0»,
      «Received: 0». The checks that expect nothing fail on the status not being there at all.
  - **One fixture change after the red run, in the fix commit.** `said=home` built its window at module load, before
    `readoutMade` was defined, so the page threw «Cannot access 'readoutMade' before initialization» and read nothing.
    The first green run failed there alone (`pw-logs/arrival-since-green1.txt`). The lever now runs just before the
    page renders. No assertion changed.
  - Fix `e86394c97`: `useArrivalSince` (`useSinceNews.ts`), `ArrivalSince.tsx`, `UnderTheBar` in `ProjectShell.tsx`,
    and `.arrival-band`.
  - `f4a188b1d`: the card is 420 px wide at a desk (never past the gutters), so a short line stays on one.
- **Control mutant**, applied for one run and restored. With the memory ignored (`said: {}` in `arrivalNow`), «said on
  Home first» fails with «Expected: ""», «Received: "Since you last looked: 2 notes kept. Open UpdatesDismiss"»
  (`pw-logs/arrival-since-mutant-memory.txt`; «Dismiss» is the tip's `aria-hidden` text).
- Green through the guard:
  - At `e86394c97`: `arrival-since`, `room-updates`, `updates-digest`, `updates-refusal`, `updates-narrow`,
    `updates-quiet`, `newcomer-welcome`, `opening`: 54/54. Then `room`, `app-auth`, `home-since`, `signed-in-later`,
    `new-version`, `profile-editor`, `skip-link`, `focus-visible`, `phone-fits`, `light-mode`: 130/130.
  - At `f4a188b1d`: `arrival-since`, `room-updates`, `updates-digest`, `updates-refusal`, `newcomer-welcome`, `opening`,
    `home-since`, `light-mode`, `phone-fits`: 79/79 (`pw-logs/arrival-since-green-final.txt`).
- Unit: the Studio suite passes 1912/1914. The two failures are the Windows path ones (`app/attention.test.ts`'s
  readers list, `features/conversations/browser-imports.test.ts`). The readers list is unchanged: no new file reads the
  flag, and the arrival takes `SINCE_SHOWN` from `useSinceNews.ts`.
- Whole-repo `oxlint --type-aware`, `tsc --noEmit -p apps/studio` and Prettier on every touched non-docs file: clean.
- **Captures**, from a throwaway spec (deleted), in the session scratchpad `seams-project-arrival-since/`, with `*.json`
  beside each:
  - `studio-` and `knowledge-1280x800-dark.png`: the card 420 × 66 px at x 821.6, 16 px under the bar, on one line.
  - `studio-` and `knowledge-390x844-light.png`: 358 × 86 px inside the 16 px gutters, on two lines.
  - The status is 0 px high in the page's flow, and the card is fixed, so nothing on the page moves when it comes.
    There is no horizontal overflow on the page or the body (0 px in all four).

## Decisions and changes

- **Home's key, not Updates'.** Updates keeps another shape under its key (`SinceRead`, with `readFrom` for its refusal
  order), so the arrival reads under `homeSinceKey` through `readOf`: an open just after Home reads nothing, and the
  read ends a call's pending wait as Home's does. At Updates the arrival reads nothing, so Updates' own read is the only
  one there.
- **A visit is one open.** `ProjectShell` is keyed by account and project (`SignedIn`), so the visit's state lives in
  the shell and needs no reset. It decides once, after a commit, from a settled read, and the decision is final for that
  open.
- **Shown is said.** The window is kept as it is decided, as Home keeps what its sentence says, so a reload or Home never
  repeats it. The price is that a line drawn but not read is kept too. Updates lists everything.
- **In the welcome's place, as a card.** `.welcome-band` is fixed under the bar, over the view, so a line that comes
  after a read moves nothing. The arrival reuses its card (its shadow token included) with a one-line layout. A visit
  that begins with the welcome says nothing. A newcomer has never marked seen, so the two never meet in practice.
- **No `background` prop.** A project kept out of sight is always in its call (`ProjectShell`'s `background`), and
  `inCall` already ends the visit. That kept `ProjectShell` within its 60 lines.
- **The lever reads as a named viewer.** `seen=earlier` gives the room page a token whose subject is the membership's
  actor (as `home.html`'s `since=` reader does), so the viewer's own decision, readout and note in the demo don't count.
  What's left is Lucía's note and Sophia's: «2 notes kept». Only pages with `seen=` read as that account. The fixture
  keeps the seen mark across a reload in session storage, as the API keeps it, so «Mark as seen, then reload» is
  tested against a window that is really empty. `said=home` writes what Home's `useSaidOnce` would.
- **Brief against code.** The brief says `room-updates.spec.ts` asserts the demo's Updates lead. It asserts the plain
  room's («You haven’t looked before»), and `updates-digest.spec.ts` pins the demo's lines. Both are unchanged: the
  lever only acts with `seen=`.

## Remaining obligations

- The note's limits:
  - the memory is this device's;
  - a line drawn but not read is kept;
  - an open more than 20 s after Home's read reads the window once more, and says lines newer than Home said.
- `e2e-attention` (attention flag, no vision) and `e2e-served` (real API) weren't run here; CI is the run on record.
  Under the attention flag the arrival reads `/since` on a project open outside Updates. Reading
  `attention-page.spec.ts`, none of its checks count that read: they run at Updates, filter by reader, or are on the
  off page, where nothing reads.

## Next bounded action

- Luis: say whether this rides on batch 5's group PR or its own, once #468 merges; push only on his word, and merge on
  green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository and costuras.md only.
