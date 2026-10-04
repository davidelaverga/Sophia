# Implementation-session handoff

Goal and attempt: M75 (finish PR #75 as the reader/rendering foundation and fixed-template control), attempt 1  
Human owner / executor resource: Davide / Claude Code desktop session on Davide's Mac  
Native session: Claude Code local session; its URL is not available to the agent  
Starting worktree/commit: a fresh clone of `davidelaverga/Sophia`, branch `claude/smc-m03-report-v2` at `86f70aa`, base `main` `2712f2c`  
Ending commit/tree and changed files: the candidate named in M75-CC-0002 on #31; changed files in `docs/progress/M75.md` §2 and the PR's diff

## Outcome

The browser-side html-report-v2 conversion is marked, in code and in CONTRIBUTING, as the fixed-template seed/control and legacy compatibility, never a design; its four Studio callers are pinned by a test and mapped, with the API receipt and guide declarations that route an HTML request to it, in `docs/coordination/M75/HANDOFF_TO_SDD01.md`. The page's checks are split into general report-page checks (reusable on a designed page through `Marks`) and the seed profile's. Italian and Spanish fixtures found a contents-rail clipping defect, fixed. Codex's findings on `86f70aa` (M75-RF-0001 reader touch targets, M75-RF-0002 handoff and wording, M75-RF-0003 English running head in print) are fixed in the candidate.

Not done and not claimed: native design, visual review, stored designed HTML, SDD-01, the design policy in production, a merge, a release, any hosted or real-app verification.

## Evidence

`docs/progress/M75.md` §3 and M75-CC-0002: `pnpm check` (baseline and candidate), focused unit runs per commit, the four report browser specs and the full Studio browser suite, the v1 counterexample run, mutation checks for every fix. Screenshots inspected for the Italian contents rail (1280), the Spanish page in dark on a phone and the reader's citation line (390, touch) are local evidence only, not committed. Sources consulted: the pack's 00, 01, 02, 03, 05, 06, 07, 08 and launch prompts; AGENTS.md, CONTRIBUTING.md, the unified continuation's start; PR #75's description, commits, reviews and threads; issue #31 (M03 history and M75-CX-0001..0003).

## Decisions and changes

M75 keeps every identity frozen (`pdf-report-v1`, API, guide, runtime unit, migrations, contracts). html-report-v2's bytes changed twice within this unreleased profile (the contents rail; the running head for IT/ES only), each with its pin and reason. A short link or code span now binds with its citation in the reader (a narrowing of an earlier "never bind a link" rule: nothing is split). No new product route, no "basic HTML" offer, no changed Studio wording.

## Remaining obligations

Codex's recheck of the exact candidate; Luis's integration review; Davide's decisions (merge-only or hold, the pack's installation path, any reader-only release). The gate-wording question beside unread sources is open. No effects, spend or hosted state to reconcile from this attempt.

## Next bounded action

Davide resumes Codex: `M75: read M75-CC-0002 on https://github.com/davidelaverga/Sophia/issues/31, recover the exact candidate and operation revision, and act only within its scope.` Claude resumes on Codex's result to fix or close findings. SDD-01 starts from the final M75 head with `HANDOFF_TO_SDD01.md`.
