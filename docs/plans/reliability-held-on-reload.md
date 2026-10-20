# A message sent with no reply is offered again after a reload, under the same key

> 2026-10-19 · the reliability baseline's gap #8 (`evaluacion-2026-10-19/fiabilidad/linea-base.md` §5; §1.2, §1.7);
> Luis 2026-10-19: «quisiera trabajar en la fiabilidad y resiliencia. Ahí tendríamos que también medir. Lo que no se
> mide, no se puede mejorar» and «Arranca R2 en paralelo». Studio only, no API. Two surfaces, one test-first pair each.

## What was measured

- **Gap #8 holds, on two surfaces.** A message sent with no reply is kept only in this page's memory:
  - a project conversation's message (`ConversationComposer` → `useHeldWrite`, `held-write.ts`): its key and words
    live in `talk-store.ts`'s module `Map`, per project and account, which outlives a trip to another view but not a
    reload;
  - the room's bar (`Composer` → `useRoomMessage`): `useAdmission` keeps its key in a `useRef` and its words in
    component state (`useAdmission.ts:34-36`).
  After a reload neither says anything: the line «Not confirmed: “…”» is gone, and words written again go under a new
  key, so a message the API recorded (its reply lost) can be recorded twice.
- **No `beforeunload` anywhere in the Studio** (`git grep beforeunload pagehide` over `apps/` and `packages/`: only
  three fixture pages, which keep their synthetic service's state across a reload with `pagehide`). So no prompt is
  added: nothing in the Studio sets the precedent, the browser's prompt can't say which message, and a person leaving a
  call or a sign-out would meet it too. Closing the tab still loses the held message; a reload no longer does.
- **What the Studio already keeps, and how** (the discipline followed here):
  - Personal's draft (`personal/draft.ts`): `localStorage`, per account (`accountOf`), with its key; every draft on the
    device goes on signing out (`forgetDrafts`).
  - A project view's drafts (`viewer-state.ts`): `localStorage` per viewer and project, but **not** the chat's: «Chat
    drafts survive resnapshots only» (`viewer-state.ts:3`). Their words go on signing out (`forgetViewerDrafts`).
  - A source review's proposal whose outcome is unknown (`review-proposal.ts`): **`sessionStorage`**, per account,
    project and goal, its key and its request only, kept before it is sent and let go once answered (proposed or a
    definite refusal); every viewer's goes at a sign-out or another account coming in (`proposalsOnlyOf`), and never at
    a page load (`proposalsKeptFor`: undefined while who is in is still found out; Codex's re-review of 6e9e2a9b).
  A held message is the proposal's case: a write in doubt, not a draft. It follows `review-proposal.ts`.

## What changes

- **`app/held-in-tab.ts`**: the held writes this tab keeps, in `sessionStorage` (the tab's, so another tab never sends
  it, and it ends with the tab), under `sophia.held.v1:` + `[account, part, project]` as JSON, so no two accounts,
  parts or projects share an entry. `readHeld`, `keepHeld` (null lets it go), `heldOnlyOf(account | null)`. Storage
  refused or unreadable: nothing is kept beyond the page, as before.
- **Conversations** (`talk-store.ts`): the `holds` of a project and account are mirrored into the tab at every change
  (`changeKept`, so `retired`, an erasure or a withdrawal take them out of the tab too), and read back the first time
  that place is read after a load: each one held with no reply (`sending: false`), its key and words. One on its way
  when the page went is in doubt the same way. `forgetKept` empties the memory only: the App calls it as every load
  finds out who is in (`useAccountCache`), where forgetting the tab would lose exactly what this keeps.
- **The room's bar** (`useRoomMessage`, `useAdmission`): the message is kept before it is sent (its key, words and the
  entry it answers), and let go once answered, recorded or refused for good, and only if it is still that one.
  `useAdmission` takes an optional `resumed` intent (its key and arguments) and starts `unknown` with it.
- **Sign-out forgets them** (`App.tsx`): with the proposals, at once on Sign out (`forgetUnderWay`), and whenever who is
  in becomes someone else or nobody, here or in another tab (`heldOnlyOf(proposalsKeptFor(state))`); never while it is
  still found out.
- The words don't change: after a reload the composer says «Not confirmed: “…”. Send sends it again; it won’t be written
  twice.», the bar «Not confirmed: “…”» with Try again. The field stays empty: only the held message is kept, not the
  draft (the chat's draft never was).

## Checks, written first

- **Fixture lever `server=kept`** (`fixture-api.ts`): the synthetic service outlives a reload, as a real one does. Each
  keyed write that reaches it is journaled in the tab (`fixture.server.journal`) and applied again, unanswered, as the
  page loads. The journal holds each try's key, so a check reads that the press after the reload sent the same one.
- **Browser** (`project-conversation-writes.spec.ts`): `send=lost`: sent, «Not confirmed», reload, the conversation
  opened: «Not confirmed: “Did this one land?”» again, the field empty; Send: the line goes, one message in the thread,
  one recorded, both tries under one key; reloaded again, nothing is offered. `send=slow`: kept in the tab while on its
  way, let go once the reply lands; reloaded, nothing is offered.
- **Browser** (`room-discussion.spec.ts`): the same with `loseNextContributionReply` (Try again; one contribution, one
  key) and with `holdMessages` / `releaseMessages` (the reply that lands lets it go).
- **Browser** (`app-auth.spec.ts`, the real App): a message Davide's tab holds is offered again as the page loads
  (finding out who is in forgets nothing), and Sign out forgets it at once, with another account's.
- **Unit** (`app/held-in-tab.test.ts`, `talk-store.test.ts`): scopes don't meet; a malformed entry is none; only one
  account's stay; storage refused throws nothing; `changeKept` mirrors the holds and a fresh read brings them back
  unsent; `forgetKept` leaves the tab's.
- Specs run: `project-conversation-writes`, `room-discussion`, `conversations-*`, `project-conversations`,
  `project-conversation-follow-ups`, `app-auth`; units of the touched modules.
