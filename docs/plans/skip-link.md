# Skip to content

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, platform). A keyboard reached the page's content only
> after every press of the header (views, Join, Invite, search, the account), on every page. The Studio had no «Skip to
> content». Studio only.

## What changes

- **«Skip to content»,** the first press on every page, shows once focused (at the top left, on the raised plane) and
  takes the focus past the header to the page's content.
- **It moves the focus, never the address.** The Studio's anchors (`#conversation-…`, `#task-…`) live in the address,
  and a jump to `#content` there would close what they opened.
- **Each screen marks its content** (`data-content`): the sign-in and the room's door (`Centered`), the terms, a
  project's view and the Studio's stage, the project's notice, and Home, Personal and Work. The link focuses the first
  marked element on screen. Several screens stay mounted at once (Places' three, a project kept behind a call), so it
  can't be one id.
- It is rendered beside the App (`main.tsx`), and the fixture pages render it as the app does.

## Checks

- **`skip-link.spec.ts`:**
  - signed out, the first Tab shows «Skip to content», and Enter puts the focus on the sign-in's content, the address
    unchanged;
  - in a project's view, it goes to that view's content, past the header.
