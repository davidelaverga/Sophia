# A contact address in the terms and the privacy notice

> 2026-10-16 · Follows terms-privacy.md. The Contact section pointed only to Send feedback, which needs a DSN, and to
> replying to an email. Codex raised this as a P2 on #366: a request about one's data, or to delete an account, needs
> an address that doesn't depend on the app. It is the domain's mailbox, `info@sophia-ei.com` (first written as
> `hello@sophia-ei.com`, which receives no mail; see «The address» below).

## What changes

- **`legal-text.ts`:**
  - `CONTACT_EMAIL`. The Contact paragraph names it first, then Send feedback.
  - `UPDATED` moves with it, as the file's rule asks for any change of terms (16 October 2026 then; 23 October 2026
    after the refresh below).
- **`Legal.tsx`:** the address inside a paragraph is a `mailto:` link. Everything else stays text.

## Checks

- `terms-privacy.spec.ts`:
  - both documents read the new date;
  - each Contact section links the address with `mailto:`.

## Refresh (2026-10-22, for 23 October 2026)

> Luis asked which contact channel works without a session. The coordinator's answer, built here: the address Sophia's
> emails already come from, `hello@sophia-ei.com`, as this branch already did. Luis confirms the mailbox receives
> mail before the PR moves.

- **Main merged in** (about 1,900 commits): no conflicts. Main's current Legal page and text stay as they are (the
  skip link, Tavily and Jina, passkeys); the change re-applies on top: `CONTACT_EMAIL` named first in both Contact
  sections as a `mailto:` link, then Send feedback where it's offered.
- **`UPDATED` is 23 October 2026,** the day this is meant to land; if it lands later, the date moves again with it.
- **Nothing else sends a signed-out person to a channel that needs a session.** Send feedback is offered only signed in
  and only with a DSN (account menu, Settings › Help); «reply to any email» is gone; the sign-in, the code step and the
  page that couldn't open name no channel; the privacy notice's «write to us (see Contact)» now leads to the address.
  The address appears once in product code (`legal-text.ts`); no personal address appears anywhere.

## The address (2026-10-23)

> Luis: «Hello@sophia no creo que reciba correo». The domain's DNS (GoDaddy) points its mail at Microsoft 365, and its
> GoDaddy panel shows one mailbox, `info@sophia-ei.com`; there is no `hello@`. Luis chose «Usar info@ tal cual»: no
> alias or new mailbox, nothing changed in the domain's account.

- `CONTACT_EMAIL` is `info@sophia-ei.com`. Both Contact sections link it with `mailto:`, then Send feedback where it's
  offered. `UPDATED` moved again to the landing day (see «Landing»).
- Written first: `terms-privacy.spec.ts` names `info@sophia-ei.com`; red on the old address («Expected:
  "mailto:info@sophia-ei.com"», element not found, terms and privacy), green after.

## Landing (2026-10-24)

- It lands on 24 October 2026, so `UPDATED` and the spec move to that day: written first `de8499a73` (red: «Expected
  substring: "Last updated 24 October 2026"», received 23 October, terms and privacy), then the date.
