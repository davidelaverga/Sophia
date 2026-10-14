# The account menu says who you are; the theme in one row; the demo's menu answers

> 2026-10-13 · `evaluacion-2026-10-13/informe-cuenta-20.md`, findings 2–5. Luis: «Sí, empieza con la PR 1 y súmalo a
> #307». The name others see (finding 1) waits for the API, asked in #307.

## What was measured

- The menu's head says the email only: not the name the provider gave, not the picture, not how the person signed in.
- The theme takes three of the menu's rows (Dark, Light, Follow the system).
- In a project, «Your data» takes you home: it is the personal space's data, which the label doesn't say.
- In the demo, «Your data», «How privacy works» and «Sign out» do nothing (the fixture's actions are empty).

## What changes

- **The head**: the avatar (the provider's picture, else the initial), the name when the provider gave one, the email,
  and how they signed in, in the third ink: «Signed in with Google», «with GitHub», «with an email code»
  (`signedInWith`, from the session's `app_metadata.provider`). Locally the dev choice stays as it is.
- **The theme in one row**: «Theme» then Dark · Light · System, still the menu's radio items (the arrows move through
  them as through any item), the one on lit instead of dotted.
- **In a project, «Your personal data»**; in the places, «Your data», as before.
- **The demo answers**: How privacy works opens its sheet; Your personal data goes to the personal space, as the app
  goes home; Sign out goes to the sign-in. The demo's viewer signed in with an email code.

## Checks

- `profile.test.ts`: the provider read from the session (Google, GitHub, an email code, nothing known) and the words.
- `e2e/account-menu.spec.ts`: in the demo's project the head says the email and «Signed in with an email code»; the
  theme's three choices stand on one row and Light turns on; the data item reads «Your personal data»; How privacy
  works opens its sheet; Sign out reaches the sign-in.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the menu's suites
  (menu-scale, press-answers, control-heights) on CI.
