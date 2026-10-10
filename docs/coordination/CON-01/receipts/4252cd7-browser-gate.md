# Receipt · `4252cd7`: browser gates (focused passed, full FAILED); `pnpm check` and PostgreSQL (passed)

This is the result of `4252cd7` (CON-01-CC-0026) alone. It gates no later head and not current `main`.

| Item | Value |
|---|---|
| Source | `4252cd74bca0ed18bc190d8832e98c75a920c7bf`, tree `9afcad10deb23f3f714bdeea09ad4df596f85d09` |
| Worktree | `/home/user/sophia-g3-erase`, detached; `git status --porcelain` 0 lines before and after; nothing edited in it while it ran |
| Driver | `cand4252-checks.sh`, started by `cc26-sequence.sh` after the isolated reruns and the fail-before; 2026-10-10 03:20:26 to 04:09:53 UTC. Each exit was written by the shell. Its output went to `pw-g6/results`. |
| Environment | the implementer's cloud container: Node 24.21.0, pnpm 11.7.0, Playwright 1.63 with `/opt/pw-browsers/chromium`, two workers, desktop 1280×800 and phone 390×844 |
| Not run | the real API, a hosted anything, a provider |

## Exits

| Step | Exit | Counts |
|---|---|---|
| Focused conversation gate | **0** | 160 passed (5.9 min) |
| Every Studio spec | **1** | **1160 total, 1158 passed, 2 failed, 0 skipped** (43.5 min) |

**The full gate failed.** No conversation spec failed. Nothing below waives a failure.

## The two failures

| Spec | Excerpt | Alone afterwards (desktop, `--repeat-each=3`) |
|---|---|---|
| `personal.spec.ts:382` every text in Personal reads at 4.5:1 | after `?arrive=1&ready=1`: `"02:55 (1.12)"`, `"Copy (1.13)"` under 4.5:1 (`:391`) | **failed 2 of 3** at `4252cd7` (frozen worktree); **failed 1 of 3** on `main` `31dd5874a1566110c65dcae18cbadce24445268b` (tree `b2f9a3eb01adba9b9df77338ac3e292d5ef88548`) |
| `report-page.spec.ts:134` C9 print: every cell in the PDF | `kitchen: table cells the PDF does not hold`: 16 cells | not rerun this time; at `a3422f4` it failed 3 of 3 alone, both there and on `main` `3e6d57b` |

What this attributes, and what it does not:
- **`personal:382`** fails intermittently on unchanged `main` here. That points to `main` or to this environment.
  - CON-01 changes nothing under `features/personal`.
  - It did not fail in the three earlier full runs.
  - No root cause is established.
- **C9** is the deterministic failure seen on `main` here.
- **`home:263`, `personal:1329` and `opening:216`** failed in earlier full runs and passed in this one.
- **GitHub Actions' `ci` workflow** (every Studio spec) concluded success on `4252cd7` (runs 2207 and 2208). That is another environment's result.
- **Seen, not attributed:** one fixture line, `unexpected request: GET …/meetings`, as in each earlier full run. No test failed on it.
- The gate's result is unchanged by any of this: **failed**.

## `pnpm check`

The same frozen worktree at `4252cd7` ran `cand4252-pnpm-check.sh`, 04:10:41 to 04:29:29 UTC: `git status --porcelain` 0 lines before and after.

| Command | Exit |
|---|---|
| `pnpm check` (toolchain, format, lint, build, typecheck, contracts, `pnpm test`, artifacts, `pnpm test:integration` against the pinned dsh) | **0** |

| Part | Counts |
|---|---|
| `pnpm test` | 2171 tests, 2170 passed, 0 failed, 1 skipped |
| `pnpm test:integration` | 88 tests, 86 passed, 0 failed, 2 skipped |

Skipped, each by its own condition:
- three LiveKit cases (`SOPHIA_TEST_LIVEKIT_URL` not set);
- a secret probe that doesn't run as root;
- the log-compat export and import (they need a second runtime unit);
- three crossings that need `SOPHIA_DISPOSABLE_DATABASE_URL`: design capture, render supervisor, and the runtime service with the pinned dsh.

`pnpm check` doesn't set that variable. The run with it set is below.

## With the disposable PostgreSQL

The same frozen worktree at `4252cd7` was used, with `SOPHIA_DISPOSABLE_DATABASE_URL` set to this container's PostgreSQL 16 cluster: port 55432, created for this session, holding nothing hosted. `git status --porcelain` showed 0 lines before and after.

| Command | Exit | Counts |
|---|---|---|
| `pnpm test:integration` (`cand4252-pg-extra.sh`, 04:29:53 to 04:35:31 UTC) | **0** | 101 tests, 99 passed, 0 failed, 2 skipped |
| Every `packages/*/src/**/*.db.test.ts` and `apps/*/src/**/*.db.test.ts`, one at a time | **0** | 627 tests, 627 passed, 0 skipped |
| `pnpm test:sql` (`scripts/db-test.ts`) | **0** | 46 migrations applied, 5 SQL test files passed, `db/tests/0048_conversations.sql` among them |

- With the database set, the three crossings that `pnpm check` skipped ran and passed: design capture, render supervisor, and the runtime service with the pinned dsh.
- The integration suite's two skips are the log-compat export and import only.

## Raw logs

They are in the implementer's container only:
- `cand4252-checks.exit`
- `cand4252-e2e-focused.log`
- `cand4252-e2e-all.log`
- `iso-personal382-4252.log`
- `iso-personal382-main.log`
- `cc26-seq.exit`
- `cand4252-pnpm-check.exit`, `cand4252-pnpm-check.log`
- `cand4252-pg-extra.exit`, `cand4252-integration-pg.log`, `cand4252-db-all.log`, `cand4252-sql.log`
- the traces under `pw-g6/results/`, `pw-iso/results/` and `pw-main2/results/`
