# «Your name»: the account menu edits the name others see

> 2026-10-16 · FND-C1-UI-PROFILE, #365 section 8 (`Refs #365 — section 8`). The Studio half of
> [actor-profiles.md](actor-profiles.md) (#386, A32). Stacked on #386's head `0a21925e`.

## What changes

- **The account menu's head names you by your profile.**
  - It shows the display name your projects see. Without one, it shows your provider's name; without that, your email.
  - The email stays under a name: it is yours to see here, never your name to others.
- **«Your name» in the account menu**, between the head and Your data.
  - It is offered only where the server serves profiles. An API from before A32 answers 404, and the item stays away
    rather than offering a control that fails.
  - A read that fails or is refused still offers it, and its sheet says why.
- **The sheet** (`ProfileSheet`, through `Sheet` and portalled out of the bar as the project's sheets are):
  - **Reading.** It reads the profile once and holds what it read while you type. Nothing refetches its revision
    behind you.
  - **Checks as you type.** A blank name only waits: Save waits as an outline. An address, a hidden character or more
    than 60 characters is said in place, with `aria-invalid`.
  - **Saving.** Save is one admission per edit (`useAdmission`). A new edit gets a new key. With no reply, the field
    turns read-only, «Sophia didn't answer. Try again» appears, and the retry sends the same key and name, so it is one
    edit.
  - **A name changed elsewhere** (409 `stale_revision`): the sheet reads the profile again and says «Changed
    elsewhere to «…». Save to use yours instead.». Your typed name stays, and the next Save goes over the new
    revision.
    - Save waits while that read runs. Only a read that answers becomes the new revision.
    - A read that fails says «Changed elsewhere, and the new name couldn't be read.» with Try again; the old cache is
      never shown as the current name (Codex P2 on #388).
  - **A wait that lasts six seconds**, the first read or a save, adds the Studio's `SlowNote` (Codex P2 on #388).
  - **A name the API refuses** (422) is said in the Studio's words, not the schema's. A refused account (401, 403)
    reads «Sign in again to change your name.»
  - **Saved:** the menu's head shows the new name at once (the same query, updated), and the members' lists are read
    again. Others see it the next time their view loads: the API emits no event for a profile.
  - **Cancel** is shown only while an edit would be dropped; the head's Close closes in every state.
- **One account's name is never read for another.**
  - The profile is cached under the account (`accountOf`: the token's subject), inside that account's own cache
    (`account-cache.ts`).
  - The sheet belongs to the account it was opened for. Another account coming in (another tab) closes it, so nothing
    typed for one is saved for the next (Codex P1 on #388).

The words are in `profile-view.ts` (with tests); `useMyProfile.ts` holds the read.

## Not here

- **No Studio surface is changed besides the account menu.** The room's names are reported for Luis rather than
  changed here: in a call, the room's LiveKit participant name wins over the API's `authorName`
  (`conversation-view.ts` `authorLabel`/`withAuthors`), and a participant without a name is shown by their id's first
  eight characters (`livekit-room.ts`). See the handback for the exact paths and the proposed change.
- **No flag.** The item follows what the server serves, so the change is truthful before and after #386 deploys.
- Avatars, a time zone, and a project event on rename.

## Checks

- `profile-view.test.ts`:
  - blank waits;
  - an address, hidden characters (BEL, newline, U+202E, U+200B, U+2028) and 61 characters are refused;
  - 60 emoji are accepted, counted as the API counts them;
  - Save is offered only for a change;
  - 404 means unavailable, 401/403 signed out, anything else failed;
  - a 422 is said in the Studio's words;
  - the conflict words.
- `e2e/profile-editor.spec.ts`, on the fixture page, whose profile answers as A32 (`fixtures/profile-data.ts`):
  - a trimmed save, with the head naming you by it;
  - refusals in place, and no request for them;
  - a conflict: said, the typed name kept, saved over revision 1 with a new key;
  - a lost reply: Try again sends the same key and body, one edit;
  - a server without profiles: no item;
  - on a phone: Save 40 px and Cancel 36 px, the field inside the screen, a tap saves;
  - in the signed-in app: another account signing in, in another tab, shows its own name, never the last account's.
