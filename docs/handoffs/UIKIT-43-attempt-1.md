# Implementation-session handoff

Goal and attempt: UIKIT-43 (the next ask on Home and on a task's sheet; informe-inteligencia #4; Luis: «Procede»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/next-ask-places` from `ui/ask-instead`
(stacked on PR #267 → #266 → … ; the base retargets as each merges)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`), on branch `ui/next-ask-places`; no
service code, no deploy, no contract.
Runtime unit: Luis's Windows host (the fixture dev server on :5197; Playwright through `.claude-guards/safe-run.ps1`,
2 workers); CI (GitHub Actions) as the run on record.
Existing authority: Luis's standing instructions for the kit stack (push to `ui/*`, answer Codex's threads with a fix
commit, cancel superseded CI runs); merges are Luis's, with no open P1. Spending: no paid service; CI minutes only.
Ending commit/tree: `b3676be54d28` (tree `3f8a9b89962c`), the last commit of `ui/next-ask-places`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 10 files changed against
`ui/ask-instead` at that commit: `e2e/home.spec.ts`, `e2e/next-ask-places.spec.ts`, `e2e/resources.spec.ts`, `fixtures/home.tsx`, `src/features/personal/Welcome.tsx`, `src/features/personal/places-view.test.ts`, `src/features/personal/places-view.ts`, `src/features/work/planning/AskSophia.tsx`, `docs/handoffs/UIKIT-43-attempt-1.md`, `docs/plans/next-ask-places.md`. The review notes below name the commit of each later change.

## Outcome

- Home's line suggests the next ask as its placeholder (`homeNextAsk`, read as `sophiaSays`): a session about to start
  («Help me get ready for Pitch run in Weekly standup», *because it starts in 10 min*), else the busiest room («Catch
  me up on Onboarding pilot», *because Marco, Lucía and Sophia are there now*), else nothing. Focused and empty, the
  key cap «Tab» stands where «/» stood; Tab or → fills the line; Esc puts it away for the visit. Listening: nothing.
- A task's sheet: the field's placeholder is the first question its state invites; the cap while focused and empty; Tab
  fills it; Esc puts it away for the sheet. The chips stay.

## Evidence

- `places-view.test.ts` (18, one new): pass. Lint (type-aware) and typecheck clean.
- `e2e/next-ask-places.spec.ts` (5: Home suggests and Tab fills; Esc puts it away; it comes back on the next visit;
  the task's sheet suggests and Tab fills; Escape in its empty field leaves the sheet open) written; not run locally: the machine guard refused Playwright while AION2 was open.
  A headless probe read: Home placeholder «Catch me up on Onboarding pilot», no cap unfocused, «Tab» focused (its middle
  on the line's, 573 = 573), Tab → the line holds it, Esc on a fresh visit → «Say something to Sophia»; the task's field
  placeholder «Why is it waiting?» = its first chip, the cap focused, Tab → the field holds it. CI is the run on record.
- CI on the stack's tip `4020b4ba` (#268, which holds this branch), run 38302673542: all six jobs green, the
  browser job with `next-ask-places.spec.ts`, `home.spec.ts` and `resources.spec.ts`; «Live auth on local Supabase» after one rerun of that job, its first try refused by
  Docker Hub's rate limit before any test ran.
- Capture `evaluacion-2026-10-12/inteligencia/next-ask-home.png`.

## Remaining obligations

- CI watched: green on the tip (above), the Home and task-sheet suites among it. The independent review (Codex) with
  no open P1 before merge; its P2s go to follow-ups. The base is `ui/ask-instead` until #267 merges.

## Next bounded action

informe-inteligencia #8 (a message that reads like a decision offers «Propose as decision») once real messages can be
measured for false positives; the personal space's composer with her own signals.

## Post-review (Codex on #268)

A session under way (the project list keeps it as `nextSession` until it ends) is not suggested to get ready for: only
sessions starting ahead of now; it neither shows «Because it started» nor outranks one about to start.

## Post-review, round 2 (Codex on #268)

- Put away for the visit only: Home left (it stays mounted under a hidden place), the next visit offers the ask again
  (`useLineNext` resets on `hidden`). next-ask-places.spec leaves Home and comes back (the fixture's `leave=1` shows its
  own Leave Home control in the demo); it fails without the reset.
- home.spec's microphone check reads the line's resting words, which the next ask now fills while a room is about to
  start (it pinned the default and failed on this branch).

## Post-review, round 3 (Codex on #268)

- `72c1b94b`: Escape in a task sheet's empty field puts the suggestion away and leaves the sheet open (`AskSophia`
  stops the key there); next-ask-places.spec reads it.
- `b3676be5`: the tiles' arrow-key check in `resources.spec.ts` reads rows from layout (`offsetTop`), not from boxes
  still rising in; it had failed once in CI on a frame mid-animation.
- This record's counts and CI result brought to the final branch (as Codex asked of #266's, P1 4251947535).
