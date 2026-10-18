# Receipt · the browser gates at `715d2b1`: focused passed, full FAILED

This is the terminal result of the run reported live in CON-01-CC-0022 and CC-0024. It is the result of `715d2b1` alone, whose source is `1f49c4f`'s. It gates no later head: not `7969d40`, not `74a697b`, not current `main`.

| Item | Value |
|---|---|
| Source | `715d2b1a1c677c46a9b168c30475c32d0a5f00bc`, tree `6053d6b5cf754d6709c8d1cab3168d6555155d74` |
| Worktree | `/home/user/sophia-g3-erase`, detached; `git status --porcelain` 0 lines before and after; nothing edited in it while it ran |
| Driver | `bash cand715-checks.sh`, from 2026-10-10 01:11:17 UTC; each exit written by the shell, never through a pipeline. An earlier start (about 01:00) reached 46 of 154 in the focused gate and recorded no exit; its logs were overwritten and nothing from it is used. |
| Environment | the implementer's cloud container: Node 24.21.0, pnpm 11.7.0, Playwright 1.63 with `/opt/pw-browsers/chromium`, two workers, desktop 1280×800 and phone 390×844 |
| Not run | `pnpm check` (build, contracts, `pnpm test`, artifacts, integration), the real API |

## Exits

| Step | Command | Exit | Counts |
|---|---|---|---|
| Focused conversation gate | `playwright test e2e/conversation-thread.spec.ts e2e/conversations-*.spec.ts e2e/project-conversation-follow-ups.spec.ts e2e/project-conversation-writes.spec.ts e2e/project-conversations.spec.ts` | **0** | 154 passed (6.1 min) |
| Every Studio spec | `timeout 3600 pnpm exec playwright test --reporter=line` (PID 436, 01:17:26 to about 02:06 UTC) | **1** | **1154 total, 1151 passed, 3 failed, 0 skipped** (48.7 min) |

**The full gate failed.** No conversation spec failed. Nothing below waives a failure.

## The three failures

| Spec | Excerpt | At `a3422f4` (its [receipt](a3422f4-browser-gate.md)) |
|---|---|---|
| `home.spec.ts:263` hidden, Sophia's light asks for no frames | `expect(received).toBeGreaterThan(expected)`: expected > 10, received 10 | failed in its gate; alone, failed 1 of 3 at `a3422f4` and 1 of 3 on `main` `3e6d57b` |
| `personal.spec.ts:1329` a failed send comes back beside another tab's words | `expect(locator).toHaveValue(expected)`: expected `"From B."`, not received | the same |
| `report-page.spec.ts:134` C9 print: every cell in the PDF | `kitchen: table cells the PDF does not hold`: 16 cells | failed 3 of 3 alone at both heads |

What this attributes, and what it does not:
- These are the same three specs that reproduced on unchanged `main` `3e6d57b` in this container. That points to `main` or to this environment, not to CON-01's change.
  - No root cause is established.
  - They were not rerun alone at `715d2b1`.
- **GitHub Actions** ran every Studio spec at `d13029c` (an earlier head of this PR) on its own runner. There, these three passed and one conversation spec failed (`conversations-removal.spec.ts:421`): its expectation that `reply` records equal `['reply:message']`. That expectation was corrected in `1f49c4f` (see the [fail-before receipt](fail-before-89eb-d130-653f.md)).
- **Seen, not attributed:** at 01:58:24 the fixture server logged `unexpected request: GET /api/v1/projects/00000000-0000-4000-8000-0000000000aa/meetings`.
  - It came while work-spec tests 965–968 ran on two workers.
  - No test failed on it.
  - The same line appears once in `a3422f4`'s full log.
- The gate's result is unchanged by any of this: **failed**.

## Raw logs

They are in the implementer's container only:
- `cand715-checks.exit`
- `cand715-e2e-focused.log`
- `cand715-e2e-all.log`
- the Playwright traces under `pw-wt/results/`
