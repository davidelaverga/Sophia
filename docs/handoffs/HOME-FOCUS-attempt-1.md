# Home: the focus outside the list across 860 px, a test that named the wrong button

Goal and attempt: FND-B-UI-FOCUS, attempt 1 (Claude B, coordinator P's packet; same Claude Code session as CON-01 C1)
Starting worktree/commit: `sophia-home-focus`, branch `fix/home-breakpoint-focus`, from main `f6be9fa7cd7b83ca688878390d474f0f2899bf69`

## Outcome

Main's required browser job failed intermittently on `e2e/home-phone-needs.spec.ts:79`, «crossing 860 px leaves a focus outside the list where it was». It failed on main `9de3637d` (job 116865827134) and on #387 (job 116970349945).

- **The product is correct; the spec named the wrong button.** The test kept a live locator, `.hw-col button` `.first()`. On one column (860 px or narrower), Home mounts «What needs you» inside `.hw-col`, before your notes (Welcome.tsx). So after the resize, that locator names the first need row, which is not focused. The test passed only when its first check ran before the list appeared.
- **The repair.** The spec now pins the control itself (`.hw-col .hw-notes`, your notes) and asserts that the one-column list is visible before it checks the focus. The focus assertion is unchanged, and no product code changed.

## Evidence

- **DOM-identity proof**, 5/5 runs, using a throwaway diagnostic spec that was not committed. Before the resize, the focused control was tagged «3 notes →» (`text-button hw-notes`). After the resize to 800 px:
  - `document.activeElement` was still that same tagged element;
  - `.hw-col button` `.first()` resolved to `hw-row` «Ship the retry with the hotfix?…» in `.hw-needs-here`.
- **After the repair:** `home-phone-needs.spec.ts` and `home.spec.ts` with `--repeat-each=3`, cold servers (CI=1), desktop and phone: 87/87.

## Remaining obligations

- The required CI on the pushed head is authoritative. The local browser slot was released, with fixture ports free.
- Luis's UI is untouched.
