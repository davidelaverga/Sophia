# Archive writes and Work's «Archived»: follow-ups to #368

> 2026-10-19 · three P2s left on #368 (archiving a project), verified still open by the triage
> (`evaluacion-2026-10-16/seguimientos-triage-2026-10-19.md`): «Keep the archive retry key beyond the sheet lifetime»
> with «Reuse the unarchive key after a lost reply» (one store answers both), «Track the Work-side unarchive mutation»
> and «Surface failures from the archived-project read». Luis 2026-10-19: «Entonces sigue trabajando en lo que viene
> mientras esperamos». Studio only; no API, no contract.

## What was read

- **The keys live with what pressed.** `useArchiveWrite` keeps its keys in a `useRef` Map owned by the sheet or the
  line (`Archive.tsx`). Closing the sheet after a write with no reply and opening it again draws a new key.
  `useUnarchive` draws a new one on every press, and Work calls it per press (`Places.tsx`, `Work`). The API keeps one
  receipt per actor and key (migration 0059), so the same key is what makes a retry the same write.
- **Work forgets its Unarchive.** `Places.tsx` fires `void unarchive(id).catch(toast)`. `onUnarchive` returns nothing
  (`WorkSpace.tsx`), and the row's button always says Unarchive, with no wait: each press is one more POST.
  «Bringing back…» already exists in the line inside the project.
- **A failed read looks like none.** `useArchivedProjects` returns `read.data?.projects`, so a failure is `undefined`.
  Work passes only that to `WorkSpace`, and `ArchivedFold` draws nothing, as if none were archived. Inside the
  project, `useIsArchived` reads it as not archived and the line draws nothing, which claims nothing.

## What changes

- **`archive-keys.ts`, one store for the page:** a key per account, project and choice (archive, or bring back),
  shaped like `removal-keys.ts` but kept by the page, not by a component. A write with no reply keeps its key, so the
  next press of the same choice, from the sheet opened again, the line or Work's row, sends it under the same key.
  Once answered, landed or refused, the key goes: the rule of `api/README` and `held-write.ts` (kept after
  `retry: same_admission_key`, let go otherwise). A choice that lands also lets go of the other choice's unanswered
  key (review on this branch): that write is moot, and its key replayed later would get its old receipt and change
  nothing, while a new key is always safe, since migration 0059 changes nothing when asked for the state the project
  has. `useArchiveWrite(identity)` takes the project and the choice at the press. `ArchiveSheet` and `ArchivedLine` use
  it as before.
- **`useArchivedWork(identity)`, Work's side in `Archive.tsx`:** what Places hands `WorkSpace` as `archived`.
  - Unarchive goes through `usePresses` (`presses.ts`), as Take back does. While it's on its way, the row says
    «Bringing back…» with `aria-disabled`, and a second press sends nothing.
  - A failure is said on the row, in the line's words (`failure`: the API's words, else «Couldn’t bring the project
    back. Try again.»), as a failed removal is said on its row in «In this project». It stays until the next press.
    The toast goes.
- **The read's failure, where «Archived» goes:** the hook also hands a `Read` (`READ_FAILED.archived`, «Couldn’t load
  your archived projects.»). `ArchivedFold` draws it with Try again, through `FailedReads`, the failed half of
  `ReadNotes`, taken out so the fold doesn't add a second slow note. Inside the project nothing changes: no line, and
  no claim either way.
