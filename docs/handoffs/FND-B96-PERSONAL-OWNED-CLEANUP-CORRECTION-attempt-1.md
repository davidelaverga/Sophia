# Implementation-session handoff

Goal and attempt: FND-B96-PERSONAL-OWNED-CLEANUP-CORRECTION-01, attempt 1. This addresses R2's single hold on B95
`165f0ef4`.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`); packet sha256 `eae91a3a…`.
Branch: `fix/personal-owned-cleanup-20261020-b96` from `165f0ef4`. Not pushed.

## The boundary (confirmed)

B95's launcher removed `SOPHIA_SERVED_PERSONAL_COUNT_FILE` on every normal exit, including a file the caller named.

The witness is a private driver in the journal, never committed. It gives the launcher a caller-named disposable file,
waits for `/health`, then sends SIGTERM to the launcher: its own stop path, which ends in `process.exit`. On 165f the
launcher exits 0 and the caller's file is gone (B96-logs/15).

## Correction

`apps/api/scripts/personal-served.ts`: the exit-time deletion is removed. The count writing is as on 047. Only
`playwright.served.config.ts` removes a count file, and only the temporary directory it made for a run that named
none. A caller's file stays theirs.

## Evidence

- New, normal exit (35): the launcher exits 0, and the caller's file is retained and readable, numeric only (0,
  because this control asks nothing).
- Default path (45, 43): the documented `SOPHIA_SERVED_PERSONAL=1` run with no count file passes 1/1. Its in-test
  checks hold: the fenced retry leaves the count unchanged and the new turn adds one. The erasure and Davide's view
  pass too. There are 0 `sophia-served-count-*` directories before and after.
- oxlint, prettier and API typecheck on the launcher: 0.

## Preserved (not edited)

- 047's documented run failing with ENOENT.
- B95's first PASS, which left its temporary directory behind.
- B95's final PASS with 0 directories.
- Correction to B95's handoff: the value 3 was read after the first fixed run (B95 log 37), not after the final one.
  The final run had only its in-test assertions and the zero-directory check.
