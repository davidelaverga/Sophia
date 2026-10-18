# Terms and privacy

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.8): anyone can sign up
> (sophia-dos-espacios), yet the Studio has no terms of use and no privacy notice, and the sign-in page doesn't mention
> either. Every product with open sign-up has both, one press from the door. Luis (2026-10-15): «Términos y condiciones
> lo dejo a tu discreción». Queue item 4.

## What changes

- **`/terms` and `/privacy`** are pages of the Studio that anyone can read, signed in or not, the way `/join` opens
  before sign-in. Vercel already sends every path to `index.html`.
  - `legal.ts`: `legalDoc(pathname)` gives `terms`, `privacy` or null.
  - `LegalPage` draws one document in a reading column. It has the mark, the title, «Last updated 15 October 2026»,
    and the sections. Its foot links to the other document and back to Sophia.
- **The words** (`legal-text.ts`) are plain, short, and say what the product does today:
  - **Terms:** what Sophia is, your account, your content and what we do with it to run the service, acceptable use,
    that AI output can be wrong, invitations and guests, ending, no warranty, changes, contact.
  - **Privacy:** what is kept, who processes it, who sees what, what stays on the device, your choices, how long data
    is kept, no ads or selling, age, changes, contact.
    - The processors are Supabase, LiveKit, Google Gemini, OpenAI, Resend, Vercel and Render.
    - Calls aren't recorded.
- **Sign-in:** under «New here? …», the line «By continuing you agree to the Terms and acknowledge the Privacy notice»
  links to both. The same line stands under an invited member's «Email me a sign-in code» at /join, which may create
  the account too (Codex P2 on #366).
- **The fixture:** `legal.html?doc=terms|privacy`.

## Not here

- Crash reporting and feedback (Sentry) come in their own PR, which adds Sentry to the processors.
- A lawyer's review: these words are the product's honest description, not legal advice. Luis decides whether to have
  them reviewed.

## Checks

- `legal.test.ts`: `/terms` and `/privacy` (with or without a trailing slash) are documents; other paths are not.
- `terms-privacy.spec.ts`:
  - sign-in links to both;
  - each page reads its title, its date and its sections, and links to the other and home;
  - on a phone nothing scrolls sideways.
- `join.spec.ts`: an invited member reads the line before the code is sent (`join.html?kind=member`).
