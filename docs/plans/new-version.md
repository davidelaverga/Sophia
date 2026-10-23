# A new version is said, with Reload

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, platform). The Studio loads some parts when they are
> first used: LiveKit as a call is joined, the Invite sheet, the PDF viewer, the signed-in Studio itself. After a
> deploy, a tab left open asks for the old files, which are gone. The press fails, and nothing says why. Studio only.

## What changes

- **Vite says it** (`vite:preloadError`, from its preload helper in a build). The Studio now listens.
- **A notice at the top of the page:** «Sophia was updated. Reload to keep going.», with **Reload** and **Not now**.
  - It stays until answered: no timer, unlike the toast, whose eight seconds would let it go unseen.
  - It shows in every state (signed in, signed out, at a room's door). It wraps the App, not one of its screens.
- **The failed load still fails as itself:** the event is not prevented, so the press that needed the part says its own
  error (a join's, the viewer's).
- **Reload never runs by itself:** an automatic one would drop a call in progress.

## Follow-ups (Codex P2s on #415)

- **Heard from the first moment:** App's eager imports (the signed-in Studio warmed beside the sign-in) can ask for a
  part that is gone before React draws the notice. `new-version-early.ts`, App's first import, keeps the word for it.
- **Over the opening:** a sign-in's return shows the opening's overlay (`#entry`, z-index 100) while the signed-in
  part may fail to load. The notice stands over it, so Reload can be pressed at once.
- **Not now gives the focus back** to where it was when the notice came, as the toast's acts do.

## Checks

- **`new-version.spec.ts`** (the app's fixture page):
  - the event shows the notice;
  - Not now hides it, and it comes back with the next event;
  - Reload reloads the page.
