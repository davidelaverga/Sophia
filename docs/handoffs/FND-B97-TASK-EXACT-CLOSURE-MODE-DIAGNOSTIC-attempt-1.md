# Implementation-session handoff

Goal and attempt: FND-B97-TASK-EXACT-CLOSURE-MODE-DIAGNOSTIC-01, attempt 1. This is a diagnostic label only; it is
not a product fix.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `28c7cebc…`.
Branch: `diag/task-closure-mode-label-20261020-b97` from Task `c3e4de59`. Not pushed.

## Unchanged case first

On exact `c3e4de59` (Darwin arm64, Node 24.21.0, pnpm 11.7.0, existing frozen dependency graph), after the required
`@sophia/dsh-bundle` build, `tests/unit/reply-child.test.mjs` «partial live-home removal or uncertain directory sync…»
PASSES 1/1 (92–96 ms). This does not reproduce runtime CI 118426013347, where line 4925 failed with `unlinked` 0
against 1 expected. It is not a closure of that failure, whose cause stays UNKNOWN. Linux was not run.

## The label

Line 4925, `assert.equal(unlinked, 1)`, inside the loop over modes `unlink`, `sync`, `stop` and `deadline`, now
carries `mode` as its message: `assert.equal(unlinked, 1, mode)`. A failure there now names its mode. No criterion,
timing, fixture, hook, concurrency setting, implementation or other assertion changes; the second
`assert.equal(unlinked, 1)` at line 4928 is left as it was.

## Checks

The labelled case PASSES 1/1. Prettier: 0. Root oxlint: 0 (a file-scoped oxlint finds no files, because this test
file is outside the lint patterns).
