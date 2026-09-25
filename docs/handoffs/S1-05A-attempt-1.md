# Implementation-session handoff: S1-05A, attempt 1

- **Goal:** [S1-05A](../alignment/2026-09-25/S1-05A_GOAL_SPEC.md). Make Luis's shared room a real Gemini 3.8 Live conversation and connect one useful, authorized, durable dsh task (`draft_brief`) to it.
- **Executor:** Claude Code (cloud session `https://claude.ai/code/session_0132HNzeA65ec3zBCL4KYtX2`), implementer role only.
- **Branch:** `claude/affectionate-cannon-496z9m`, from the cumulative baseline `studio/qol@29a570c3`.
  - Luis's stack was not merged, rebased or force-pushed.
  - `main` at review time was `01d9117b`.
- **Writable scope:** source, local migrations, tests and docs. **No hosted service, schema, secret or Auth setting was touched.** No operator action has run.

## Verdict

**Candidate ready for review. Not integrated, not hosted, not accepted.** Checkpoints A–D are built. Every local and CI check passes, including a real LiveKit server. No live model or media run has happened, because there was no owner allowance and no authorized host key; no mock is presented as live. The original criteria that stay open are listed below.

## Commits

| Commit | Checkpoint |
|---|---|
| `7e3d329` | A: the alignment packet installed, baseline recorded, first operator request drafted |
| `ebc4048`, `3c89048` | B: the real `/v1/runtime` service, canonical wire types, dispatch, one durable brief |
| `07dc4fb` | C: the room media bridge, the exchange, a truthful room |
| (this commit) | D: durable removal of a declined guest; the handoff |

## Evidence

Records: [A](../evidence/S1-05A/checkpoint-A.md), [B](../evidence/S1-05A/checkpoint-B.md), [C](../evidence/S1-05A/checkpoint-C.md), [D](../evidence/S1-05A/checkpoint-D.md). Progress: [progress/S1-05A.md](../progress/S1-05A.md).

| Check | Result at this commit |
|---|---|
| `pnpm check` | exit 0: toolchain, Prettier, oxlint, build, typecheck, contracts, 190 unit tests, all runtime-unit identities reproduced, 56 integration tests against the real pinned dsh (51 earlier + 5 runtime-service crossing) |
| `pnpm test:db` | 127 pass |
| `pnpm test:sql` | 14 migrations and the pack's SQL test |
| `pnpm test:livekit` | 2/2 against `livekit-server:v1.13.7` |
| CI on `07dc4fb` | all four jobs green: runtime-unit, PostgreSQL, real LiveKit, local Supabase |
| CI on `ebc4048` and `3c89048` (B) | **runtime-unit red.** Those commits carried the first checkpoint C draft (`apps/media-bridge/src/exchange-state.ts`) while the destination map still listed `apps/media-bridge/` as unbuilt, so `destination-map.test.mjs` failed. The local `pnpm check` recorded in B ran before that file existed. It was fixed in `07dc4fb`, which updates the row |

**Mutation checks.** Each guarantee was weakened once and restored byte for byte. B: M1–M3 caught; M4 is defence in depth by design. C: 9 caught (2 only after tests were added). D: 6 caught.

**Browser run.** The real room path with the **rehearsal** bridge (no Google): listening, speaking only once audible, Stop speaking, End, and the observation indicator across views.

## Acceptance cases

The following are met locally or in CI. Hosted and human acceptance are pending for all of them.

| Case | What is met, and on what |
|---|---|
| A02, A03, A08 | Real pinned dsh with the mock model |
| A09, A10, A12, A13 | Real API and PostgreSQL; real LiveKit where the room matters; fake Google |
| A11 | Only the chosen source is received, on the real LiveKit server. A real model discussing the screen is pending |
| A14 | The runtime half on real dsh; the Google half against fakes |
| A15 | The projection is tested and rendered with the rehearsal bridge |

These cases are **open**:

