# Handoff: one truth about people and states, attempt 1

Goal and attempt: UI-ONE-TRUTH (`docs/plans/one-truth.md`; improvements 5, 18, 6 and 8 of the independent evaluation of
2026-11-22), attempt 1. Batch A of seven.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/mejoras-a-presencia` from
`origin/main` `df4b4a518`.
Ending commit/tree and changed files: content commit `33a935c55` (tree `d5e1973f3`): 46 files changed, 772
insertions, 85 deletions, all under `apps/studio` and `docs/plans`; this record is the next commit.

## Outcome

- Before joining, People lists who the server says is in the room and «Join the room» shows their initials, with
  Home's sentence as its description; with nobody in, People says so; before the server answers, it claims nothing.
- The name a person saves shows at once in Home's greeting, Personal's first line, the avatar, Settings and their own
  tile in the call. Nobody reads as an id: a nameless participant or member is «A member».
- Under a goal command, «The status changes when Sophia confirms.» shows only until the goal shows the command's
  state. A stopped goal is «Stopped», counted apart from paused ones, never «Paused · Stopped».
- Work pulse dots: asked violet, done teal, halted amber.
- Unverified: renaming in a live call for the others (they see it at their next join: an API matter), the server's
  «Someone», and a resume event (the API emits none). All three are listed in the note's «Left».

## Evidence

- Measured before on the evaluation's own stack (`Sophia-paper-5` at `df4b4a518`, :5173) and after on this branch's
  Studio (:5176) against the same API: People «Nobody is in the call yet.» → «Davide»; Join gains «D» and its
  description; Outsider «Good evening, Outsider.» / «Hi Outsider, I’m Sophia» / «O» → «Marta» / «Hi Marta…» / «M»,
  and a save changed all three without a reload; in the call, People «Luis · you»; Goals «1 paused» → «1 stopped»,
  the sheet «Stopped»; on the room fixture, Hold: «Holding» with the sentence, then «Held» without it; pulse dots
  violet, teal, amber in dark and light; 390 × 844: the dock on one row, People on the gutter.
- Studio units: all pass but the two known Windows-only failures (`attention.test.ts`, `browser-imports.test.ts`),
  which fail the same way on `df4b4a518`.
- `pnpm lint` 0, Studio `tsc --noEmit` 0, Prettier clean on every changed file.
- Playwright through `pw-gentle.ps1`, one worker: `room-presence`, `host-controls`, `goal-controls`, `goals-overview`,
  `views-goals`: 50 passed (log `ui-a-presence-3`). An earlier run of `room-presence` + `host-controls` with
  `--repeat-each 2`: 46 passed; one `host-controls` failure before it (the People toggle's click opened nothing) did
  not repeat.
- One independent review of the whole diff before the push: one P1 (`room: null` read as nobody; the API means
  unknown), three P2s (a guest polling the project list, an empty panel when the read fails, pulse siblings) and
  P3s; all fixed but «A member» capitalised mid-sentence and a spec for the re-read after leaving, both in the note's
  «Left».

## Decisions and changes

- Presence reads Home's own query, only out of the call; in the call, the call's list wins.
- The saved name reaches `ProjectShell` as a prop from `SignedIn`, so the fixture pages, which don't serve the
  profile, make no new request.
- The single fallback word is the approved «A member», not the server's «Someone».
- One new sentence («Who’s in the call shows once you join.»); it and the words that read differently are listed in
  the note for Luis to approve.

## Remaining obligations

- The PR is not merged. CI's browser job is the run on record.
- Visible words pending Luis's approval (the note's table).

## Next bounded action

Luis reviews the PR and the words. Batch B (`ui/mejoras-b-foco`: focus never falls to the page, addresses for what
opens, first-run focus, a role's «Saved») starts after this PR is delivered.

Source IDs consulted: `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` (Studio UI, the room's side panel),
`docs/plans/author-names.md`, `served-names.md`, `discussion-author-names.md`, `mission-author-names.md`,
`voice-author-names.md`, `profile-editor.md`, `room-dock-people.md`, `goal-controls-text.md`.
