# Sign out signs out this device; all of them, when asked

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 3). «Sign out» ended the session on every device
> the account was signed in on: `supabase.auth.signOut()` with no scope is `global` in supabase-js 2.117.1
> (`GoTrueClient.signOut`, `options = { scope: 'global' }`). The Studio already asks for `local` where it means this
> device (`provider-leave.ts`). Studio only; it builds on Settings (#398).

## What changes

- **The account menu's «Sign out»** ends this device's session only (`scope: 'local'`): Supabase revokes this session,
  and other devices stay signed in.
- **Settings → Account → «Sign out of all devices»** asks first, in place (`ConfirmButton`):
  - the words: «Every device signed in to this account is signed out, this one too»;
  - the safe answer: «Stay signed in»;
  - confirmed, «Sign out everywhere» ends every session (`scope: 'global'`).
- **Both go through App's leaveSession,** so what stays on this device goes either way: the cached reads, the drafts,
  what was under way, and an unlock's check.
- **A separate callback, never a parameter:** the join page passes Sign out straight to a button's onClick, where a
  parameter would receive the click event and read as «everywhere».

## Checks

- **`sign-out.test.ts`:** `endSession` asks Supabase for `local`, and for `global` only when asked for every device.
- **`account-settings.spec.ts`:**
  - Settings offers «Sign out of all devices»; pressing it asks, with the focus on «Stay signed in», and staying gives
    the focus back;
  - confirmed, it signs out everywhere (the fixture goes to the sign-in, saying so);
  - the menu's Sign out goes the device's way.
