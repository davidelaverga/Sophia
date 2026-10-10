# Receipt · the browser gates at `a3422f4`: focused passed, full FAILED

The run reported live in [CON-01-CC-0017](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6091436742) has
now ended; this is its terminal result. It is the result of `a3422f4` alone. No later head is gated by it.

| Item | Value |
|---|---|
| Source | `a3422f48ac8a40f1ad7ab06dd490ff97a64e1473`, tree `ecfd9f6e32e43f8f0d5c06fb384a83b8f23fbc7a` |
| Worktree | `/home/user/sophia-g3-erase`, detached; `git status --porcelain` 0 lines before and after; nothing edited in it while it ran |
| Driver | `bash canda34-checks.sh` (PID 5794), from 2026-10-09 23:55:01 UTC; each exit written by the shell, never through a pipeline |
| Environment | the implementer's cloud container: Node 24.21.0, pnpm 11.7.0, Playwright 1.63 with `/opt/pw-browsers/chromium`, two workers, desktop 1280×800 and phone 390×844 |
| Not run | `pnpm check` (build, contracts, `pnpm test`, artifacts, integration), PostgreSQL suites, the real API |

## Exits

| Step | Command | Exit | Counts |
|---|---|---|---|
| Focused conversation gate | `playwright test e2e/conversation-thread.spec.ts e2e/conversations-*.spec.ts e2e/project-conversation-follow-ups.spec.ts e2e/project-conversation-writes.spec.ts e2e/project-conversations.spec.ts` | **0** | 150 passed (6.0 min) |
| Every Studio spec | `timeout 3600 pnpm exec playwright test --reporter=line` (PID 10386, from 00:01:02 UTC) | **1** | **1150 total, 1146 passed, 4 failed, 0 skipped** (53.7 min) |

**The full gate failed.** No conversation spec failed. Nothing below waives a failure.

## The four failures, each run alone afterwards

Each was rerun alone, desktop, `--repeat-each=3`:
- at `a3422f4` in the same worktree, once the gate had ended;
- on pristine `main` `3e6d57b13ee8eabe62cb8e5e1d0ee2e7ebd76b3c` (tree `e7c2b25f9e185bbe86b88205bd4b42594957667d`), in a separate worktree.

| Spec | In the gate | Alone at `a3422f4` | Alone on `main` `3e6d57b` | Excerpt |
|---|---|---|---|---|
| `app-auth.spec.ts:518` viewer-state lens after an email change | failed | passed 3 of 3 | passed 3 of 3 | `signedInAs` polled `""`, expected `davide@sophia.test` (5 s) |
| `home.spec.ts:263` hidden, Sophia's light asks for no frames | failed | **failed 1 of 3** | **failed 1 of 3** | `expect(…).toBeGreaterThan(10)`, received `7` |
| `personal.spec.ts:1329` a failed send comes back beside another tab's words | failed | **failed 1 of 3** | **failed 1 of 3** | `#c-input` `toHaveValue("From B.")`, received `"From A."` |
| `report-page.spec.ts:134` C9 print: every cell in the PDF | failed | **failed 3 of 3** | **failed 3 of 3** | `kitchen: table cells the PDF does not hold`: 16 cells |

What this attributes, and what it does not:
- Three of the four reproduce identically on `main` unchanged, in this container. `home:263` and `personal:1329` fail intermittently; C9 fails deterministically. That points to `main` or this environment rather than CON-01's change, but no root cause is established.
- `app-auth:518` failed only inside the full run. It was not reproduced alone at either head.
- The gate's result is unchanged by any of this: **failed**.

## Raw logs

They are in the implementer's container only:
- `canda34-checks.exit`
- `canda34-e2e-focused.log`
- `canda34-e2e-all.log`
- `canda34-four-isolated.log`
- `main3e6-four-isolated.log`
- the Playwright traces under `pw-wt/results/` and `pw-main/results/`