| Case | Why it is open |
|---|---|
| A01 | Partial and blocked. Codex observed the Render API live at `29a570c3`; the hosted ledger, the auto-deploy switch, the Vercel source commit and the hosts for the worker, bridge and execution host are unknown ([progress A01](../progress/S1-05A.md)). The reported Render auto-deploy of `deploy/render-vercel` (`ff22a249`, which predates the room work) remains an unverified hazard |
| A04 | A real model brief needs an owner allowance and `OPENAI_API_KEY` on the execution host |
| A05, A06 | Two humans with real Gemini need an owner allowance, `GEMINI_API_KEY`, LiveKit and a deployed bridge |
| A07 | The voice half of steering, on a live run |

## Operator receipts

None yet. The coordination issue is [#14](https://github.com/davidelaverga/Sophia/issues/14), requested by Davide on 2026-09-25. Claude posted [S1-05A-CC-0001](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5834232644) unchanged, and the read-only supplement [S1-05A-CC-0002](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5834240066). CC-0002 covers the candidate services, their settings and one run of `apps/api/scripts/diagnose.ts`, and sets the evidence contract for production debugging.

Codex answered both as `blocked`: its host has no provider credentials, and it asked Davide for a read-only access path. Its review finding on the diagnostic's public output was fixed at `833221c` and answered in [S1-05A-CC-0003](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5834807704). The [coordination log](../coordination/S1-05A/README.md) lists every message. No deployment or production test has been authorized or performed.

## For review (Luis)

- **Amendments A04–A07 and migrations 0012–0014**, all append-only. Two functions are replaced with `CREATE OR REPLACE`:
  - `admit_goal_command`, for native bindings;
  - `transfer_input_floor` and `decide_lobby_entry`, for the exchange epoch and the removal obligation.
- **Viewers publish and may hold the floor (A06).** Work still needs an editor. The expectations changed in `room.db.test.ts`, `rooms.db.test.ts` and `room-view.test.ts` are marked "Changed by amendment A06".
- **Participants of unsigned standing count as guests** everywhere.
- **Studio changes:**
  - `RoomStage` takes the light's mode from `sophia-view.ts`;
  - `listensOnly` is gone;
  - the dock has a Sophia group;
  - the Converse lens is bounded under Sophia's line.
- **Recorded identity change:** the workspace-lock SHA-256 changed with the new packages. The dsh artifact and bundle identities are unchanged since B.

## To turn it on (owner decisions, then a Codex execution request)

Planned operation **S1-05A-OP-0002**. It is **not requested yet**. A complete request needs:
- the observed deployed commit and schema ledger, the auto-deploy setting, and the hosts and settings for the worker, bridge and execution host (CC-0001 and CC-0002);
- a reviewed candidate SHA;
- an owner-confirmed target;
- an expiry;
- a spend ceiling.

Its inputs are already fixed by this branch:

| Migration | SHA-256 (as the runner records it) |
|---|---|
| `0012_runtime_service.sql` | `311396e5928af0a439b5f867fa0539cab405c054cdd562d3a3eadd17252993d6` |
| `0013_room_exchange.sql` | `b04e41c227551554f6e451c84fe7ce7ffb4def50ee20ef4e5dece2047f58cb45` |
| `0014_room_removals.sql` | `55948614ffb026fa040139a140518e8ee378055b28346ad953fc09354e65cfe2` |

The effects it will name, in order:

1. Turn off the stale auto-deploy, if CC-0001 confirms it.
2. Dry-run the migration runner, then apply only 0012–0014 (0009–0011 are expected to be present).
3. Register one runtime and create a `sophia_worker` login. Values go to the platform secret stores, never to a transcript.
4. Set `SOPHIA_MEDIA_BRIDGE_TOKEN_SHA256` on the API, and the worker's and bridge's variables (`.env.example` lists every name).
5. Deploy the reviewed commit's API and Studio, the worker, the media bridge and the execution host.
6. Smoke-check: `/ready`; a runtime `hello`; a bridge assignment poll; a guest token refused (503) while the bridge is down.

Schema reversal is not authorized. The compatible code rollback is the previously deployed commit, as observed by CC-0001. The paid live cases (A04–A07) then need the owner's explicit allowance.

## Next bounded action

1. Davide decides the read-only access path Codex asked for. Codex then completes CC-0001 and CC-0002 in #14.
2. With the observed deployment, schema and settings, Claude drafts the complete OP-0002 `execution_request` in #14, for Davide's separate approval.
3. Luis reviews A04–A07 and the viewer change.
