# Implementation-session handoff: sign-in, attempt 1 (the frictions out)

- **Goal and attempt:** this is slice 1 of the sign-in's "$20" pass ([design note](../plans/signin-frictions.md)), from the critique Luis approved.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `signin/frictions` from main `eb05760`, 2026-10-04.
- **End:** content commit `ece2872`; its checks ran on it.
- **Writable scope:**
  - `apps/studio/src/app/`: `SignIn.tsx`, `ProviderButtons.tsx`, `auth.ts`, `mail-home.ts` (new), `theme.css` and `vite-env.d.ts`;
  - a fixture page and the checks;
  - the design note.

  **No contract or API changed.** `VITE_AUTH_PROVIDERS_SOON` is gone, and a deploy that sets it now shows nothing for it.

## Outcome

See the design note: the focus where the next step is, the page's own check of an address, an inbox one press away, send again after 60 s (Auth's own window), no "coming soon" tile, and three type sizes on a quiet screen.

## Evidence

- **Checks:** 11 browser checks (`signin ·`, on `fixtures/signin.html`; two on a phone), 3 unit tests (`mail-home.test.ts`) and 1 more in `auth-words.test.ts`:
  - the focus on arrival with a pointer, and not on touch;
  - an address that can't be one: the page's words, the field marked and focused, the form `noValidate`, nothing sent, and typing clearing it;
  - once sent: the code focused, "Open Gmail" for a Gmail address, and nothing for another domain;
  - send again: waiting 60 s on the page's held clock, sending once, saying so, and waiting again with the focus; asked too soon, taking Auth's wait;
  - "Use another email" focusing the address; on a phone, the code not focused and "Open Gmail" in view;
  - the service out of reach: said, the address kept and focused, the field not blamed;
  - type sizes in and out of the sent step: 26 (22 on a phone), 14, and 10.5.
- **Mutations, each killed:**
  - with no focus on arrival or after an error, 2 checks fail;
  - a domain matched loosely (`gmail.com.evil.test` would open Gmail) fails its unit test.
- **Captures,** desktop and phone: arrival, error and sent.
- **Code review:** one P1 and one P2, both fixed.
  - **P1:** Send again waited 30 s, but hosted Auth refuses a second email to one address within 60 s, so it would have failed in production. It now waits 60 s, and a refusal's own seconds restart the countdown, checked with the fixture's `limit=1`.
  - **P2:** the 14 px rule (`:is()`, two classes' weight) outgrew the invitation's 10.5 px session label. It now uses `:where()`. No fixture renders the invitation, so this is checked by reasoning, not by a check.

  Its P3s are fixed too:
  - the code takes the focus only with a pointer;
  - a second press can't send twice, and the button keeps the focus while it waits;
  - "Sent again" says only the newest link and code work;
  - "Use another email" focuses the address;
  - only the address's own error describes the field;
  - the countdown checks hold the clock.

  Noted, not changed: passkey autofill (conditional UI) together with the focus on arrival can only be checked by hand, in Chrome and Safari on sophia-ei.com.
- **Mutations after the review:** sending twice, and ignoring Auth's wait, each fail their check.
- **Gates:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm contracts:check` and the Studio's build pass. `pnpm test`: 676, plus the 5 known Windows failures. `test:browser --repeat-each=2`: 382 of 382.
