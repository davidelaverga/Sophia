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

## Next bounded action

Read the automatic review on this head once (at most two consolidated exchanges), then hand back to P. The next
intake is C4, bounded lexical project search; not started.
