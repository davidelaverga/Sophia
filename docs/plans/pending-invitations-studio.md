# Member invitations waiting in the app (A16): the Studio

> 2026-10-14 · Luis: «¿y si la persona está activamente in app?» The API is `pending-invitations-api.md`.

## What changes

- **A band at the head of Home and Work**, «Invitations», with one row per invitation waiting for the signed-in
  person: «Luis invited you to “Onboarding pilot” as an editor» and **Accept**.
  - The inviter is named as the join page names them: an address's first word, capitalised; a given name stays
    whole. With no inviter it reads «You were invited to …».
  - Nothing shows when nothing waits.
- **Accept** runs `POST /api/v1/invitations/{id}/accept`, then does what accepting by the link does: it remembers the
  welcome (who brought them, as what) and opens the project. A refusal is said on the row, in the API's words, and
  the list is read again (an invitation closed meanwhile leaves it).
- The list is read every 20 s, as Work's project list is, so an invitation sent while the person is in the app
  appears within that time. It is read again after an accept, together with the projects.

## Checks

- `pending-invitations.test.ts` checks the line's words: editor, viewer, a given name, an address, no inviter.
- `e2e/home-invited.spec.ts` (Home fixture, `invited=1`, answered by the page as the API would): the band says who, to
  what and as what; Accept posts the accept and opens the project. With nothing waiting there is no band.
- Prettier, type-aware lint, typecheck; unit tests; CI.
