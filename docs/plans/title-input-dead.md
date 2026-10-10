# The theme drops `.title-input`, a class no component uses

> 2026-10-10 · Luis: «Do this task here: Remove dead .title-input rules from theme.css». Found while measuring
> placeholders (`placeholder-ink.md`): its placeholder rule was the last one in the faintest ink. No API change.

## What was checked

- `git grep title-input` over the repo: only the four rules in `apps/studio/src/app/theme.css` (the field, its hover,
  its focus, its placeholder) and notes that name them. No component, fixture or package uses the class, nor builds
  it from parts (`${…}-input` and the like).
- The last component that used it lost it in `d58397a0` (2026-09-30, the three places of direction C).

## What changes

- The four rules go. Nothing a page draws changes: no element matches them.

## Checks

- `ink` and `type-scale` pass unchanged; Prettier, `oxlint --type-aware` on the whole repo, the Studio's typecheck.
- No test is written for a rule that matches nothing: what it would assert (no element has the class) is what
  `git grep` shows.
