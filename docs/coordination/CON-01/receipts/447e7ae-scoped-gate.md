# Receipt · the scoped gate at `447e7ae` (CON-01-CC-0014): FAILED

The result as reported in [CON-01-CC-0014](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090866282), kept here
so it can be read. The raw logs and traces stayed in the implementer's container. They are copied below only where a
failure is quoted.

| Item | Value |
|---|---|
| Source | `447e7aec0ef923e58e386155089cf64d63422f2c` |
| Tree | `506a8615216894c046b989d003a6c3b3395322a6` |
| Worktree | clean (`git status --porcelain`: 0 lines); no source changed while it ran |
| `main` | merge base `71dbea3e`; does **not** contain `main` `6744e78`, `6ef8d855` or `3e6d57b` |
| Kind | scoped gate, **not** `pnpm check`. Not run: build, `contracts:check`, `pnpm test`, artifacts, `test:integration`, `test:db`, `test:sql` |
| Environment | the implementer's cloud container: Node 24.21.0, pnpm 11.7.0, Playwright 1.63 with the container's Chromium (`/opt/pw-browsers/chromium`), two workers |

## Exit codes

Each exit code was written by the shell itself, never read through a pipeline.

| Step | Command | Exit | Counts |
|---|---|---|---|
| format | `pnpm format:check` | 0 | — |
| lint | `pnpm lint` | 0 | — |
| typecheck | `pnpm typecheck` | 0 | — |
| Studio unit | `node --test --test-timeout=60000 "apps/studio/src/**/!(*.db\|*.live).test.ts"` | 0 | 1018 tests, 1018 pass, 0 fail, 0 skipped |
| Studio browser, every spec | `playwright test` (desktop 1280×800 and phone 390×844) | **1** | **1131 total, 1129 passed, 2 failed, 0 skipped, 0 flaky** (39.1 min) |

## Failed specs

Neither failure is waived or counted as a pass.

1. `[desktop] e2e/personal.spec.ts:382`, *detail · every text in Personal reads: no contrast under 4.5:1, its times and
   notes included*.
   - At line 391 (`?arrive=1&ready=1`) it received `["21:53 (1.12)", "Copy (1.13)"]`.
   - In isolation at the same head (`--repeat-each=3`, desktop) it passed 3 of 3. It has not been rerun inside a full
     run.
   - `main` #202 (`6ef8d855`) changes how this check waits. The candidate does not contain #202.
2. `[desktop] e2e/report-page.spec.ts:134`, *C9 · print keeps every table whole: none past the printable width, every
   cell in the PDF*.
   - Error: `kitchen: table cells the PDF does not hold`. Sixteen cells were missing, among them "EU-only (data,
     backups, support)", "Monthly cost (USD)", "14 days (35 max)", "DPA names EU-only support", "pgaudit, EU bucket
     only".
   - In isolation at the same head it failed 3 of 3.
   - Alone on pristine `main` `6ef8d855` in the same container it failed the same way. It also failed in the
     interrupted run at `e11c19c`.
   - It is inherited from `main` in this environment, not caused by CON-01, and it still fails this gate.
   - Not root-caused. The container's Chromium PDF text is suspected, not proven.

## What this receipt does not say

- Nothing about `4575dad`, `5c3866ad` or any later commit follows from this run.
- No `main` integration is inferred.
- G2 is not active, and no allowance was reset.
