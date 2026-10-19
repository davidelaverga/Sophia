# Implementation-session handoff

Goal and attempt: FND-C3b-EXPLICIT-MENTIONS-01, attempt 1 (#365 section 7; `Refs #365 — section 7`)
Human owner / executor resource: Davide; lane C (Claude). Coordination by P, verification by V, combined integration by B.
Native session: Claude Code desktop session (this conversation); no native runtime session.
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-16/sophia-mentions`, branch
`api/contribution-mentions-20261016`, from sealed C3a `95609ec42800f85f2489227a4a1fc0c1bd1e9762` (tree
`983768d2fa319d1946f4b81629ff2ab27c3aeb6e`).
Ending commit/tree and changed files: the commit that carries this file; its evidence is bound to it.

## Outcome

Explicit member mentions in the room's chat: explicit ids (at most five, deduplicated, self left out, active members
only). The full rules are in docs/plans/mentions.md.

- **Rights.** An editor or an admin mentions. A viewer writes, corrects and withdraws their own words without
  recipients, and is mentioned.
- **Attention follows the committed revision.** Kept and waiting rebinds as one item, kept and seen is not asked
  again, added is asked, removed and withdrawn are retired. A stale seen clears nothing newer.
- **Compatibility.** Omitted on a submit means none; omitted on a correction keeps them; `[]` clears them. Needs
  mentions only with `mentions=1`; an entry's `mentions` only with `revisions=1`. The A36 v2 proof and detach-only
  are unchanged.
- **Studio**, behind `VITE_SOPHIA_MENTIONS`: the composer picker with current labels, the recipients line, Home's
  mention need and its seen.

Not done:

- deployment;
- CI and the automatic review on this head (pending at writing);
- B's combined integration with main and with Luis's #384 and #398 overlaps.

## Evidence

All local, on PostgreSQL 17.11 (V's recipe):

- **`mentions.db.test.ts` 5/5.** Mutations fail it: re-pinging a seen recipient, or a stale seen that clears.
- **With the C3a and nearby suites, 150/150:** mentions, contribution-acts, needs, readiness (not ready without
  0069), access, api, profile, runtime (api and persistence), media, mission, updates.
- **Persistence research and design** 0068 and revocation cases: 15/15.

Browser, headless (CI=1) on loopback 5199 and 5198, each verified free before and released after:

- `mentions.spec.ts` 4/4;
- with message-acts, discussion-earlier, room-discussion, chat-times, message-links, room-chat-replies, home-needs,
  home-phone-needs, control-heights and focus-visible: 94/94;
- voice-chat, room-dock, room-phone-floor, conversation-acts and room-people: 59/59;
- after the picker closes on send: mentions with room-discussion 13/13.
- Screenshots are in the operator journal (C3b-shots).

Checks: lint, format, typecheck and contracts:check are clean. `pnpm test` gives 2364 pass, 0 fail.
`pnpm artifacts` reports "all artifact identities reproduced". The full integration gate was not run. No model,
provider, voice or production call was made.

## Decisions and changes

- **Names.** Only the reserved `0069_contribution_mentions.sql` and `A37-contribution-mentions.json`; the generator
  ran in C's slot.
- **0069 redefines** `submit_contribution`, `correct_contribution` and `withdraw_contribution`: 0068's bodies plus
  the mention steps. 0068 and earlier migrations are byte-identical.
- **`list_needs()` (0065) is unchanged.** `list_needs(boolean)` is new and serves the opt-in.
- **A mention-only change keeps the revision.** Moving it would make A36 proofs stale for nothing, and no paid work
  may wake.
- **Shared files touched**, declared for B and Luis:
  - API: `app.ts` (readiness), `routes/needs.ts`, `sanitize.ts`;
  - persistence: `index.ts`, `native-tasks.ts`, `needs.ts`;
  - contracts: generated outputs;
  - Studio: `client.ts`, `theme.css`, `vite-env.d.ts`, `Composer.tsx`, `useRoomMessage.ts`, `Conversation.tsx`
    (overlaps #384), `api/needs.ts`, `useNeeds.ts`, `needs-you.ts`, `NeedsYou.tsx` (Home; check against #398);
  - fixtures: `data.ts`, `fixture-api.ts`, `home.tsx`, `message-acts.ts`, `vite.fixtures.config.ts`.

## Remaining obligations

- **Deploy.** V deploys 0069 and the A37 routes; only then is `VITE_SOPHIA_MENTIONS=1` set.
- **Home's Needs.** Mentions show only with the Needs view (VISION in this stack; B's activation in main).
- **CON (B).** Saved conversations have no mentions. B reconciles if CON readers touch `contributions`.
- **Tracked, not resolved:**
  - the internal old-reference hash after a non-contribution erasure;
  - the preview GET holding Cancel (C3a).
- **The browser slot** is released at handback.

## Repair exchange 1 (Codex on abc1bd95)

The evidence below is for the commit that carries this section.

- **Codex 4297738046, P1: a mention marked seen before it was shown.** Home now routes to `#message-<id>`; the room
  opens its chat on it and scrolls the entry into view.
  - The seen mark comes from the chat itself (`useMentionsSeen`): only with the chat on screen in the room
    (`chatInView`) and the entry intersecting the chat's scrolled view, once per revision.
  - Home no longer marks a mention on open.
  - Nothing is marked for a message beyond the window, a closed chat or a failed read.
- **Codex 4297738072, P2: an unloaded members read taken as empty.** `useMemberNames` reports `known`. Until the read
  succeeds, the picker isn't offered and no recipient line is drawn.
- **Reproduced before the fix:** four new browser cases fail on abc1bd95's Studio source and pass now (logs
  `browser-c3b-r1-old.log`, `browser-c3b-r1.log`).
