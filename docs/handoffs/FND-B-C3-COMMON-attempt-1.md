# Implementation-session handoff

Goal and attempt: FND-B-C3-COMMON-01 (the room's message acts and explicit mentions on the qualified C1+C2 common line),
attempt 1.
Human owner / executor resource: Davide (product, merge and production decisions); Luis (UI acceptance) / Claude Code
session (Claude B) on Davide's Mac, coordinated by P.
Native session: none (a coding session, not a runtime attempt).
Starting worktree/commit: `sophia-mentions-common`, branch `foundation/mentions-common-20261017`, new from the qualified
common `44cf0b03e5b4a77dc277e2f9b1fa6b083ee6f4bd`.
Ending commit/tree: in B's private handback (a commit cannot name itself).
Writable scope: one normal merge of C3's sealed `f3bfe5ef` (C3a message acts, 0068/A36; C3b explicit mentions,
0069/A37), its conflict resolutions, the preview-Cancel correction (#396 r4296732968), the served C3 cases and this
record. No SQL, migration, amendment, name, dependency or authority change; no C4, C5, B2, Personal or main import.
Runtime unit: none run. Existing authority: P's packet; fake actors and owned loopback services only.

## Outcome

- **The merge.** One merge onto the common line, both parents kept. Four textual conflicts:
  - the Studio's flag declarations: conversations, attention, message acts and mentions, all off by default;
  - a room message's words: main's RichText (#384) inside C3's Edited mark, message actions and mention line;
  - two generated validator files, regenerated with the rest of the contract outputs from every amendment (A33,
    A15/A34, A36, A37), not hand-merged.
- **Auto-merged and checked.** The API registers C1's conversations conditionally, C2's Needs and Updates and C3's
  contribution acts; readiness requires 0065, 0066, 0068 and 0069. 0068, 0069, A36 and A37 are the donor's bytes;
  0058 stays main's `dec9ec3e`. The strict A34 reader and Updates' counted fence are unchanged.
- **Gating, checked before any edit.** Acts follow `VITE_SOPHIA_MESSAGE_ACTS`, mentions `VITE_SOPHIA_MENTIONS`, and
  Home's needs (mentions included) the attention flag. Nothing C3 needs waits on VISION; the room's replies stay
  VISION-only, as before, and are not C3. No gap was found, so no gating was changed.
- **The preview can be called off (r4296732968).** Asking the service what an act would do entered the same «working»
  state as the act itself. So for up to 30 s Cancel and Escape were held back, and the chat said «Withdrawing…» or
  «Saving…» before anything was written.
  - `previewing` is now a step of its own. Cancel and Escape go back; Save waits without saying «Saving…»; a
    withdrawal's preview says «Checking first…» with its own Cancel.
  - A preview called off answers to nothing: a counter fences it, so a late answer neither opens the question nor
    sends the act.
  - The act itself is unchanged: once sent, Cancel still waits for its answer, and the v2 proof and the confirmation
    are as they were.

## Evidence

Node 24.21.0, pnpm 11.7.0, private PostgreSQL 17.11 UTF8 (fresh, removed after).
- Format, lint, typecheck, contracts (regenerated, no drift) and the toolchain check pass.
- Units: 3035 passed, 0 failed, 70 skipped. One run failed once on `byte-backup.test.ts`'s concurrent-copy case: both
  writes were refused under load. That test and its source are unchanged from the common line; it then passed 5/5
  alone and in a full rerun. Recorded, not waived.
- Artifacts reproduce unchanged: bundle `sha256:e956becc…`, lock `b868da08…`, darwin dsh `e24cb887…`. C3 changes no
  runtime input; the donor's own `172fc` was its base's identity, not this one.
- `test:sql`: 68 migrations. `test:db`: 1025/1025, including A36's correction and withdrawal, A37's mentions, A15's
  needs and 0068's research case. The exclusive Q13 candidate suite is skipped there, not counted.
- Real API (the normal App → listening API → restricted PostgreSQL, synthetic HS256; VISION off; conversations,
  attention, message acts and mentions on): 18/18, and 12/12 for the C3 cases repeated.
  - The 12 C1 and C2 journeys, unchanged.
  - **Preview held** (in the browser by `page.route`, then let through to the real API):
    - before: «Withdrawing…» while only the preview was read (withdrawal case), and «Saving…» (correction case);
    - after: Cancel or Escape goes back while it is read; no act is written; the late answer opens nothing; asking
      again asks afresh; a correction saved again with nothing held goes, through the real API, «Edited».
  - **Mentions:**
    - an admin picks the one other member by name; the request carries exactly that member's id; the message names a
      recipient; a name typed in the words mentions nobody;
    - the member finds it on Home, opens it into the room, and it is marked seen there once, by its own id (other
      mentions of theirs shown in the same chat are acknowledged by theirs);
    - corrected in the chat, the mention is asked again on revision 2 (`2.1`), and a seen for `1.1` answers without
      clearing it;
    - withdrawn in the chat, the message leaves only its place and the mention ends;
    - the recipient is offered no act on the writer's message.
- Fixture pages (C3's own specs): 31/31, and 93/93 repeated three times. Neighbours across 31 files (C1's conversation,
  profile and account specs, message format, links in place, message links, room return, skip link, earlier
  discussion, the room's chat and replies): 283/283.

## Limits

- dev-db has no viewer identity, so a viewer's acts and their not being offered Mention are proven by the fixture
  pages and the database suites only.
- Same-words re-add as a new occurrence, the four-page bound, a failed earlier page and the tall-message rule are
  proven by C3's fixture specs and its prior database evidence only, not served here.
- #396 r4296732954 stays as it was: old hashes can remain in internal metadata after a shared source's erasure, with
  served replay refused. No helper rewrite and no universal hash-redaction claim.
- C3 covers live room contributions only. Saved conversations keep their own withdraw and erase, with no mentions or
  correction: the CON alignment and its Q13 structural pin remain open, not completed by this.

## Account boundary (FND-B-C3-ACCOUNT-DIAG-01, R-C3-ACT-01)

A correction whose preview reaches no work goes as soon as the preview answers. If the account that pressed Save
left the page while that preview was on its way (another account in the tab, or signing out), the answer still sent
the correction, under the token that account left behind.
- Before, reproduced on the normal App against the listening API: the preview was held in the browser and let through
  after leaving. In both cases a correction POST went, and the message was corrected to revision 2 in the database.
  The token was still valid at the API, so only the browser could hold the line.
- Now the act remembers the account that began it (`accountOf`). Before anything new, it asks `stillSignedIn`, as a
  write that outlives its part already does (`signed-in.ts`, usePersonal's carry): acting on the preview's answer,
  saying it failed, or sending. An account that left starts nothing.
  - Unchanged: same-account work keeps going across views, and a write already sent is not called back.
  - Unchanged: Cancel, Escape, the late answer, a fresh retry, can't-cancel-once-sent, the v2 proof and the lost
    reply's same key.
- The room fixture renders the room without App, so it now sets its one account the way App does (`setSignedIn`).
  That is in the fixture only; the guard itself is not bypassed.
- After: nothing is written and the message stays at revision 1, in both orders; 6/6 over three repeats. The served
  suite passes 20/20, the C3 fixture specs 31/31 and the neighbours 283/283.

The byte-backup failure is diagnosed apart, in B's private receipt, with no product or test change: not reproduced
in 100 two-put pairs, idle or loaded, so its cause is unknown.

## Remaining obligations

- R's review of this head; Luis's acceptance of the combined Studio. Then P sequences any publication.

## Current common carried (FND-B-MENTIONS-CURRENT-COMMON-INTEGRATION-01)

One normal merge of `ffb4f05c` (Needs and Updates on the published common `9df69813`, the tree main now carries) into
`7a7c43e7`, both parents kept; the merge base is `44cf0b03`.
- **Ten paths changed on both sides.** Seven merged automatically: diagnostics `sanitize.ts`, the room fixture,
  `theme.css`, `link.ts`, persistence `index.ts`, `snapshot.ts` and the OpenAPI.
- **`routes/projections.ts` is resolved as a union.** A36's `revisions=1` query option stays on the snapshot and
  discussion reads, and common's read bounds (`readControl`, 20 s) wrap both.
- **The generated types and validators** are regenerated as one union from every amendment (A34/A36/A37 with
  A33/A35/A40/A41). `contracts:check` has no drift.
- **Every other path keeps its own side's bytes:** the donor's 99 and this branch's 55.
- **The lock, runtime record and profile lock are common's.** Every identity reproduces unrecorded. 0058, 0068/0069
  and A36/A37 are unchanged, and 0065-0075 come from the donor; no new name.
- **Checks.** The ordinary check, SQL, DB and served cases of this head are in B's handback.

## Next bounded action

B's private handback goes to P; R reviews this head. No push until P selects one publication.
