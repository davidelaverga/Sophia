# S1-05A checkpoint A: baseline, contracts and source crosswalk

**Recorded:** 2026-09-25 by Claude Code (S1-05A attempt 1, session `https://claude.ai/code/session_0132HNzeA65ec3zBCL4KYtX2`).
**Goal owner:** Davide. **Integration/UX reviewer:** Luis. **Operator:** a separately initialized Codex session (not started from here).

## 1. Source graph, refreshed

`git ls-remote origin` at the start of the session:

| Ref | Commit | Relation |
|---|---|---|
| `main` | `01d9117bdcf9ec8ee18cd5414aa08ee4f24265a3` | PRs #1, #2 merged |
| `studio/qol` (PR #12, draft) | `29a570c33feb97a6bc04ea357c84087a47c9b055` | cumulative head: 45 commits ahead of `main`, 0 behind |
| `docs/pack-v0.4` (#3), `s1-02/admit-command` (#4), `tooling/clean-code` (#5), `s1-02/response-validators` (#6), `deploy/render-vercel` (#7), `s1-04/studio-shell` (#8), `studio/vision` (#9), `rooms/access` (#10), `studio/precise` (#11) | as in the packet's branch register | every one is an ancestor of `studio/qol` |

No ref moved since the packet's inspection, and no PR newer than #12 exists. The packet's anchors are therefore the actual state.

**Working branch:** `claude/affectionate-cannon-496z9m` (the branch this session is assigned). It was at `main` and was fast-forwarded to `studio/qol@29a570c3`. Nothing in Luis's stack was rebased, reset, squashed or force-pushed. The packet suggests the name `claude/s1-05a-room-to-work`; the session's assigned branch is used instead, with the same meaning.

## 2. Baseline checks on `29a570c3` (this container, before any change)

| Command | Result |
|---|---|
| `pnpm toolchain:check` | `node 24.21.0, pnpm 11.7.0` (Node 24.21.0 installed from nodejs.org, SHA-256 checked against `SHASUMS256.txt`) |
| `pnpm install --frozen-lockfile` | lock unchanged; supply-chain policy passes |
| `pnpm check` | exit 0 in 2 min 33 s: 118 unit tests, all runtime-unit identities `match`, 51 integration tests against the real pinned dsh |
| `pnpm test:db` (local PostgreSQL 16.13) | 86 tests pass |

## 3. Hosted tuple

**Unknown from this session.** Claude has no hosted credentials and does not want any. Luis's dated report (API and Studio at `29a570c3`, migrations 0009–0011 applied, Render auto-deploy still tracking `deploy/render-vercel`) is the comparison baseline. The read-only inspection is requested in [S1-05A-CC-0001](../../coordination/S1-05A/S1-05A-CC-0001.md).

**Release hazard, flagged:** `deploy/render-vercel` is `ff22a249`, a pre-room ancestor of `studio/qol`. If Render still auto-deploys that branch, any push to it replaces the room-capable API with an older one. This session never pushes `deploy/render-vercel`; it pushes only its own `claude/…` branch, which no deployment tracks as far as the repository shows.

## 4. Contract and migration inventory

| Kind | Present | Owner |
|---|---|---|
| Amendments | A01 project room (S1-04), A02 room access (S1-04A), A03 lobby decline/block (S1-04A) | Luis |
| Migrations | 0001–0004 (pack, verbatim), 0005–0008 (S1-02), 0009 (S1-04), 0010–0011 (S1-04A) | Luis / Davide |

**Reserved by S1-05A** (to be confirmed with Luis before either side authors more):

| Number | Purpose | Checkpoint |
|---|---|---|
| A04 `runtime-service` | `/v1/runtime/*` operations, runtime capability scheme, canonical wire types | B |
| A05 `conversation-and-native-tasks` | inline-text contributions, `draft_brief` admission, task read, discussion and work in the snapshot | B |
| A06 `room-exchange` | exchange start/end/stop-speaking/look/stop-looking/resume, Sophia presence in the room, viewer speech | C |
| A07 `access-settlement` | durable removal state on lobby entries, guest admission after AI quiescence | D |
| Migrations 0012, 0013, 0014 | the same three slices, append-only; 0001–0011 are not edited | B, C, D |

A01–A03 are not modified. Where S1-05A changes behavior that A01 introduced (viewers may hold the floor for a read-only exchange; a floor change advances the open exchange's input epoch), the change is a `CREATE OR REPLACE` in a new migration plus an A06 entry, both for Luis's review.

## 5. Source crosswalk (what changes where)

| Area | Existing | S1-05A change |
|---|---|---|
| `packages/dsh-bundle/src/transport.ts` | calls `/v1/runtime/*`; casts replies unchecked | validates every reply with validators generated from A04 |
| `packages/dsh-bundle/src/protocol.ts` | local copy of the pack shapes | types and validation generated from A04; the local copy is removed |
| `packages/dsh-bundle/src/control-bridge.ts` | forwards 4000-character assistant text | forwards model identity, usage and the final text (bounded) needed to retain a real result |
| `packages/dsh-bundle/src/role-registry.ts`, `config/roles.json` | five roles | adds `sophia-brief-v1`, which may run no native tool |
| `apps/api/src/app.ts` | member JWT on every non-public route | an explicit, exact set of runtime routes authenticated by a runtime capability, never by a JWT and never by prefix |
| `apps/api/src/routes/runtime.ts` | none | hello, commands (long poll), receipts, observations, ready |
| `apps/api/src/routes/conversations.ts`, `native-tasks.ts` | `submitContribution` is contract-only | attributed discussion; `draft_brief` admission; task read |
| `apps/worker/src/runtime-dispatch.ts` | no worker exists; `claim_outbox` is only tested | claims native deliveries, rechecks authority, enqueues runtime commands, retires ineligible rows |
| `db/migrations/0012…` | outbox/jobs/attempts/bindings exist without a dispatch path | runtime instances, per-runtime command queue, receipts, inline source text, contributions, admission and dispatch functions |
| `apps/media-bridge/` | none | Checkpoint C |
| `apps/studio` voice/light/composer | light shows `listen` whenever the room is live; composer cannot send | Checkpoints B and C |
| `apps/api/src/routes/access.ts`, `livekit.ts` | removal is best effort and a `false` is ignored | Checkpoint D |

## 6. Writable scope of this session

Source, local migrations, tests and repository documentation in `davidelaverga/Sophia`, on `claude/affectionate-cannon-496z9m`. **Not in scope:** hosted migrations, deployments, production secrets, Supabase Auth settings, Render settings, LiveKit Cloud settings, and any paid model or media call without a recorded owner allowance.

## 7. Credentials present in this container

None of `OPENAI_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `LIVEKIT_*`, Supabase or Render credentials is set (checked by name only; no values exist to print). Every model and media test in this attempt is therefore either a labelled fixture or explicitly pending.
