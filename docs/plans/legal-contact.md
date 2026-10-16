# A contact address in the terms and the privacy notice

> 2026-10-16 · Follows terms-privacy.md. The Contact section pointed only to Send feedback, which needs a DSN, and to
> replying to an email. Codex raised this as a P2 on #366: a request about one's data, or to delete an account, needs
> an address that doesn't depend on the app. It is Sophia's own address, `hello@sophia-ei.com`, the one its emails already come from.

## What changes

- **`legal-text.ts`:**
  - `CONTACT_EMAIL`. The Contact paragraph names it first, then Send feedback.
  - `UPDATED` moves to 16 October 2026, as the file's rule asks for any change of terms.
- **`Legal.tsx`:** the address inside a paragraph is a `mailto:` link. Everything else stays text.

## Checks

- `terms-privacy.spec.ts`:
  - both documents read «Last updated 16 October 2026»;
  - each Contact section links the address with `mailto:`.