- **Inside the project, archived is known or not (Codex P2 on #469):** `useIsArchived` answered false while the archived
  list loaded, and for good when it failed, so an admin opening an archived project was offered «Archive project…»;
  confirming re-sent the idempotent archive, yet still ended the call and went to Work, what #469 meant to prevent.
  `useArchiveStatus` answers `archived`, `not-archived`, or `unknown` while the read has nothing (loading, or failed
  with nothing read before). The project-name menu offers «Archive project…» only when `not-archived`; `ArchivedLine`
  draws only when `archived`, as before, and Work is untouched.
- **`fixtures/work-space.tsx`:** `WorkSpace` handed by the Studio's own hooks, over an API answered in the page, with
  levers for the checks (`unarchive=lost|hold|fails`, `archivedFails=1`). `workSpaceFixture.keys` records each POST's
  key.

## Checks, written first (browser)

`archive-project.spec.ts`:

- **Keys:** the archive POST's reply lost, Cancel, the sheet opened again, Archive → the same Idempotency-Key. In
  Work, Unarchive's reply lost, pressed again → the same key.
- **Tracking:** the reply held → the row says «Bringing back…», a second press sends no second POST, and the row
  goes once it's answered. The reply refused (503) → the row says «That didn’t go through. Try again.» and offers
  Unarchive again.
- **The read:** `GET /api/v1/projects/archived` answering 503 → after the list, «Couldn’t load your archived
  projects.» with Try again, which brings the fold. Inside an archived project whose read fails, no line claims
  anything (a guard: it already holds).

- **Archive while unknown (#469):** the room with `hold=archived` (a new lever: the archived list's reads wait for
  `fixture.releaseArchived`): archived, the menu has no «Archive project…» while held, nor once let through; not
  archived, none while held, offered once let through. With `archivedFails=1`, after the refusals and their retries,
  none either.

`archive-keys.test.ts` (unit) pins the store's rule, including, from the review: an archive's reply lost, the
project then brought back here, Archive pressed again → a new key, not the lost archive's (and the mirror for Unarchive);
a refusal or no reply leaves the other choice's key.

## Limits

- The store lasts as long as the page and is keyed by account, its token's subject (see «Keys by the account, not the
  address» below). Signing out and back in reads the archived list afresh, which lets go of a key already left with no
  reply when that read starts, so the retry after it is a new write. A write still on its way across the sign-in is the
  case of the next limit: a press before any read has answered since its loss still sends the old key. A reload starts afresh, as a held write's does.
- A reply lost after the write landed, then another admin brings the project back: closed by «A read lets go of an
  unanswered key» below (Codex P2 on #471).
- After Unarchive lands, its row leaves the fold and the focus falls to the page, as before. Take back sends the focus
  to Work's heading; Unarchive could do the same.
- While the archived list can't be read, an admin can't archive from inside the project either: Archive comes back
  once a read answers (the lists are read again on focus and after writes). Saying so in the menu is left for later.
- The sheet's Cancel during «Archiving…» and Work's empty state with archived projects wait for Luis's answers.

## A read lets go of an unanswered key (Codex P2 on #471)

> 2026-10-20 · Codex P2 on #471 (`archive-keys.ts:44`), the last entry but one of
> `evaluacion-2026-10-16/seguimientos-p2.md`. Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de
> Davide»; earlier «Lo que no se mide, no se puede mejorar». Studio only; no API, no contract.

**What was read (it holds).** An archive lands and its reply is lost: the key stays (`settled` with no reply). The
real API emits `project.archived`, and the room's feed reads the archived list again (`useProjectFeed.ts`,
`archiveDue`), so the line says archived. Another admin brings it back: `project.unarchived`, read again, the line
goes, and the menu offers «Archive project…». The key is still there, since only this page's own Unarchive landing
lets go of it. Archive sends it again. Migration 0059 finds the receipt (`ON CONFLICT … DO NOTHING; IF NOT FOUND …
RETURN prior.receipt`) and changes nothing. `useArchiveWrite` resolves, so the sheet closes, the call ends and the
person goes to Work, with the project not archived. The mirror holds for Unarchive, from the line or Work's row.

**Rule.** A read of the archived list that *starts after* a write was left with no reply says where the account's
projects stand. Once it answers, the next press is a new choice made on what it shows, so that write's key goes,
whatever the read shows. This doesn't mean the old write is over (see Limits):

- in the state the write asked for: the write landed, or an equal one did. A new key asking for that state changes
  nothing (0059: «asking for the state it has changes nothing and emits nothing»);
- in the other state: either the write never landed, and a new key is that same choice, safe; or it landed and was
  undone elsewhere, this case, where the old key would be answered with its old receipt.

Waiting for «archived, then not» would miss the undo that comes before any read. That happens when the other admin is
quick, or the feed is held, or the tab sleeps. So the rule doesn't look at what the read shows. A read that started
before the failure doesn't count, nor one that started while the same key was on its way again. Only its own answer
settles that write. The key goes only on a read that answered: a failed read leaves it, so a retry with no news is
still the same write. Keys of other accounts stay.

**Where.** `archive-keys.ts` gains `reading(account)`, called as the read starts. It returns what to call once the read
has answered. `settled` with no reply marks the key with a moment (a counter, not the clock). `keyFor` clears the mark,
as the key is on its way again. `useArchivedRead`'s `queryFn` (`Archive.tsx`) calls it around
`listArchivedProjects`. Every read of the list goes through it: Work's fold, the line, the menu's status, and the
feed's re-reads. So the sheet, the line and Work's row all get the rule.

**What stays.** The retry after no reply, with no read between: Cancel, the sheet opened again, Archive, or Work's
Unarchive pressed again. It is still the same key, and both checks above stay as they are. Nothing new is drawn.

