# Implementation-session handoff

Goal and attempt: SIGN-OUT-SCOPE (the third gaps report, fault 3; Luis: «Procede»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktrees `Sophia-docs` and `Sophia-e2e`
Native session: unknown
Starting worktree/commit: branch `auth/sign-out-scope` from `origin/account/settings` (#398, `5c464095`)
Writable scope: `apps/studio` (auth, App, SignedIn, AccountMenu, SettingsSheet, Places, theme, the room fixture),
`docs/plans`, `docs/handoffs`; no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Procede» (the seven faults, one PR each); merges on green with no open P1.
Ending commit/tree: `a84b3317bfcc` (tree `3d4619e6ba01`), the last commit of `auth/sign-out-scope`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 12 files changed against
`origin/account/settings` at that commit: `e2e/account-settings.spec.ts`, `fixtures/room.tsx`, `src/app/AccountMenu.tsx`, `src/app/App.tsx`, `src/app/SettingsSheet.tsx`, `src/app/SignedIn.tsx`, `src/app/auth.ts`, `src/app/sign-out.test.ts`, `src/app/sign-out.ts`, `src/app/theme.css`, `src/features/personal/Places.tsx`, `docs/plans/sign-out-scope.md`. The review notes below name the commit of each later change.

## Outcome

- **The account menu's «Sign out»** ends this device's session only (`scope: 'local'`).
- **Settings → Account → «Sign out of all devices»** asks first, in place, then ends every session
  (`scope: 'global'`).
  - The words: «Every device signed in to this account is signed out, this one too».
  - The focus starts on «Stay signed in».
- **Either way, what stays on this device goes:** the cached reads, the drafts, what was under way, and an unlock's
  check (App's `leaving`).

## Evidence

- Plan: `docs/plans/sign-out-scope.md`.
- **Measured before:** supabase-js 2.117.1 `GoTrueClient.signOut(options = { scope: 'global' })`, and the Studio
  called it with no scope (`auth.ts`).
- **Written first and failing** (commit of the tests):
  - `sign-out.test.ts` (`endSession`, against a stub);
  - two checks in `account-settings.spec.ts`.
- **After the change, locally:**
  - account-settings, account-menu, app-auth, join and menu-scale: 46/46, then account-settings 8/8 after the layout
    change;
  - sign-out units 3/3;
  - type-aware lint, typecheck and Prettier are clean.
- **Capture:** Settings' Account part asking, its words on their own line and «Stay signed in» focused.

## Decisions and changes

- **A separate callback, never a parameter:** the join page passes Sign out straight to a button's onClick, where an
  optional «everywhere» would receive the click event and read as true.
- **«Sign out of all devices» lives in Settings,** behind a question. Ending every device is rare and can't be taken
  back.
- **Length limits:** `leaving`, `accountActions` and `opening` leave `App` and `SignedIn`.
- **`.settings-part .confirm`** reads from the left, as the room link's and the sessions' questions set theirs.
- **The guest's session** (`endGuestSession`) is unchanged: an anonymous account has only that one.
- **Codex P1 on #410, after the ending commit: a logout that fails.** supabase-js 2.117.1's `_signOut` resolves a
  failed logout (a 5xx, the network) with `{ error }`, having removed this device's session. `endSession` dropped the
  result, so «Sign out everywhere» looked done.
  - The checks came first (`8d748fd6`): the unit checks, and the app's auth spec, which answers the logout 503. Both
    failed.
  - The fix (`d3c0b73e`): asked for every device, a failed logout is `here-only`. The sign-in then says the other
    devices may still be signed in.
  - This device's own sign-out has nothing more to say: its session is gone either way.
  - `app-auth`, `account-settings`, `account-menu` and the sign-in specs passed 65/65.
- **#398's base merged in (`30b0b80d`):** Settings keeps both its new props, `onSignOutEverywhere` and #398's
  `onShortcuts`.
- **Codex P1 on #410, second: a failure that removed nothing.** An expired token whose refresh failed makes
  `_signOut` return that error before removing the session. So a failed call doesn't always mean this device is out.
  - The unit check came first (`397bfe59`) and failed.
  - The fix (`62a7f3cb`): `endSession` listens, while the call runs, for supabase-js's `SIGNED_OUT`. supabase-js says
    it before the call resolves, once it has removed the session.
  - A failed call that removed the session is `here-only` when every device was asked.
  - One that removed nothing throws, and App keeps the person in, as for any sign-out that fails.
  - `app-auth`, `account-settings` and `account-menu`: 34/34.
- **Codex P1 on #410, third: the other devices aren't out at once.** A global sign-out revokes the refresh tokens, and
  an access token already given lives to its expiry. That's 3600 s (`jwt_expiry` in `supabase/config.toml`, Supabase's
  default), and the API checks only signature and expiry (`apps/api/src/auth.ts`).
  - The checks came first (`79d3a88c`) and failed.
  - The fix (`13f68f57`): the question's words live in `EVERYWHERE` (`sign-out.ts`). Its warning says it as it is:
    this one signs out now, the others within an hour, when their sign-in next renews.
  - `account-settings` and `app-auth`: 30/30. Captures (`evaluacion-2026-10-16/capturas/everywhere-*.png`): the
    warning wraps to two lines, desktop and phone.

## Remaining obligations

- Stacked on #398 (Settings). Once #398 merges, this PR moves to main.
- **For Davide (API):** ending the other devices at once means checking the token's session against revoked sessions
  server-side. Noted on issue #365. If `jwt_expiry` changes, the warning's «within an hour» changes with it.
- **A follow-up (Codex P2):** a sign-out that fails keeps the person in but says nothing. A toast there needs App's
  `leaving`, outside React, to reach `useToast`.

## Next bounded action

- Luis: merge #398, then this one on green with no open P1.
- Source IDs consulted: none from the source register. The work read this repository and supabase-js 2.117.1's
  `GoTrueClient.signOut` (its default scope).
