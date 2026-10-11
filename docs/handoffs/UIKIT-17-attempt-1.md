# Implementation-session handoff

Goal and attempt: UIKIT-17 (Updates: a destination on every line; the digest narrowed by kind and by person), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/updates-narrow` from `ui/commands` at
`fddb51dd` (stacked on PR #238 → #237 → … → #220; the base retargets as each merges)
Ending commit/tree: `818064d0` (tree `b0f9a141d5f6`): 10 files, 3 new (`updates-narrow.test.ts`, `e2e/updates-narrow.spec.ts`,
`docs/plans/updates-narrow.md`); `updates-view.ts`, `UpdatesView.tsx`, `recap-view.ts`, `MeetingRecap.tsx`,
`project-go.tsx`, `ProjectShell.tsx`, `theme.css`. The commit after it adds only this handoff.
After the review (Codex on #239, P2): `b418f73c` writes the task's fragment after the view's own push and makes a
research card named in the address take the focus and come into view (`useNamedCard` in `WorkCard`); the spec
presses «Open the task» with the research running. That is the completed code state of this PR.

## Outcome

- `recap-view.ts`: each line says where it lives (`to: 'brief' | 'task'`); `RecapPart` takes `go` and presses «In the
  brief» (Decided, Kept, Still open) or «Open the task» (Work); Made keeps «Open»; the recap sheet gives no `go`.
- `project-go.tsx`: `Arrival` grows by the brief in the Studio view (consumed by the project's sheets, which hold the
  panel) and a task in Tasks (named in the address with `showInAddress(taskId, TASK)`: the board that holds it opens
  it, as a link followed).
- `updates-view.ts`: `narrowRecords`, `kindCounts`, `peopleOf`, `KINDS`; 6 unit tests.
- `UpdatesView.tsx`: the row over the digest (the kit's Segmented «Kind», sm, counts, only the kinds with lines; a
  person menu «By everyone» / «By Lucía» on the kit's Menu); narrowed to nothing, one line; «Mark as seen» marks the
  whole digest as before.
- `e2e/updates-narrow.spec.ts` (3): the kinds and counts, one kind alone, back to all; by person and back; the
  decision to the brief.
- Unverified here: the Playwright run (the local guard); CI is the run on record.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck`: clean. Updates + voice unit tests: 160 pass.
- Measured in the page (the pane at 1280×800, `room.html?place=updates`): the radios «All» (checked) · «Decided 1» ·
  «Still open 1» (no «Work»: nothing of that kind); the two lines each with «In the brief»; «Still open» pressed → only
  that section, «Mark as seen» still there; «By everyone» opens Everyone (checked) · Lucía · You; «Lucía» → «By Lucía»,
  only Decided, the menu closed, the focus back on the press; «In the brief» → Studio current, the side panel open with
  the Brief tab selected.

## Decisions and changes

- The destination is the line's, said in `recap-view.ts`, so the words are unit-tested and the sheet can keep its
  quieter form (no presses there but Open).
- A task goes by the address, not by an arrival: several boards may be on the page, and only the one that holds the
  task should open it; the address already does that.
- «Mark as seen» stays one press for the digest (the pass miscounted it as one per item).

## Remaining obligations

- Watch CI for `updates-narrow.spec.ts` and `room-updates.spec.ts`; the independent review (Codex) with no P1/P2
  before merge. The base is `ui/commands` until #238 merges.

## Next bounded action

UIKIT-18 (Conversations: actions per message at the corner beside «Propose as decision»: copy, quote into the
composer; what ↑ does with no edit API said in the note).
