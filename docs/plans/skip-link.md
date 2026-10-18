# Skip to content

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, platform). A keyboard reached the page's content only
> after every press of the header (views, Join, Invite, search, the account), on every page. The Studio had no «Skip to
> content». Studio only.

## What changes

- **«Skip to content»,** first in the tab order on every page, shows once focused (at the top left, on the raised
  plane) and takes the focus past the header to the page's content.
- **On the sign-in,** with a pointer, the address field already holds the focus on arrival (signin-frictions.md): the
  focus is in the content, where the link would take it, so the link stands behind it. Shift+Tab reaches it, past the
  provider row when one shows (Codex P2 on #417).
- **It moves the focus, never the address.** The Studio's anchors (`#conversation-…`, `#task-…`) live in the address,
  and a jump to `#content` there would close what they opened.
- **Each screen marks its content** (`data-content`): the sign-in and the room's door (`Centered`), the terms, a
  project's view and the Studio's stage, the project's notice, and Home, Personal and Work. The link focuses the first
  marked element on screen. Several screens stay mounted at once (Places' three, a project kept behind a call), so it
  can't be one id.
- It is rendered beside the App (`main.tsx`), and the fixture pages render it as the app does.

## Checks

- **`skip-link.spec.ts`:**
  - signed out, the address field holds the focus on arrival; «Skip to content» is reached back from it, nothing
    stands before it (one more Shift+Tab leaves the page, the next Tab comes back to it), and Enter puts the focus on
    the sign-in's content, the address unchanged;
  - in a project's view, it goes to that view's content, past the header.
