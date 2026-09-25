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
| `b126ce6` | D: durable removal of a declined guest; the handoff |
| `2f76776`, `833221c` | A read-only production diagnostic with an allowlisted public output (Codex finding CX-0001) |
| `5e057b3` | Codex code review, round 1: dispatch waits for a ready runtime; a stop fences a transcribed reply before its first audio; a failed room join is retried; a brief retry resends the frozen request |
| `27d3acf` | Codex code review, round 2: a stop also fences a reply to sound the holder made before any transcript; a brief is captured once, so a later steer's turn cannot replace it |
| `4ba339a` | Codex code review, round 3: both long polls listen before the read that decides to wait; the room shows a runtime online only while dispatch would use it; a result notice counts as announced only once the room heard it; dev-stack runtime data lives under the system tmpdir |
| `c99fd7a` | Codex code review, round 4: a tool call Google repeats on a resumed connection keeps its idempotency identity; a guest declined during the quiescence wait gets no token; every bridge process still reporting for the room must confirm a quiesce request; a brief counts as one piece of work in the room line |
| (this commit) | Codex end-to-end check: the bridge confirms a guest's quiesce request only from inside the room, connected, and again after a join or reconnect. Codex's own fix (`3c7335d`) and follow-up PR exist only in its cloud task; this is an equivalent change with its tests |

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
| A01 | Partial and blocked. Codex observed the Render API live at `29a570c3`, and a hosted ledger of 0001–0011 that matches the source. **Auto-deploy of the stale `deploy/render-vercel` (`ff22a249`) is confirmed on**; OP-0004 is requested to turn it off. No host exists yet for the worker, bridge or execution host, and the Vercel source commit is unknown ([progress A01](../progress/S1-05A.md)) |
| A04 | A real model brief needs an owner allowance and `OPENAI_API_KEY` on the execution host |
| A05, A06 | Two humans with real Gemini need an owner allowance, `GEMINI_API_KEY`, LiveKit and a deployed bridge |
| A07 | The voice half of steering, on a live run |

## Operator receipts

None yet. The coordination issue is [#14](https://github.com/davidelaverga/Sophia/issues/14), requested by Davide on 2026-09-25. Claude posted [S1-05A-CC-0001](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5834232644) unchanged, and the read-only supplement [S1-05A-CC-0002](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5834240066). CC-0002 covers the candidate services, their settings and one run of `apps/api/scripts/diagnose.ts`, and sets the evidence contract for production debugging.

Codex first answered both as `blocked`, because its host had no provider credentials. It then reconciled both read-only in Davide's signed-in provider projects ([CX-0004](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5835343541), [CX-0005](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5835349474)):
- The hosted ledger is 0001–0011 and matches the source.
- Auto-deploy is on for the stale branch.
- No worker, bridge or execution host exists.

Codex's finding on the diagnostic's public output was fixed at `833221c`. Claude replied in [CC-0004](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5835927773): the facts are recorded, two settings would stop the API at its next start, and six decisions are Davide's. Claude also requested **OP-0004, auto-deploy off**, in [CC-0005](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5835930429); it awaits approval. The [coordination log](../coordination/S1-05A/README.md) lists every message. No deployment or production test has been authorized or performed.

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
- the hosts for the worker, bridge and execution host, and their settings. The deployed commit, schema ledger and auto-deploy setting are now observed (CX-0004), and no such host exists yet (CX-0005);
- a reviewed candidate SHA;
- an owner-confirmed target;
- an expiry;
- a spend ceiling.

Its inputs are already fixed by this branch:

| Migration | SHA-256 (as the runner records it) |
|---|---|
| `0012_runtime_service.sql` | `0b4c973d28273ff2567f88bf95b5a513299adb3b2973e3ffa0d33dab8578a60f` |
| `0013_room_exchange.sql` | `44ac2a681e4179a2a7649d632f0382fff32b412a9d113d3d9b1db62521bad221` |
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

1. Davide approved OP-0004, relayed in [CC-0006](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5836772918), and Codex carries it out. The release request is [CC-0007 (OP-0002)](https://github.com/davidelaverga/Sophia/issues/14#issuecomment-5836915687), for candidate `0c93daa`: three new Render services, plus the API and Studio deployed. It awaits Davide's approval with the project id, the LiveKit key, the Render plan, a spend ceiling and an expiry. `deploy/S1-05A-release.md` is the runbook for the release and for production debugging.
2. After OP-0002's smoke checks, the owner runs the live test (A05–A07, paid). Codex reports each incident with the evidence contract.
3. Luis reviews A04–A07 and the viewer change.
