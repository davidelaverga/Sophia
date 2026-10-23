# Home: the focus outside the list across 860 px, a test that named the wrong button

Goal and attempt: FND-B-UI-FOCUS, attempt 1 (Claude B, coordinator P's packet; same Claude Code session as CON-01 C1)
Human owner / executor resource: Davide (merge; no merge authority is held here) / Claude Code session (Claude B) on Davide's Mac, in the worktree below
Native session: unknown (no dsh native session; this is a coding session, not a runtime attempt)
Starting worktree/commit: `sophia-home-focus`, branch `fix/home-breakpoint-focus`, from main `f6be9fa7cd7b83ca688878390d474f0f2899bf69`
Writable scope: this worktree and branch only (`apps/studio/e2e/home-phone-needs.spec.ts` and this record); no product, API, migration or Luis branch.
Runtime unit: none; a local Playwright run inside a browser slot P granted and B released, with the required CI as the run on record.
Existing authority: P's FND-B-UI-FOCUS packet (prove, then repair only the test if the DOM identity confirms it), and P's FND-B-CURRENT-MAIN-01 (integrate current main, push, one automatic review). No merge, deploy or inference authority.
Ending commit/tree and changed files:
- Ending commit: the spec repair is `f374b528876e379c0d9a3e178c8c232fabc98a1b` (tree `b0deaa0cb240a248092d9398e4f7c54bfa2061fb`). This record's own correction is the next commit on the branch; a commit cannot name its own id, so its id and tree are in B's private handback and on #392.
- Changed files: `apps/studio/e2e/home-phone-needs.spec.ts` (the one case at line 79) and this record. No product file changed.

## Outcome

Main's required browser job failed intermittently on `e2e/home-phone-needs.spec.ts:79`, «crossing 860 px leaves a focus outside the list where it was». It failed on main `9de3637d` (job 116865827134) and on #387 (job 116970349945).

- **The product is correct; the spec named the wrong button.** The test kept a live locator, `.hw-col button` `.first()`. On one column (860 px or narrower), Home mounts «What needs you» inside `.hw-col`, before your notes (Welcome.tsx). So after the resize, that locator names the first need row, which is not focused. The test passed only when its first check ran before the list appeared.
- **The repair.** The spec now pins the control itself (`.hw-col .hw-notes`, your notes) and asserts that the one-column list is visible before it checks the focus. The focus assertion is unchanged, and no product code changed.

## Evidence

- **DOM-identity proof**, 5/5 runs, using a throwaway diagnostic spec that was not committed. Before the resize, the focused control was tagged «3 notes →» (`text-button hw-notes`). After the resize to 800 px:
  - `document.activeElement` was still that same tagged element;
  - `.hw-col button` `.first()` resolved to `hw-row` «Ship the retry with the hotfix?…» in `.hw-needs-here`.
- **After the repair**, at `f374b528`:
  1. From the worktree root: `pnpm exec oxlint --type-aware apps/studio/e2e/home-phone-needs.spec.ts`, no error. Then `pnpm exec prettier --check apps/studio/e2e/home-phone-needs.spec.ts`, which passed.
  2. From `apps/studio`: `CI=1 pnpm exec playwright test e2e/home-phone-needs.spec.ts e2e/home.spec.ts --repeat-each=3 --reporter=line --output=<private scratch>/pw-home`.
     - Exit 0: 87 passed.
     - Both config projects ran (desktop, and phone for the `@phone` cases). CI=1 starts cold fixture servers on 5198/5199 and stops them at exit.
  3. Slot release: `lsof -nP -iTCP:5198 -iTCP:5199 -sTCP:LISTEN` found no listener. No process query was run for this slot, so this records only that no fixture server was listening.

## Current main integration (FND-B-CURRENT-MAIN-01)

- Merge commit `e44d4494bde4ea2e741a72f08007d5a0e9d4c015` (tree `2e92bdbcaca272bd41ba18bd19f805b57446319e`), parents `20172ea3` (this branch) and main `330407e4969699e030606d714db6513561a05c9d` (tree `b21ad955`: Luis's #380 room basics and #383 report origin). No conflict.
- Main's 23 changed paths do not touch Home or this spec; the only shared file is the global `theme.css`.
- Local, without a browser slot, from the worktree root at `e44d4494`:
  - `pnpm -s format:check`, `pnpm -s lint` and `pnpm -s typecheck`: each exit 0.
  - `pnpm --filter ./packages/dsh-bundle build`, then `pnpm test`: exit 0. 2437 tests: 2367 pass, 0 fail, 70 skipped.
  - A first `pnpm test` before that build exited 1: 13 files failed with ERR_MODULE_NOT_FOUND, because `packages/dsh-bundle/dist` was not built in this worktree.
  - The Home browser case runs only in the required CI.

## Remaining obligations

- The required CI on the pushed head is authoritative. The local browser slot was released, with no listener on the fixture ports.
- Luis's UI is untouched.
