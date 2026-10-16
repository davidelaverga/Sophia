# A member corrects or withdraws their own message (A36)

> 2026-10-16 · FND-C3a-OWN-CONTRIBUTION, #365 section 4 (`Refs #365 — section 4`). Migration
> `0068_contribution_revisions.sql`, amendment `A36-contribution-correction.json` (P's namespace rev4). Source policy:
> P's `decision-C3a-source-policy.json` (erasing correction and withdrawal behind the signed preview), not an
> operational approval. Live room contributions only; saved conversations (0063/A33) are B's, and mentions are C3b.

## What is served

- **Who may act.** Only the message's author, an active member: a viewer too, on their own ordinary talk (A06). Nobody
  acts on another person's message, admins included, and no work grant comes with it. A removed member can't act.
- **What a message may do** is decided by what its submit kept (0048), never by who owns a source now:
  - a message **written as text** may be corrected or withdrawn;
  - a message that **shares a report or file** (its submit named a `{source}`) may only be withdrawn. That detaches it
    and leaves the source untouched, even when its author owns that source.
- **Correcting** writes the new words to a new source. The message keeps its id, author and time; its revision moves
  by one and `correctedAt` is set.
- **Erasing.** Correcting, or withdrawing a written message, erases the old words through `mission_erase_source`:
  - their text and hash go;
  - running research that read them is revoked and rebuilt on its goal, root and allowance, its spend, receipts and
    holds kept (0028, 0033): a held goal waits for Resume, and a stopped one starts nothing;
  - running designs and reviews that read them are revoked (0041).

  The project's eligibility revision moves, so a live provider context that read the words is rebuilt.
- **Never touched:** accepted decisions, published report versions and their bytes, and sources a message only shares.
  Words a provider already received can't be recalled, and the Studio says so.
- **Identical words change nothing:** no erasure, no rebuild, no event, no eligibility move. The receipt says
  `changed: false`.
- **The preview.** `GET .../contributions/{id}/preview?action=correct|withdraw` lists the running work the words reach
  (`reach`: task, kind, whether it starts again) and signs it (v2). The reach is never cut short: the preview and both
  acts carry every task, however many (Codex on #396; a case with 101 tasks). The proof is an HMAC under 0018's preview key with its
  own label, binding the member, project, message, act, revision, source, expiry (15 minutes) and the reach shown.
- **Confirming.** The act echoes what was shown: `expectedRevision`, `reach` (each `{taskId, kind, restarts}`) and
  `previewToken`. Under the project's and the message's locks:
  - the proof is checked against that echo first. A proof not the server's for this member, message and act, an
    altered echo (a task added or left out, a consequence flipped), or a proof of another version (v1) gives 422;
  - then the echo against now. These give 409 `stale_revision`: an expired proof, a moved revision, a withdrawn
    message, or any task added, gone, or with another consequence (a Stop or a Resume since; FND-C3a-FOCUSED-PREVIEW-01).
    The Studio reads the chat again and keeps the draft.

  Nothing is erased, revoked, rebuilt or spent on either refusal, and a Stop is never undone. The v2 proof binds the
  revision, not the source: every change of a message's source moves its revision.
- **Idempotent per member and key.**
  - The same request answers the same receipt.
  - Another request under the key gives 409 `idempotency_conflict`.
  - A retry of a correction whose words have since been erased gives 409 `request_erased`.
- **Nothing kept leaks erased words.**
  - The submit's text digest and receipt hash are redacted, and so are earlier corrections' digests.
  - Another message that still shares the erased words keeps no hash of them either: its submit's source hash and
    receipt hash are redacted. It stays its author's and detach-only, and a retry of its submit gives
    `request_erased` (V on #396). No other message's own words are touched.
  - Whatever path erased a message's source (a forgotten note's `mission_erase_source`, a withdrawn input), a retry
    of its submit answers its receipt only while that source still has the hash the receipt names. Otherwise it gives
    `request_erased` (FND-C3a-FOCUSED-ERASURE-01). The shared helper is unchanged.
  - A retry of the original submit after its words were erased gives `request_erased`; after a withdrawal of a
    shared message, `stale_revision`.
  - Act receipts carry no text or digest.

## Readers

| Read | Without `revisions=1` (old clients) | With `revisions=1` |
|---|---|---|
| `GET .../snapshot` `discussion` | exactly the shape before A36: current words, withdrawn left out | entries with `revision`, `correctedAt`, `kind`; `discussionWithdrawn` tombstones |
| `GET .../discussion` (A23 pages) | same | entries as above; `withdrawn` tombstones, counted in the 50 |
| Voice (`project_status`, `read_selected_source`) | current words only, withdrawn absent | — |

A tombstone is `{id, actorId, authorName, createdAt, withdrawnAt}`, never words. A withdrawn message still anchors
`before`.

## Studio (the `MESSAGE_ACTS` flag)

- **The flag.** `VITE_SOPHIA_MESSAGE_ACTS=1` (`src/app/message-acts.ts`). It makes the Studio read with `revisions=1`
  and offer **Edit** and **Withdraw** on the reader's own messages. Set it only after 0068 and the routes are deployed.
- **Correcting.**
  - Edit puts the words in a field.
  - Save with the same words closes the field and asks nothing.
  - Otherwise Save asks for a preview. It goes at once unless the preview reaches running work; then the member sees
    what will stop and decides.
- **Withdrawing** always asks first. A withdrawn message shows as «You withdrew this message.» or «This message was
  withdrawn.».
- **Failures.**
  - Once an act is sent, nothing pretends to call it back (Codex on #396). While it is under way, Cancel and Escape
    wait for its answer. After a lost reply the only way on is «Try again», with the same key.
  - Escape in the edit field or the question is spent there: it never closes the chat panel.
  - A message changed elsewhere reads the chat again and keeps the draft.
  - Any other failure says so in plain words.
- **What the chat holds.** The snapshot's window decides for its own span, so a message withdrawn there never stays
  from an earlier page. A reply being written to a withdrawn message is dropped.
- **The files:**
  - the client: `api/message-acts.ts`;
  - the rules: `features/conversation/message-acts.ts`, unit-tested;
  - the component: `MessageActions.tsx`;
  - the hook: `Conversation.tsx` and `EarlierDiscussion.tsx`;
  - the fixtures: `fixtures/message-acts.ts`, with `acts=1` and `discussion=mine`;
  - the browser checks: `e2e/message-acts.spec.ts`.

**Overlap.** `Conversation.tsx` is also changed by Luis's #384. This branch keeps the current UI and adds only the
hook; B reconciles it with the accepted source.

## Known limits

- A message withdrawn or corrected by someone else's tab, older than the snapshot's window and already read on an
  earlier page, shows its old state until that page is read again.
- `draft_brief` admission (0012) still accepts a withdrawn *shared* message's id among its inputs, since its source is
  still eligible. The Studio no longer lists it.

## The CON gap (B)

Saved conversations (0063/A33) keep their own withdrawal and erasure, and have no correction, revision or mentions.
This slice adds four columns to `sophia.contributions` (`revision`, `state`, `corrected_at`, `withdrawn_at`) and
changes `DISCUSSION_PAGE`. B reconciles CON's readers, withdrawal fences and the Q13 structural pins if they read
these.

## Checks

- **`apps/api/src/contribution-acts.db.test.ts`** (real signed API on PostgreSQL, generated parsers):
  - authority;
  - written versus shared, by the shared source's own author;
  - project and source eligibility;
  - accepted decision and published bytes kept;
  - CAS, replay and key conflict;
  - the signed proof: another message's or act's, altered, missing, expired, and a drifted reach;
  - identical words;
  - no leaked words or digests;
  - the legacy and opt-in shapes of the snapshot and earlier pages.
- **`packages/persistence/src/research.db.test.ts`** (0068):
  - a preview made stale by research starting;
  - revoke and rebuild on the same allowance with its spend unchanged;
  - Hold waits, Stop starts nothing;
  - a viewer's own message, without gaining control;
  - a published report kept byte for byte.
- **`apps/api/src/design.db.test.ts`:** a scoped edit asked by a message is revoked when its author withdraws it.
- **`apps/api/src/media.db.test.ts`:** correcting and withdrawing rebuild Sophia's context, which reads only current
  words.
- **`apps/api/src/readiness.db.test.ts`:** not ready without 0068.
- **`features/conversation/message-acts.test.ts`** (unit) and **`e2e/message-acts.spec.ts`** (browser).
