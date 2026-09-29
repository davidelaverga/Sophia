# SMC-M01 progress: the mission-aware companion

The mission: [M01](../missions/2026-09-27-companion-research/missions/M01_MISSION_COMPANION.md), pack v1.1. Coordination: issue [#17](https://github.com/davidelaverga/Sophia/issues/17). Implementation PR: [#18](https://github.com/davidelaverga/Sophia/pull/18) (draft). Contract binding: [SMC-M01-contract-binding.md](SMC-M01-contract-binding.md), with its implementation notes in §10.

This record keeps source, tests, hosted evidence and human acceptance apart. A state changes only with the evidence named beside it.

**State on 2026-09-29, attempt 1: G1–G4 are implemented and tested; all four Codex GitHub reviews are addressed; G5 is prepared, not requested.** The candidate is on PR #18. The first review (of `5382575`) found two P2 issues, fixed at `a0a1562`; the second (of `50ae500`) found two P1 issues, fixed at `7fd4573`; the third (of `44513c8`) found one P1 and three P2 issues, fixed at `f230848`; the fourth (of `ae6312a`) found one P1, fixed at `dfee0bc` (§5). Nothing is merged, released or accepted. The release request is drafted ([CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md), not posted) and waits on Luis's review, R00's #16 and the read-only checks in [CC-0007](../coordination/SMC-M01/SMC-M01-CC-0007.md) (revision 5 of CC-0002).

| Readiness | State |
|---|---|
| Source-ready | Candidate: G1–G4 implemented, local checks green (§2), the first review's findings fixed. CI runs on each pushed head |
| Merge-ready | No: CI, Luis's review of the Studio layout, Codex's source review (CC-0007, revision 5 of CC-0002), and R00's #16 landing first |
| Release-ready | No: CC-0003 is a draft; it needs the final reviewed SHA, CC-0007's answers and Davide's approval |
| Hosted-verified | No |
| Product-accepted | No |

## 1. Identities

| Item | Value |
|---|---|
| Base | `main` `c683e6e60ff76004e8a06e71c368b718848b1687`: the merge of #15. CI push run 36357507466, all four jobs green |
| Not in the base | R00's closeout, PR #16, open at `86d35ad` (CX-0001). Its code commit `0391bc6` changes only the runtime host's profile reconciliation; M01 touches none of its files. The branch merges `main` once #16 lands |
| Branch | `claude/upbeat-feynman-d7jskb` (this session's designated branch, dedicated to M01) |
| Commits | `dc2d06e` G1 (docs) · `551a18f` G2 ledger · `39545f1` G3 guide and tools · `cfec301` G4 mission view · `8a4b6a7` G4 layout (T17) and parity · `5382575` checkpoint (docs) · `a0a1562` the first review's fixes · `7fd4573` the second review's fixes · `f230848` the third review's fixes · `dfee0bc` the fourth review's fix · then their docs |
| Migration | `db/migrations/0018_mission_ledger.sql`, 43062 bytes, sha256 `07e79d261a9f5a0f885e91637c76e3932be4d6ff9e85da8150208657f63f0581` (the ledger's checksum is the file's SHA-256: 0017 matches CX-0001's `0d0b929f…`) |
| Contract | amendment `A08-mission-ledger.json` sha256 `84845df5…d2a9`; generated `openapi.json` sha256 `006d8406…a363` |
| Guide in the bridge | `apps/media-bridge/src/content/mission-guide/`: prompt `e4fb14d3…c44b` (9809 bytes), skill `2e746dfb…90d5` (14600 bytes), combined `7fe8f729…8f6d` (24410 bytes), manifest `a77cad01…9ba9`, each byte-identical to the pack |
| Pack | v1.1 (sha256 `8ad62933…802c`); `SHA256SUMS`, `validate_pack.py` and `validate_m01_assets.py` pass in place (rerun at this checkpoint) |
| Hosted, observed | CX-0003 (22:54 UTC): API `dep-dasrhht9fdbs73eolc40`, worker `dep-dasrio7pn0mc739nnetg`, runtime `dep-dasrjpt9fdbs73eour90`, bridge `dep-dasrlh17lnhs73agv6f0`, all live at `0391bc6`, tracking `claude/affectionate-cannon-496z9m`; Studio `dpl_7sUgFJnxvQGwaqxiNUpYijbVVFpp`; schema 0001–0017, no 0018 (CX-0001) |

## 2. Checks

**Baseline (at `c683e6e`):** `pnpm check` exit 0 (256 unit, 51 integration against the real pinned dsh); `pnpm test:sql` 17 migrations; `pnpm test:db` 147/147.

**Candidate (this session, Node 24.21.0, pnpm 11.7.0):**

| Check | Result |
|---|---|
| `pnpm check` on the final tree | exit 0: toolchain, format, lint, build, typecheck, `contracts:check`; 295 unit tests; artifacts reproduced; 56 integration tests against the real pinned dsh. That includes the 5-test runtime-service crossing (real API, PostgreSQL and worker), which runs when `SOPHIA_DISPOSABLE_DATABASE_URL` is set |
| `pnpm test:sql --source pack` | the pack's 4 migrations and its SQL test pass |
| `pnpm test:sql` | 18 migrations, including 0018, and the SQL test pass |
| `pnpm test:db` | 183/183 (baseline 147: +24 persistence mission, +10 API mission, +2 media (tool surface; the bridge woken by a forget); the brief cases now expect 410) |
| Rollback compatibility | Production's code (`0391bc6`) against migrations 0001–0018, rerun with 0018 at `07e79d26…`: its own `test:sql` passes and `test:db` is 147/147. 0018 can be applied while the old API runs, and the API and bridge can go back without touching the schema |
| T17 in a browser | §4, T17 |

The database suites ran against a disposable local PostgreSQL 16.13 cluster through `SOPHIA_DISPOSABLE_DATABASE_URL`: this container has no Docker daemon. CI runs them on `postgres:16`. The `room-media` job (a real LiveKit server) exercises `rtc.ts` and the worker's removals, which M01 does not change.

## 3. Goals

| Goal | State | Evidence |
|---|---|---|
| G1 Bind current source and contracts | done | [binding](SMC-M01-contract-binding.md) (§10: implementation notes); OP-0001 answered (§5) |
| G2 Canonical ledger | source done | 0018, A08, `packages/persistence/src/{mission,mission-context}.ts`, `apps/api/src/routes/mission.ts`; §4 |
| G3 Voice notes and guide | source done | `apps/media-bridge/src/{guide,guide-context,tools,room-session,live-session}.ts`, `apps/api/src/{media-tools,mission-tools,voice-status,source-page}.ts`; §4 |
| G4 Mission experience | source done | `apps/studio/src/features/mission/`, Converse without the brief form; T17 checked in a browser (§4) |
| G5 Release and acceptance | prepared | [CC-0002](../coordination/SMC-M01/SMC-M01-CC-0002.md) and its revisions [CC-0004](../coordination/SMC-M01/SMC-M01-CC-0004.md) [CC-0005](../coordination/SMC-M01/SMC-M01-CC-0005.md), [CC-0006](../coordination/SMC-M01/SMC-M01-CC-0006.md) and [CC-0007](../coordination/SMC-M01/SMC-M01-CC-0007.md) (read-only checks, posted), [CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md) (release request, draft) |

## 4. Acceptance cases

"Source" names the tests that hold the case at this candidate (file and test title, abridged). Hosted evidence is G5; nothing is accepted yet.

| Case | Source evidence | Hosted | Accepted |
|---|---|---|---|
| T01 Clarify without a form | The brief form, its instruction and its checkboxes are gone (Studio); no `start_brief` declaration (`tools.test.ts`); the v1.1 prompt and skill are sent verbatim (T19). The clarifying itself is prompt behaviour | not run | no |
| T02 Empty, present, unavailable | persistence `mission.db.test.ts` "reads empty only when nothing exists…"; API `mission.db.test.ts` "project_status tells an empty project from one with history, and reports an outage as unavailable" | not run | no |
| T03 Durable, attributed note | persistence "a typed note is a source-backed, attributed entry…"; API "a voice note follows the note policy and is kept as the speaker's paraphrase" | not run | no |
| T04 Idempotent retry | persistence (same key, same receipt); API "a typed note is recorded once per key; a changed request under the same key is a conflict" | not run | no |
| T05 Concurrent writes | persistence "two proposals from one mission revision: the second acceptance is a conflict", "concurrent decisions on one proposal: exactly one commits", "concurrent corrections of one note…" | not run | no |
| T06 Proposal ≠ disagreement ≠ hypothesis ≠ decision | persistence "a proposal, a rejected alternative, a hypothesis and an accepted constraint stay distinct"; Studio labels (`mission-view.test.ts`) | not run | no |
| T07 Viewer or revoked editor cannot commit | persistence "a viewer cannot record, propose or decide; a revoked editor cannot either"; API `media.db.test.ts` "a viewer can take the floor… but cannot change the mission by voice" | not run | no |
| T08 Confirmation binding | persistence T08 suite (same utterance refused, next utterance commits once; speaker switch, restarted provider session, expired or replaced target, stale revision refused; viewer refused); API "a proposal read back to the speaker becomes the target; their answer in a later utterance decides it" | not run | no |
| T09 Capture off, guest, private | persistence "capture off, consent unset or declined, a turn that binds someone else, or a paused exchange write nothing"; guests are not members and never reach the ledger | not run | no |
| T10 No raw speech kept | bridge `room-session.test.ts` "keeps no transcript: the holder's words reach no log, tool call or session state"; policy buffer 0/0/0 | not run | no |
| T11 Original expectation survives | persistence "an outcome links its expectation and leaves the original prediction and its time unchanged" | not run | no |
| T12 Revoked source does not re-enter | persistence "the text is erased, the source is ineligible, the eligibility revision moves, and no read returns it"; bridge "a narrowed eligibility drops the provider context and reconnects cold"; idempotency records and events hold hashes and codes, never text (0018) | not run | no |
| T13 Paged source marked partial | API "a long source reads in pages marked partial, with a cursor to the rest" | not run | no |
| T14 Historical brief kept, new brief retired | API "new admission answers 410 before any write; an existing brief is still readable"; `runtime.db.test.ts` (410 for viewer and editor); integration `runtime-service.test.mjs` (410, then the historical brief runs); Studio has no brief form. Production holds 2 finished briefs and 0 in flight (CX-0002) | not run | no |
| T15 Controls unchanged | `control_work` unchanged; the bridge, exchange and runtime suites pass (unit 295, integration 56) | not run | no |
| T16 Hosted two-person EN/IT/ES episode | needs a live qualification approval (G5) | not run | no |
| T17 Viewport, zoom, a11y | Browser check at `8a4b6a7`, below | not run | no |
| T18 Only committed notes after a crash | bridge "a write whose reply is lost is retried with the same identity, then reported unknown"; reads return committed rows only | not run | no |
| T19 Exact setup payload | `guide.test.ts` (identities, the pack's bytes, §8's literal, one core and one skill); `live-session.test.ts` against the real `@google/genai` SDK and a local WebSocket: "carries exactly the checked M01 instruction, once, and the six declared operations" | not run | no |
| T20 Bad assets or unbound handlers block activation | `guide.test.ts` "a guide that cannot be activated" (missing file, flipped byte, BOM, CRLF, extra LF, manifest edits, declaration mismatch); bridge "does not connect Google until the API executes exactly the guide's operations"; the server exits when the guide fails to load | not run | no |
| T21 Reconnect and rebuild keep the static assets | `live-session.test.ts` "a resumed connection sends the same instruction bytes with its handle"; bridge "fresh, resumed and rebuilt connections all send the identical instruction" | not run | no |
| T22 Names match handlers, no future tools | `tools.test.ts` (declarations = manifest = contract enum; no retired or future tool); API "serves the guide's six operations to the bridge", "an operation the contract does not name is refused at the door"; the handler map is typed by the contract's union | not run | no |

**T17 evidence (this session, headless Chromium through Playwright on synthetic dev data; the real API on a seeded local database and the Studio in Vite):**
- **Found and fixed.** The mission view was sized to its whole content. At 1280×800 it left about 17 of the composer's 114 px in view, and on a phone about 35 of 153 px. It now gives way like the discussion: 107/114 px at 1280×800 and 125/153 px at 375×812. Its direction line stays in view, and its lower edge fades while there is more below. Opened, the conversation is the one scroller.
- **Measured at 1280×800, 1280×640, 375×812, 640×400 (200% zoom) and 320×256 (400% reflow):**
  - no horizontal overflow;
  - the dock never overlaps the lens (a 22–44 px gap);
  - no page errors apart from the Studio's missing favicon, which predates M01.
- **Keyboard, with reduced motion at the small sizes:**
  - every mission control is reachable in DOM order;
  - it shows a focus ring and is scrolled into view when focused;
  - none sits under the dock.
- **Manual controls through the UI, each confirmed in the API:** add, correct and forget a note (forgetting asks first); reject and accept proposals; withdraw and give consent; the admin's capture off and on.
- **Limitation, predating M01.** At 200% zoom and 400% reflow the room stage leaves the lens 29–51 px tall. Its geometry is fixed by the light engine (`features/light/engine.ts`) and `theme.css` (`--ly`, `--lr`, `.stage-body`). Everything stays reachable by keyboard and scrolling, but it is cramped, for the composer as much as for the mission view. The fix belongs to the layout's owner, not to M01.

## 5. Operations

| Operation | Kind | Request | State |
|---|---|---|---|
| SMC-M01-OP-0001 | read-only preflight | [CC-0001](../coordination/SMC-M01/SMC-M01-CC-0001.md) | answered by [CX-0001](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880038214) (`blocked`, partial), [CX-0002](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880048077) and [CX-0003](https://github.com/davidelaverga/Sophia/issues/17#issuecomment-5880197156) (`reconciled`); read only, no effects |
| SMC-M01-OP-0002 | read-only source review and inspection | [CC-0002](../coordination/SMC-M01/SMC-M01-CC-0002.md), revision 2 [CC-0004](../coordination/SMC-M01/SMC-M01-CC-0004.md), revision 3 [CC-0005](../coordination/SMC-M01/SMC-M01-CC-0005.md), revision 4 [CC-0006](../coordination/SMC-M01/SMC-M01-CC-0006.md), revision 5 [CC-0007](../coordination/SMC-M01/SMC-M01-CC-0007.md) | requested at the new candidate; no answer yet |
| SMC-M01-OP-0003 | release batch | [CC-0003](../coordination/SMC-M01/SMC-M01-CC-0003.md) | draft, not posted, not approved |

**Reviews of PR #18:**

| Review | Findings | Outcome |
|---|---|---|
| Codex GitHub review of `5382575` (review 5346100271, requested by Davide) | P2: a note-policy or consent change did not reach a live guide (`0018`, `set_mission_note_policy` and `set_mission_note_consent`). P2: the retired `POST …/native-tasks` still declared a 202 receipt | Both fixed at `a0a1562`, with tests; binding §10. 0018's hash changed, so CC-0002 is superseded by CC-0004 |
| Codex GitHub review of `50ae500` (review 5346285586, requested by Davide) | P1: the API's CORS preflight did not allow `PUT`, so the hosted Studio could not set note capture or consent (`apps/api/src/cors.ts`). P1: an accepted constraint or lesson naming the mission in `supersedesDecisionId` marked it superseded while the mission projection stayed (`0018`, `mission_accept`) | Both fixed at `7fd4573`, each with a test shown failing before the fix; binding §10. 0018's hash changed again, so CC-0005 supersedes CC-0004 |
| Codex GitHub review of `44513c8` (review 5346681863, requested by Davide) | P1: two replacements of one decision could both be accepted (`0018`, `mission_accept`). P2: an external change during the guide's own write was hidden by its receipt (`guide-context.ts`). P2: after an unconfirmed correction the Studio offered a fresh save with a new key (`MissionNotes.tsx`). P2: a correction dropped the note's links (`0018`, `record_mission_entry`) | All fixed at `f230848`, each with a test shown failing before the fix; the same retry rule also covers adding, forgetting and deciding in the Studio. 0018's hash changed again, so CC-0006 supersedes CC-0005 |
| Codex GitHub review of `ae6312a` (review 5346772180, requested by Davide) | P1: a withdrawal moved the eligibility revision but nothing woke the bridge's assignment poll, so a live provider context could keep the forgotten text for up to 25 s (`0018`) | Fixed at `dfee0bc`: a trigger notifies `sophia_media` for every live exchange of a project whose mission, ledger or eligibility revision moves. The end-to-end test (the real API and bridge, fake Live) fails without it. 0018's hash changed again, so CC-0007 supersedes CC-0006 |

**OP-0001, checked by Claude against CC-0001:**

| CC-0001 asked | Observed | What it means for M01 |
|---|---|---|
| 1. Live tuple | Four Render services live at `0391bc6` (CX-0003); Studio `dpl_7sUg…`, the deployment R00 verified at `0391bc6` (CX-0001); `/health` and `/ready` 200 | The release's starting point and its rollback targets |
| 2. Schema | 0001–0017, checksums matching `c683e6e`; 0 pending; no 0018 | 0018 is free and will be the only pending migration |
| 3. Counts | 6 projects; 7 active admins, 0 editors, 0 viewers; 0 `project_revisions` above 1; 0 non-empty frames; 0 decisions; 2 `draft_brief` jobs, both succeeded; 0 non-terminal native tasks (CX-0002); 2 non-terminal work attempts; 0 open exchanges | 0018's new `decisions` columns meet no existing row, and there is no legacy frame to carry. The two finished briefs must stay readable (T14), and no brief in flight is stranded by the 410. The two work attempts are not M01's; they are recorded, not touched |
| 4. Roles | `sophia_api_app` is not superuser, not BYPASSRLS, a member of `sophia_api`; migration-owner access through the SQL editor | The runbook's owner-connection migration step applies |
| 5. Triggers | Auto-Deploy and PR Previews Off on all four; Studio has no Git link | Merging deploys nothing |
| 6. Bridge setting | `GEMINI_API_KEY` and `SOPHIA_LIVE_MODEL` present; the model value is masked and **unverified** | The bridge logs its effective model on `bridge.start`: the release reads it there (CC-0003) |
| 7. R00's closeout | #16 open, head `86d35ad` | M01 merges after it |

## 6. Ownership

Reserved on #17 (binding §8): migration `0018_mission_ledger.sql`, amendment `A08-mission-ledger`, the media bridge, the mission and media API routes, `packages/persistence/src/mission*.ts`, and the Studio conversation and mission features. M01 changes no dependency, lockfile or runtime identity. At this checkpoint it also updated [DESTINATION_MAP.md](../DESTINATION_MAP.md) and the release runbook's M01 notes ([deploy/S1-05A-release.md](../../deploy/S1-05A-release.md)); PR #16 touches neither.

## 7. Limitations of this candidate

- **Behaviour only a hosted episode can show.** T01 and T16 (clarifying without a form; the two-person EN/IT/ES episode) are prompt-level behaviour, not provable locally. They need a live qualification approval: named project and participants, Gemini Live calls with a spend ceiling, and what the notes may retain.
- **Setup against Google.** T19–T22 are proven with the real SDK against a local endpoint. Google's acceptance of the setup, and the hosted model value, are observed only at release.
- **Deploy order.** An old bridge rejects the new API's assignments, which gain three required revisions. The API and the bridge go out back to back, with nobody in a call. The new API's `/ready` requires 0018's functions, so the schema goes first.
- **Zoom.** The room stage's geometry at 200% zoom predates M01 (§4, T17).
- **Names.** The Studio names another member only when the room knows them; otherwise it says "A member". This predates M01 and applies to the discussion too.
- **Hashes of forgotten notes.** A forgotten note keeps its tombstone's SHA-256 and the idempotency hash of its request, never its text. A hash of a very short text could be confirmed by guessing. CC-0002 asks Codex to judge whether that matters.
- **Reviews.** Luis has not reviewed the Studio layout yet.

## 8. Next action

When CI is green on the pushed head, ask Luis for the Studio review and Davide to wake Codex on CC-0007. When it answers and #16 has merged, merge `main`, rerun the checks, and post CC-0003 with the final SHA for Davide's decision.

## 9. Mission state

```json
{
  "schema": "sophia.mission-state.v1",
  "mission_id": "SMC-M01",
  "current_goal": "M01-G5",
  "repository": "davidelaverga/Sophia",
  "branch": "claude/upbeat-feynman-d7jskb",
  "base_commit": "c683e6e60ff76004e8a06e71c368b718848b1687",
  "candidate_commit": "the head of PR #18 (code at dfee0bc, then its docs)",
  "implementation_pr": 18,
  "coordination_issue": 17,
  "status": {
    "source": "candidate_in_review",
    "merge": "not_requested",
    "release": "request_drafted",
    "hosted_verification": "not_run",
    "product_acceptance": "not_requested"
  },
  "owners": {
    "implementation": "Claude Code",
    "operations_support": "Codex",
    "product_authority": "Davide",
    "ui_review": "Luis_when_relevant"
  },
  "completed_goals": ["M01-G1", "M01-G2 (source)", "M01-G3 (source)", "M01-G4 (source)"],
  "test_evidence": [
    "baseline at c683e6e (section 2)",
    "candidate: pnpm check (295 unit, 56 integration with the runtime-service crossing), test:sql pack and repo, test:db 183/183",
    "rollback: 0391bc6 code on 0001-0018, test:sql and test:db 147/147",
    "T17 browser check at 8a4b6a7 (section 4)"
  ],
  "outstanding_operations": [
    "SMC-M01-OP-0002 revision 5: read-only review and inspection, requested (CC-0007, superseding CC-0006, CC-0005, CC-0004 and CC-0002)",
    "SMC-M01-OP-0003 revision 1: release batch, drafted, not posted (CC-0003)"
  ],
  "unknown_effects": [],
  "hosted_tuple_ref": "SMC-M01-CX-0003 (four Render services at 0391bc6), SMC-M01-CX-0001 (Studio dpl_7sUg, schema)",
  "migration_ledger_ref": "SMC-M01-CX-0001: 0001-0017 applied, no 0018",
  "approval_refs": [],
  "remaining_allowance_ref": null,
  "file_ownership": ["see section 6"],
  "next_action": "After CI is green: Luis reviews the Studio layout, Davide wakes Codex on CC-0007; then merge main after #16 and post CC-0003 with the final SHA",
  "checkpoint_ref": "docs/handoffs/SMC-M01-attempt-1.md"
}
```