In the real room, though, a landed write usually brings a read: the API emits `project.archived`, and the feed reads
the archived list again. So a retry there usually goes under a new key. The project is archived by then, so the menu
offers no Archive. The sheet left open still does, and its press is answered as a no-op success (0059 changes nothing).
The same-key retry matters most when no read answers: no network, or a feed that doesn't hear.

**Checks, written first.**

- `archive-keys.test.ts`: a lost archive, then a read started and answered, then Archive → a new key, whichever state
  the read could show (no content is read). The same for Unarchive. A read started before the failure, or while the
  key was on its way again, leaves it, also when the read answers after that send is lost too (review). Another
  account's read leaves it.
- `archive-project.spec.ts`: in the room, the first archive lands and its reply is lost. An event brings the read that
  shows it archived. Another admin then brings it back (a new lever, `window.fixture.unarchivedElsewhere`, the mirror of
  `archivedElsewhere`), and the line goes. Archive is pressed again → a new Idempotency-Key, not the lost one's, and
  it is served as a second archive (review: the fixture now replays a key sent again with its first receipt, as 0059
  does, and records `archive:replayed`).

**Limits.** A press after the reply was lost, with no read answered since (offline, then back, and pressed before any
read lands), still sends the old key. If the write landed and was undone in that window, the old receipt answers.
The page reads the lists again after it, so it shows the truth. Closing that would mean a read before every retry,
which costs the same-key retry its point.

A request the client gave up on can still land. A 504 may commit later (`client.test.ts`), and the client stops
waiting at 90 s (`WRITE_TIMEOUT_MS`). Take K1, an archive held past 90 s: the read that follows lets go of it. K2 then
lands, and an admin brings the project back. K1 finally reaches the database and archives it again. The feed's event
has the lists read again, so the page shows it archived, but nobody asked for it then.

## Keys by the account, not the address (Codex P2 on #473)

> 2026-10-20 · Codex P2 on #473 (`Archive.tsx:30`), the last entry of `evaluacion-2026-10-16/seguimientos-p2.md`.
> Luis 2026-10-20: «Procede con el próximo lote y arregla tú los de Davide»; earlier «Lo que no se mide, no se puede
> mejorar». Studio only; no API, no contract.

**What was read.** `Archive.tsx` hands the store `identity.name`, the email, as the account: in `reading` and in every
choice (`useArchiveWrite`). The store is the page's (`keys`, at module level), so it outlives a change of account in
the tab. Everything else this browser keeps per account keys by `accountOf`, the token's subject (`account-cache.ts`,
`held-in-tab.ts`, `browser-account.test.ts`): two accounts can share an address (one deleted, a new one made at it).

**Codex's case, checked.** A's Unarchive gets no reply, B (same address, another subject) comes in, and B's read of
the archived list lets go of A's key. True, but A never retries under it anyway: A coming back gets a cache of its own
(`cacheFor`), so its archived list is read afresh before any Archive or Unarchive is offered, and that read lets go of
the key under the rule above. What the shared account string does show is the other way round:

- A presses Unarchive in Work, and the tab moves to B while the write is on its way. B's Work reads the list (still
  archived) before A's write is left with no reply, so that read keeps the key. B presses Unarchive on the same project:
  `keyFor` finds A's key under the same `[email, project, false]` and B sends it, under B's token. The API keeps
  receipts per actor and key (0059), so B's write is still B's own, but a key is one person's retry and never
  another's, and B's answer then lets go of A's.

**Change.** `Archive.tsx` computes the account once, `accountOf(identity)`, and hands it to `reading` and to each choice.
The store is unchanged: its `account` is whatever string keys a person, and `at()` keeps it whole. `archivedKey`, and
the lists invalidated after a write, stay under `identity.name`: they live in the account's own query cache, which
`App` already keys by subject, as every `['projects', name]` read does (`usePersonal.ts`, `useProjectFeed.ts`).

**Checks, written first.**

- `app-auth.spec.ts` (the real App, two accounts at one address): Davide's Unarchive held, the tab moves to the other
  account, Davide's reply then lost; the other account's Unarchive carries a key of its own, not Davide's.
- `archive-keys.test.ts`: with the accounts as `accountOf` gives them, B's read keeps A's unanswered key, and B's choice
  gets its own; the same account under a new address keeps its key. These pin the store's side; they pass before the
  change, since the store never read the address itself.

**Limits.** None new. The same account under a new address (`USER_UPDATED`) keeps its key in the store now, but the
address is in `archivedKey`, so the list is read again under it, and that read lets go of the key as any read does.
