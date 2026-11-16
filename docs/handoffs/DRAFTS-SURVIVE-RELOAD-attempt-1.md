# Handoff: DRAFTS-SURVIVE-RELOAD

Goal and attempt: DRAFTS-SURVIVE-RELOAD (unsent words in a project conversation's composer or the room's chat are lost
on a reload; `talk-store.ts:1-2`, `viewer-state.ts:3`; Luis 2026-11-16: «es imposible que no se pueda avanzar mucho»),
attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-2`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-2`, branch `studio/drafts-survive-reload` from
`origin/main` `9495c87fc` (through #513; not pushed)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API, no new copy.
Runtime unit: Luis's Windows host (Playwright through the session's `pw.ps1` guard); CI as the run on record.
Existing authority: Luis, the quote above; local only, nothing pushed.
Ending commit/tree: `df73da260`, the last commit that changes code; the next one adds only this record. Files changed
against `9495c87fc`: `apps/studio/src/app/held-in-tab.ts` and its test, `apps/studio/src/app/App.tsx`,
`apps/studio/src/features/conversations/talk-store.ts` and its test, `apps/studio/src/features/studio/useViewerState.ts`,
`apps/studio/src/features/studio/viewer-state.ts` (comments), `apps/studio/e2e/project-conversation-writes.spec.ts`,
`apps/studio/e2e/room-discussion.spec.ts`, `apps/studio/e2e/app-auth.spec.ts`, `docs/plans/drafts-survive-reload.md`,
and this record.

## Outcome

- **Kept in the tab, as a held write is**: `held-in-tab.ts` keeps unsent words in `sessionStorage` under
  `sophia.drafts.v1:` + `[account, part, project]` (accountOf), apart from the held writes (`sophia.held.v1:`), with
  `readTabDrafts`, `keepTabDrafts` and `tabDraftsOnlyOf` (says whether words went). A write the browser refuses also
  drops the older entry, so a reload never brings back words since changed.
- **Conversations**: `talk-store.ts` mirrors each place's drafts with words and their «Ask Sophia» at every change
  (`changeKept`; a send's clear and an erasure's `retired` take them out) and reads them back with the holds.
- **Room chat**: `useViewerState` reads the Converse draft from the tab as the view loads and keeps it at each change;
  the other lenses stay in `localStorage`.
- **Sign-out / another account**: `useDraftsOnlyOfWhoIsIn` calls `tabDraftsOnlyOf(who)`; `forgetAllDrafts` forgets them.
  The existing «Unsent words here were cleared.» now counts this tab's composers' words too. No new words.
- **Bounds**: a draft over 10,000 UTF-16 units, or past the first 20 conversations of a project, stays in the page only.
- **Behaviour change in two existing checks**: after a reload with a message held unconfirmed, the field now shows its
  words, as it did before the reload; `project-conversation-writes` and `room-discussion` «baseline gap #8» read the
  words and then an empty field once sent.

## Evidence

- **Written first and failing** (`44688c8f6`):
  - unit `talk-store.test.ts`: `actual: null, expected: { c1: { text: 'Half a thought', askSophia: false } }`;
    `held-in-tab.test.ts`: `SyntaxError: … does not provide an export named 'draftsKey'` (the API didn't exist).
  - e2e (`pw-logs/drafts-red.txt`): app-auth «drafts ·» both `Expected length: 1, Received length: 0` (nothing kept);
    project-conversation-writes «a draft survives a reload» `Expected: "Half a thought" Received: ""`; both «baseline
    gap #8» checks `Expected: "Did this one land?"` / `"Once only."`, `Received: ""`.
- **Green** (`df73da260`): `project-conversation-writes`, `room-discussion` and `app-auth` through the guard
  (`pw-logs/drafts-green-3.txt`): 119 of 126 ran, none failed, every new and changed check among them; the guard then
  stopped the run for memory (other builders), leaving room-discussion's last 7 (after line 307, untouched here) unrun
  in that run; retries were refused for memory. Units `held-in-tab` 9/9, `talk-store` 34/34, `viewer-state`
  13/13, `ended-notice` 11/11; whole-repo oxlint exit 0; studio `tsc` exit 0; Prettier clean.

## Remaining

- The New conversation form (title and question) is not kept: a start held across a reload would need its key kept.
- Closing the tab still loses the words (`sessionStorage`), by design for shared devices.
