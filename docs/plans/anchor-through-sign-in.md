# A link's place survives the sign-in

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §2, fault 4). A link to one conversation, task or resource,
> opened signed out, reached its view but not the thing it named, after a magic link or a provider's sign-in. Studio
> only.

## Cause

- The Studio's routes are paths (`/p/<id>/<view>`), so the view survives: a magic link and a provider return to
  `origin + pathname` (`auth.ts`, `sendMagicLink` and `signInWithProvider`).
- What names the thing inside the view is the fragment, `#conversation-…`, `#task-…` (`resources/link.ts`). The return
  never carries it, and the callback's cleanup drops whatever fragment is there (`withoutAuthParams`).
- A magic link opens in a new tab, so the place has to outlive the tab.

## What changes

- **`return-anchor.ts`:**
  - **On leaving** for a magic link or a provider, the page's anchor is kept with its path in this device's storage.
    Only an anchor a view answers is kept (conversation, task, goal, decision, resource, request). With none, any older
    one is let go.
  - **Back from that sign-in,** signed in, the anchor kept for the same path in the last 30 minutes is put after the
    clean address, once. The view reads it as it opens, as it reads any link.
- **Not kept:** anything else in the fragment, which is how tokens travel. Nothing goes in a query string.
- A sign-in that never leaves the page (a code typed, a passkey) keeps its address as it was. Nothing changes there.

## Checks

- **`return-anchor.test.ts`:**
  - a view's anchor is kept with its path, given back once on that path, and gone after;
  - another fragment (a token, `#top`) is not kept, and lets an older anchor go;
  - another path, or a kept anchor older than 30 minutes, gives nothing back;
  - unreadable storage gives nothing back.
- **The return itself** needs a real Auth service, which the fixture pages don't have.
  - Read through instead: between the callback's address and the view, nothing rewrites a canonical path.
    `useProjectRoute` rewrites only legacy and unknown ones.
  - The view reads the fragment as it mounts (`useAddressed`).
