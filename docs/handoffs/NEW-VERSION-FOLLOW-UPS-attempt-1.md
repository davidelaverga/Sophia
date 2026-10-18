# Implementation-session handoff

Goal and attempt: NEW-VERSION-FOLLOW-UPS (Codex P2s on #415, from the follow-up list; Luis: «Sigue con la cola»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `app/new-version-follow-ups` from `origin/main`
(`c2dc1160`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-17, «Sigue con la cola»; merges on green with no open P1.
Ending commit/tree: `e84075ca1faf` (tree `a664796c37b1`), the last commit of `app/new-version-follow-ups`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 8 files changed against
`origin/main` at that commit: `e2e/new-version.spec.ts`, `src/app/App.tsx`, `src/app/NewVersion.tsx`, `src/app/new-version-early.ts`, `src/app/new-version-signal.test.ts`, `src/app/new-version-signal.ts`, `src/app/theme.css`, `docs/plans/new-version.md`. The review notes below name the commit of each later change.

## Outcome

- **A new version is heard from the first moment.** App's eager imports can ask for a part that is gone before React
  draws the notice; `new-version-early.ts`, App's first import, keeps the word, and the notice reads it when drawn.
- **The notice stands over the opening** (`#entry`), so a sign-in's return can press Reload at once instead of after
  the opening's 5-second fallback.
- **Not now gives the focus back** to where it was when the notice came.

## Evidence

- Plan: `docs/plans/new-version.md`, «Follow-ups».
- **Written first (commits `fcf35cbf` and `f0411662`), each failing on main's code:**
  - `new-version-signal.test.ts`: the module wasn't there;
  - a word dispatched when the page's scripts have run (`DOMContentLoaded`), before React's effects, showed no notice;
  - with the opening's overlay shown, what lay under Reload's centre wasn't Reload;
  - after Not now, the sign-in's email field had lost the focus. The first draft focused «Account», which a signed-out
    fixture doesn't have; `f0411662` uses the email field.
- **After the change, locally:**
  - unit 2/2;
  - `new-version`, `app-auth` and `skip-link`: 30/30;
  - the opening's pages (`opening`, `light-mark`, `light-mode`): 39/39;
  - Studio typecheck, lint and Prettier: clean.

## Decisions and changes

- **The ear is App's first import,** by name, handed to the notice. The lint allows no side-effect imports but CSS
  and fonts, and App's first import runs before its eager ones, from every entry that draws App (`main.tsx` and two
  fixtures).
- **`newVersionSignal` is pure over its target,** so the keeping is unit-tested with a plain `EventTarget`.
- **Over the opening at 110:** the overlay is 100 (`public/entry.css`); nothing else needs to change for it.

## Remaining obligations

- None.

## Next bounded action

- Luis: merge on green with no open P1.
- Source IDs consulted: none from the source register; the work read this repository only.
