# Explicit mentions in the room's chat (A37)

> 2026-10-16 · FND-C3b-EXPLICIT-MENTIONS-01, #365 section 7 (`Refs #365 — section 7`). Migration
> `0069_contribution_mentions.sql`, amendment `A37-contribution-mentions.json` (P's reserved names). Stacked on C3a
> (#396, `95609ec4`). Live room contributions only; saved conversations (0063/A33) are B's.

## What is served

- **Explicit only.** A message names at most five members by their actor ids (`mentions`). The service drops
  duplicates and leaves out the author. A malformed id, a sixth member, or someone who isn't an active member gives
  422.
- **Nothing implicit.** Nothing is parsed from the words (no `@name`), nothing is inferred, no work is woken, nobody is
  notified outside the Studio, and nothing is spent.
- **Who may mention.** Adding or changing a non-empty list of recipients needs an editor or an admin (403 otherwise).
  A viewer still writes, corrects and withdraws their own ordinary words with no recipients, and can be mentioned.
- **Compatibility:**
  - a submit without `mentions` has none;
  - a correction without `mentions` keeps the recipients, whoever has left since;
  - a correction that names a list checks every one, kept recipients too: someone who left is refused (Codex on #409);
  - `[]` clears them;
  - a request without recipients keeps 0068's semantic, so an older client's retry replays its receipt;
  - the A36 v2 proof (echoed taskId:kind:restarts) and the detach-only rule for shared sources are unchanged.
- **Attention follows the committed revision** (C3a). When a correction makes a new revision:
  - a recipient kept and still waiting moves to it, still one item;
  - a recipient kept who has already looked is not asked again;
  - a recipient added is asked;
  - a recipient removed is no longer asked;
  - a withdrawal ends every one.

  The same words with other recipients change only who is mentioned: there is no new revision, nothing is erased,
  revoked, rebuilt or woken, and the event is `contribution.mentioned`. Drafts are never recorded, so they never
  mention anyone. Earlier messages get no recipients.
- **Occurrences** (FND-C3b-ATTENTION-OCCURRENCE-01, V on #409). Each time a recipient is asked anew is its own
  occurrence: named first is 1, and named again after being removed is one more, even with the same words on the same
  revision. A kept recipient keeps its occurrence.
- **Needs** (`GET /api/v1/me/needs?mentions=1`).
  - Without the opt-in the answer is exactly A15's kinds, so a strict reader before A37 never meets the new one.
  - With it, each pending mention is listed while all of these hold: the recipient is an active member, the project
    is not archived, and the message stands on that revision with its words.
  - A listed mention has kind `mention`; title the message's current first words; detail «<author's current label>
    mentioned you» (D-NAMES, never an address); ref `{kind: contribution, id: message, within:
    <revision>.<occurrence>}`; id `mention:<projectId>:<revision>.<occurrence>:<contributionId>`.
- **Seen** (`POST /api/v1/me/needs/{id}/seen`).
  - It marks exactly that occurrence on that revision seen; the current one's seen again changes nothing.
  - A seen saved for an earlier occurrence or revision answers 204 and clears nothing newer.
  - A bare revision (the form before occurrences) or a malformed `within` gives 404.
  - Someone not an active member, or not mentioned, gets 404.
- **Readers.**
  - With `revisions=1`, an entry carries `mentions`: whom it names now, never whether they looked.
  - Without it, the shape is unchanged.
  - The mentions table is reached only through SECURITY DEFINER functions; the API role cannot read it.

## Studio (the `MENTIONS` flag)

- **The flag.** `VITE_SOPHIA_MENTIONS=1` (`src/app/mentions.ts`), separate from VISION. Set it after 0069 and the
  routes are deployed. It also reads the discussion with `revisions=1`.
- **The composer.** An editor or an admin writing to the room sees **Mention**: the other members by their current
  names (A25's members read), as checkboxes, at most five. The chosen ones are said above the bar, sent with the
  message, then cleared. A viewer never sees it. The request carries `mentions` only when someone is chosen.
- **The discussion.** A message that names members says «to Marco and you» under its words.
- **Home** (with its Needs view). A mention is listed with its words and who mentioned. Opening it goes to the
  project's room at that message (`#message-<id>`); the room opens its chat there.
- **Seen.** The chat marks seen exactly the occurrences the Needs read lists as waiting for the reader
  (`useMentionAttention.ts`; never an id made up in the browser). It does so once the message is readable in the open
  chat: at least 60% of it in view, or 60% of the chat's height for a message taller than the chat. A sliver at the
  edge doesn't count. Each occurrence is marked once. Nothing is marked when:
  - the chat is closed;
  - the project failed to read;
  - the message isn't shown.
- **The address** (`#message-<id>`). It brings its message into view once for each time it is followed; later
  messages never pull the reader back.
  - When the message isn't among those shown, at most four earlier pages are read to find it.
  - Withdrawn, or not found by the chat's start: «The message you opened isn't in the chat anymore.»
  - Not found within those pages: «The message you opened is further back.»
- **The members read.** Until it has loaded, nobody is offered and no recipient is named, never «a former member»
  for someone who may still be one.
- **The files:**
  - `features/conversation/MentionPicker.tsx` and `mention-view.ts` (unit-tested);
  - the hooks in `Composer.tsx`, `useRoomMessage.ts`, `Conversation.tsx`, `api/needs.ts`, `useNeeds.ts`,
    `needs-you.ts`, `NeedsYou.tsx`;
  - the fixtures (`fixture-api.ts`, `home.tsx` `mentions=1`, `message-acts.ts`, `data.ts`);
  - the browser checks in `e2e/mentions.spec.ts`.

## Supported corpus and limits

- **Supported:** live room contributions written in the composer, plus corrections and withdrawals through A36. Voice
  contributions and tools send no mentions.
- **Not here:**
  - mentions in saved conversations (CON, B's);
  - Personal;
  - search (C4);
  - vendor notifications;
  - editing recipients from the edit field: the Studio keeps them, while the API can change or clear them.
- **Tracked from C3a, not resolved here:**
  - the internal old-reference hash after a non-contribution erasure;
  - the preview GET holding Cancel.

## Checks

- **`apps/api/src/mentions.db.test.ts`** (real signed API, restricted PostgreSQL, generated parsers):
  - ids, deduplication, self, non-member and the five limit;
  - an editor mentions, a viewer cannot but is mentioned;
  - legacy Needs, submit and discussion shapes, and idempotency;
  - rebinding across revisions (kept waiting, kept seen, added, removed, withdrawn);
  - a stale seen;
  - a mention-only change with no revision or erasure, and `[]`;
  - a viewer's own corrections;
  - membership at write, read and seen;
  - a stale proof changes no recipient;
  - restricted-role table access.

  Mutation checks: a re-pinged seen recipient, or a stale seen that clears, fails it.
- **C3a regressions:** contribution-acts, readiness (not ready without 0069), needs, access, api, profile, runtime,
  media, mission, updates, and research and design.
- **Units:** `mention-view.test.ts`.
- **Browser:** `e2e/mentions.spec.ts`, plus the nearby room, chat and Home specs.