- **Results:**
  - `mentions.spec.ts` 7/7;
  - the broad room, chat and Home regression: 163/163;
  - lint, format, typecheck and contracts clean; units 2364 pass, 0 fail.
  - No SQL or contract change, so the PG evidence above stands.

## Repair exchange 2 (Codex on b48450fb; the last consolidated exchange)

The evidence below is for the commit that carries this section.

- **Codex 4297868222, P2: a mention-only change on a shown message wasn't observed.** The chat's observation now
  follows each entry's recipients as well as its revision. The browser case (`mentionMeIn`, same words and revision)
  failed before and passes now.
- **Codex 4297868229, P2: an explicit list accepted a removed member who was already named.**
  - `mentions_allowed` now checks every recipient when the request names a list; an omitted list keeps the current
    ones.
  - The PG case failed before (200, log `pg-c3b-r2-before.log`) and gives 422 now.
- **Results:**
  - PG suites with mentions and the C3a and nearby suites: 157/157. Research and design: 15/15.
  - Browser: `mentions.spec.ts` 8/8; with message-acts and the chat specs, 49/49.
  - lint, format, typecheck and contracts clean; units 2364 pass, 0 fail.
- **What happens next.** Any later finding goes to P for a focused, split or owner disposition.

## Focused attention-occurrence correction (FND-C3b-ATTENTION-OCCURRENCE-01, P's disposition)

The evidence below is for the commit that carries this section; logs are in the operator journal (C3b-occurrence-logs).

- **V-C3b-1, merge-blocking.** V's real API/PG sequence: same words, remove, re-add, then the old seen cleared the
  new attention.
  - Reproduced in `mentions.db.test.ts`: on d14c5891 the re-added mention had the old one's identity (log
    `pg-occurrence-before.log`).
  - Fix in the unapplied 0069: an `occurrence` per recipient, one more on each re-add. The need's `within` is
    `<revision>.<occurrence>`, carried through list_needs, Need/ref, the generated parser, the API and the Studio.
  - `mark_mention_seen` acts only on that revision and occurrence: a delayed old seen answers 204 and clears nothing,
    and the current one is idempotent.
  - Same words still make no revision, erasure or wake. An unrelated reply need stays.
  - A mutation (no occurrence increment) fails the case.
