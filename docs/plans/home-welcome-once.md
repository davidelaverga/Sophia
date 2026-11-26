# Home says «Welcome» on the first visit only

> 2026-11-26 · Luis, on the local stack: «¿Por qué también me dice Welcome, Luis y no me dice el greeting del tiempo
> del día?». Of keeping it or showing «Welcome» only the first time someone reaches Home, he chose «Sí, solo la
> primera».

## What was measured

- Home's greeting is `greeting(hour, name, fresh)` (`places-view.ts`): «Welcome» while `fresh`, otherwise «Good
  morning», «Good afternoon» or «Good evening» by the hour.
- `fresh` is computed on every render in `Places.tsx` from the personal space alone: no turns and no notes. An account
  that uses only the work side (Luis's dev identity on the local stack) never talks to Sophia, so Home says «Welcome,
  Luis» on every visit, at any hour.

## What changes

- **«Welcome» once per account on this browser.** Home says it while the personal space is empty *and* this browser
  has not shown Home to this account before. From the next visit on, the hour's greeting.
- **What counts as a visit:** Home on screen with the personal space read, so the greeting the person saw was the
  real one. It is kept as `sophia.home.seen.<account>` = `1` (`home-seen.ts`). It is read once per page and account,
  so the visit that shows «Welcome» keeps it until the page goes.
- **Storage that can't be read counts as seen:** the hour's greeting, not «Welcome» on every visit.
- **A personal space that isn't empty** still gets the hour's greeting, on a first visit too, as before.
- **Kept on sign-out:** the key holds no words, only that Home was seen; signing in again doesn't welcome back.
- No new words. `greeting` and the fixtures are unchanged.

## Checks, written first

- **Unit** (`home-seen.test.ts`):
  - A key per account.
  - Unseen before anything is kept; seen after; another account stays unseen.
  - A store that throws, or none, reads as seen; keeping into one breaks nothing.
  - `welcomes`: only a fresh space on an unseen account.
- Real stack: Luis's identity, first Home → «Welcome, Luis»; reload → the hour's greeting.
- `prettier --check`, type-aware lint, `pnpm typecheck`.

## What was measured after

- Unit: `home-seen.test.ts` 4 of 4, red before (no module); `places-view.test.ts` unchanged and passing.
- Real stack on Windows (main `f8639a2ba` plus this change, `--runtime rehearse --voice rehearse`), Luis's dev
  identity, whose personal space is empty, at 15 h: the first Home said «Welcome, Luis.» and kept
  `sophia.home.seen.<account>`. After a reload it said «Good afternoon, Luis.».
- `prettier --check`, the type-aware lint on the Studio and the Studio's `tsc --noEmit`: 0.
