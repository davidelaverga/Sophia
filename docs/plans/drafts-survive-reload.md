# Unsent words survive a reload of the same tab

> 2026-11-16 · informe-pasada-3.md / informe-brechas-3.md (verified open on main 9495c87fc): what a person writes in a
> project conversation's composer or in the room's chat is lost on a reload; Luis 2026-11-16: «es imposible que no se
> pueda avanzar mucho». Studio only, no API, no new words.

## What was read

- **Conversations** (`talk-store.ts:1-2`): each conversation's draft and its «Ask Sophia» choice live in the module's
  `Map`, per project and account, «while the Studio is open». A trip to another view keeps them; a reload does not.
- **The room's chat** (`viewer-state.ts:3`, `storedViewerState`): the Converse draft is left out of the view's
  `localStorage` on purpose («Chat drafts survive resnapshots only»); the other lenses' drafts are kept on the device.
- **The tab already keeps one kind of thing across a reload**: a message sent with no reply (`held-in-tab.ts`,
  reliability-held-on-reload.md): `sessionStorage`, under `sophia.held.v1:` + `[account, part, project]` (accountOf, the
  token's subject), forgotten for every account but the one in (`heldOnlyOf`) and for all at a sign-out
  (`forgetHeld`); storage refused, nothing kept beyond the page.
- **Sign-out** (signed-out-elsewhere.md): App's `useDraftsOnlyOfWhoIsIn` clears Personal's drafts and the views' words
  once nobody is in, and the sign-in adds «Unsent words here were cleared.» only when some went. Its limits name the
  conversation's words as not counted (they were only in memory).
- **No `beforeunload`** anywhere in the Studio (reliability-held-on-reload.md): none is added.

## What changes

- **`held-in-tab.ts` keeps drafts too**, beside the held writes and in the same way: `sessionStorage` (the tab's: they
  end with the tab, and another tab opened anew never shows them; a tab duplicated from this one starts with a copy of
  its session storage, so it shows them, to the same account only), under their own prefix `sophia.drafts.v1:` +
  `[account, part, project]`, so a held write's checks and the drafts' never meet. `readTabDrafts`, `keepTabDrafts` (null lets them go),
  `tabDraftsOnlyOf(account | null)`, which says whether unsent words went. A draft longer than `DRAFT_MOST` (10,000
  UTF-16 units, past every composer's most) is not kept beyond the page; a project's conversations keep at most
  `DRAFTS_MOST` (20) drafts in the tab. Storage refused or full: kept for this page only, as before.
- **Conversations** (`talk-store.ts`): each change to a place's `drafts` or `asks` is mirrored into the tab (`changeKept`,
  as the holds are: a send that clears the draft, or an erasure's `retired`, takes it out too), each draft with words
  and its «Ask Sophia» choice; read back the first time the place is read after a load, with the holds.
- **The room's chat** (`useViewerState`): the Converse draft is read from the tab as the view loads and kept there at
  every change, under `part: 'room'`. The other lenses stay in `localStorage` as they are.
- **Sign-out and another account** (`App.tsx`): `useDraftsOnlyOfWhoIsIn` calls `tabDraftsOnlyOf(who)` with the others,
  so another account coming in forgets everyone else's, nobody in forgets all, and the clause counts this tab's
  drafts too (no new words: the existing «Unsent words here were cleared.»). A Sign out forgets them at once with every
  other draft (`forgetAllDrafts`).
- **After a reload with a message held** the field shows its words again, as it did before the reload (the draft is
  cleared only once the message is in). The checks that read an empty field after such a reload now read the words.

## Review round (independent review: no P1/P2; its P3s)

- **A state kept only under its own key** (`useViewerState`, `viewer-state.ts` `ownedBy`): neither the view's
  `localStorage` save nor the chat's tab write runs while the state rendered is not the one loaded for the key (the
  viewer or project just changed, or the hook used unkeyed): one viewer's words are never written under another's key.
- **A sign-out that fails keeps the words** (`App.tsx` `leaving`): the drafts still go before the call and again once it
  settles (`signOutForgetting`: words typed meanwhile never stay after a sign-out), but the tab's are taken
  (`takeTabDrafts`), not dropped, and put back (`putTabDraftsBack`) when the person stays in. Each take keeps the words
  as they last stood.
- **Drafts of a conversation gone while the page was away** (`goneFrom`): a draft with words counts as known here, as
  a conversation seen listed does, so a whole list without it settles it (its tab entry goes) and a list of the newest
  only has it read directly, as it would before the reload. It holds no `DRAFTS_MOST` slot for long.

## Checks, written first

- `held-in-tab.test.ts` (unit): drafts and held writes don't share a key; `tabDraftsOnlyOf` keeps one account's, says
  whether words went, leaves the held writes; storage refused throws nothing.
- `talk-store.test.ts` (unit): a draft and its «Ask Sophia» are kept in the tab and read back after a reload; an empty
  draft or one too long is not kept.
- `project-conversation-writes.spec.ts` (e2e): type, reload, the words are back in the same composer; another
  conversation's composer is empty; after Send, a reload shows it empty.
- `room-discussion.spec.ts` (e2e): the same for the room's chat bar.
- `app-auth.spec.ts` (e2e, the real App): Davide's words come back after a reload; after Sign out the tab keeps none;
  Luis coming in from another tab finds the composer empty and none of Davide's words in the tab. Review round: a
  sign-out that fails leaves his words in the tab, back after a reload.
- Review round (unit): `viewer-state.test.ts` `ownedBy` for a viewer change; `held-in-tab.test.ts` take and put back;
  `talk-store.test.ts` `goneFrom` counts a draft read back.

## Limits

- Closing the tab loses them: `sessionStorage` ends with the tab, which keeps a shared device's words from outliving it.
  Personal's draft (`localStorage`) is unchanged.
- The New conversation form's title and question are not kept: a start held across a reload would need its key too,
  which the tab does not keep. Only the open conversations' composers are.
