# Implementation-session handoff

Goal and attempt: HOME-NEEDS-FOCUS-BY-ID (Codex P2 on #377, from the follow-up list; Luis: «Sigue con los P2 en local, sin subir
nada»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `home/needs-focus-by-id` from `origin/main` (`215166872`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con los P2 en local, sin subir nada»: local only until he says; merges on
green with no open P1 once pushed.
Ending commit/tree: `0cc878730f70` (tree `6a691688d8e1`), the last commit of `home/needs-focus-by-id`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `e2e/home-phone-needs.spec.ts`, `fixtures/home.tsx`, `src/features/personal/NeedsYou.tsx`, `src/features/personal/Welcome.tsx`, `docs/plans/home-needs-focus.md`. The review notes below name the commit of each later change.

## Outcome

- Home remembers which need had the focus by its id (`data-need` on the row), not its index: after the 20 s read brings a need ahead of it, crossing 860 px gives the focus back to the same need.
- A focused need that left meanwhile is not stood in for by its neighbour: the focus stays where it fell.

## Evidence

- Two new e2e in `home-phone-needs.spec.ts` (`needs=api`): on main the first ends with Marco's row inactive (index 2 is now another need) and the second with a neighbour focused instead of the page; both pass with the fix.
- Playwright through `safe-run.ps1`, two workers: home-phone-needs, home-needs and home specs, 44/44.
- Prettier, `oxlint --type-aware` and `tsc --noEmit -p apps/studio` clean.

## Decisions and changes

- Matched by `dataset.need` in a loop rather than a selector, so ids such as `permission:wait-w1` need no escaping.
- The fixture's `seen` set moved to module scope; `homeFixture.urgentNeed()` adds a decision due in 5 min (built inline, the contract's shape) and `dropNeed(id)` leaves one out, each invalidating `['vision', 'needs']` as the 20 s poll would.

## Remaining obligations

- Not asked by Codex, noted by the triage: the focusin listener is on Home only, so a focus that left Home and later fell to the page can still bring back the remembered need on a crossing (now at least the same need).

## Next bounded action

- Luis: say when to push; then merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