- **4297960036.** The chat acknowledges the Needs read's own ids, so a re-added occurrence is a new id. On the mounted
  chat, remove and re-add send `…:1.1:…` and `…:1.2:…` once each.
- **4297960051.**
  - The readable rule: 60% of the entry, or 60% of the chat for a taller one.
  - The browser shows a ≤6 px sliver not acknowledged and a 3× tall message acknowledged.
  - On d14c5891 the tall message was never acknowledged (defect confirmed). On d14c5891 the 4 px sliver was *not*
    acknowledged in this fixture either (its failure there is the id format only), so V's edge hypothesis is guarded,
    not confirmed.
- **4297960043.** The address is handled once per follow; later messages don't pull the reader back (on d14c5891 they
  did).
- **4297960058.** An older target is found within at most four earlier pages, and only after the first read (a real
  bug caught: it once concluded before the snapshot arrived). A missing target says so and nothing is marked.
  Positive browser case: a target beyond 50, one page read, shown, seen.
- **Results:**
  - PG: 159/159; research and design 15/15.
  - Browser: mentions 14/14, ×3 42/42; broad regression 170/170.
  - Units 2368 pass, 0 fail; lint, format, typecheck and contracts clean; artifacts reproduced.

## Rendered-revision correction (FND-C3b-RENDERED-REVISION-01; V on a837572e)

The evidence below is for the commit that carries this section; logs are in the operator journal
(C3b-rendered-revision-logs). It is Studio-only: 0069, the API, A37, the generated outputs and the PG test are
byte-identical to a837572e.

- **V-C3b-a837-1 (P1): an acknowledgement on older words still shown.** The chat attached the Needs read's newest id
  for a message to whatever revision it showed.
  - Reproduced on a837 (`browser-rr-before.keep.log`): with the chat's reads held at revision 1 and the Needs read at
    2.1, `seen …:2.1:…` was sent while the old words showed.
  - Now each waiting need keeps the revision its `within` names, and `needFor` attaches it only to that rendered
    revision; any other form fails closed.
  - The case: no acknowledgement while the old words show, then exactly one `2.1` once the new ones do.
- **V-C3b-a837-2 (P2): a failed earlier page was read again.** Reproduced on a837 (same log): four automatic reads
  after a failure.
  - Now `nextLook` waits on a failed read: EarlierLine's own «Couldn't load earlier messages» and Try again stay,
    there is no «further back», and after the reader's Try again the message loads, shows and is acknowledged once.
- **V-C3b-a837-3: tall evidence.** The fixture now uses valid ≤4000-character text (3995). Measured rendered
  geometry: 1344 px tall; the chat is 520, 280, 120 and 40 px at windows 800, 560, 400 and 320 px high; on a 390×844
  phone, 1284 in 476.
  - At 1280×320 the most visible part is 0.03 of the message, under the observer's first 5% step. There, a message
    first seen as a 2 px sliver and then scrolled to fill the chat was never acknowledged (`browser-rr-tall-before.keep.log`):
    V's delivery gap, confirmed.
  - Minimal fix in the same hook: the chat's scroll also re-measures the waiting entries (frame-throttled, the same
    readable rule).
  - Limit kept: only this measured geometry is shown, not every layout; the old tiny-edge defect was never reproduced.
- **Results:**
  - mentions.spec 17/17, ×3 51/51; neighbors 156/156;
  - units 2371 pass, 0 fail; lint, format, typecheck and contracts clean; artifacts reproduced.
  - No PG rerun, since the server is unchanged.

## Next bounded action

Read the automatic review on this head once (at most two consolidated exchanges), then hand back to P. The next
intake is C4, bounded lexical project search; not started.
