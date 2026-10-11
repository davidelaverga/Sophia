# Receipt · the browser gates at `74a697b`: focused passed, full FAILED

This is the result of `74a697b` (CON-01-CC-0025) alone. It gates no later head: not `4252cd7`, not current `main`.

| Item | Value |
|---|---|
| Source | `74a697b717ca48aa41511f3c3fd3276676e6bc17`, tree `f82d631e9b67d78484e2b8ddbd4f0a44b9ee8dbf` |
| Worktree | `/home/user/sophia-g3-erase`, detached; `git status --porcelain` 0 lines before and after; nothing edited in it while it ran |
| Driver | `bash cand74a6-checks.sh`, 2026-10-10 02:27:07 to 03:17:56 UTC. Each exit was written by the shell. Its output went to `pw-g5/results`. |
| Environment | the implementer's cloud container: Node 24.21.0, pnpm 11.7.0, Playwright 1.63 with `/opt/pw-browsers/chromium`, two workers, desktop 1280×800 and phone 390×844 |
| Not run | `pnpm check`, the real API |

## Exits

| Step | Exit | Counts |
|---|---|---|
| Focused conversation gate (the same five spec patterns as before) | **0** | 160 passed (5.9 min) |
| Every Studio spec (`timeout 3600 pnpm exec playwright test`) | **1** | **1160 total, 1158 passed, 2 failed, 0 skipped** (44.8 min) |

**The full gate failed.** No conversation spec failed. Nothing below waives a failure.

## The two failures

| Spec | Excerpt | Alone afterwards (desktop, `--repeat-each=3`) |
|---|---|---|
| `opening.spec.ts:216` with less motion, signed in from this tab, it covers the screen visibly | `#entry` opacity: expected `"1"`, received `"0.294648"` | passed 3 of 3 at `74a697b` (frozen worktree); passed 3 of 3 on `main` `31dd5874a1566110c65dcae18cbadce24445268b` (tree `b2f9a3eb01adba9b9df77338ac3e292d5ef88548`) |
| `report-page.spec.ts:134` C9 print: every cell in the PDF | `kitchen: table cells the PDF does not hold`: 16 cells | not rerun this time; at `a3422f4` it failed 3 of 3 alone, both there and on `main` `3e6d57b` |

What this attributes, and what it does not:
- **`opening:216`** failed only inside the full run. It did not fail in `a3422f4`'s or `715d2b1`'s full runs.
  - CON-01's diff from `main` in `apps/studio/src/app/` is `route.ts` and `vision.ts` only: the Conversations tab's route and flag.
  - No root cause is established.
- **C9** is the deterministic failure seen on `main` here.
- **`home:263` and `personal:1329`**, which failed at `a3422f4` and `715d2b1`, passed in this run.
- **GitHub Actions' `ci` workflow**, which includes every Studio spec, concluded **success** on `74a697b` (runs 2203 and 2204), and also on `715d2b1`, `f12786a` and `7969d40`. That is another environment's result, not this gate's.
- **Seen, not attributed:** one fixture line, `unexpected request: GET …/meetings`, as in the earlier full runs. No test failed on it.
- The gate's result is unchanged by any of this: **failed**.

## Raw logs

They are in the implementer's container only:
- `cand74a6-checks.exit`
- `cand74a6-e2e-focused.log`
- `cand74a6-e2e-all.log`
- `iso-opening-74a6.log`
- `iso-opening-main.log`
- `cc26-seq.exit`
- the traces under `pw-g5/results/`, `pw-iso/results/` and `pw-main2/results/`
