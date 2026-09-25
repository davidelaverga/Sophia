# Implementation-session handoff: S1-03, attempt 1

- **Goal and attempt:** S1-03 "Run, steer, stop and recover a native dsh
  worker", attempt 1. Started before its dependency S1-02 at Davide's
  request. The Sophia side is therefore the **labelled fixture service**
  (`tests/support/fixture-service.mjs`), and acceptance against real S1-02
  admission is still open.
- **Human owner / executor resource:** Davide (owner). The executor is
  Claude Code in a cloud session
  (`https://claude.ai/code/session_01SZcmFfZSVsw7qftzyaDZTm`).
- **Native session:** no live native session exists. The tests create
  deterministic sessions (`sophia-<attemptId>`) inside throwaway Harness
  homes and delete them afterwards.
- **Starting worktree/commit:** `fbaec894a63b8075a87e809d484bf0e092f029e5`
  (`main` after the S1-01 merge, PR #1).
- **Ending commit/tree:** branch `claude/mission-1-repo-setup-yjjjn2`, draft
  PR #2. Slices: A `0b09b6c` (model route), C `4eedb57` (control bridge),
  D `456ca98` (roles). Slice E (execution-host supervisor, live check, docs)
  is the commit that adds this handoff. Slice B was reading the pinned
  contracts and has no commit.
- **Writable scope:** this repository only. Sophia-Agent was not touched.
- **Runtime unit:** `sophia-runtime-s1-03-dev`
  ([config/runtime-unit.json](../../config/runtime-unit.json)). The previous
  unit was `sophia-runtime-s1-01`.
- **Existing authority / cumulative allowance:** the session has no
  provider credential. No live model call was made, and no allowance was set
  or consumed. Every model call in the evidence went to the keyless mock
  (`tests/support/mock-llm.mjs`) on the real pi-ai adapter path.

## Outcome

The official `dsh --profile sophia-runtime` runs a Sophia worker that a
service can create, steer, hold, resume, stop and inspect. It survives
controlled restarts and crashes without losing or repeating accepted work.
It reports ready only when its bridge is bound to a service. A role cannot
run a host tool, directly or through a `workflow` (PTC) child agent.

| Acceptance requirement | Evidence | State |
|---|---|---|
| A live worker receives a mid-work steer at a supported boundary; later evidence distinguishes delivery from incorporation | `bridge.test.mjs` "acceptance: a live worker receives a mid-work steer…": `delivered` arrives while the first model stream is still open, `incorporation_observed` comes later at a higher native seq, and only the second model request contains the steer. `live-steer.test.mjs` runs the live check's own steps as a rehearsal | **met on the mock route.** The live route is unverified: `pnpm live:steer` needs `OPENAI_API_KEY` |
| A controlled restart reconstructs command/native correlation and outstanding work | `bridge.test.mjs` "acceptance: a controlled restart…" (SIGTERM, reboot, full redelivery from cursor 0 answered from the journal, no repeated model call, history intact). `supervisor.test.mjs` "acceptance: after a crash…" (SIGKILL mid-stream, supervised restart, reconciliation, then a new steer is incorporated) | **met** |
| A real Stop prevents new dispatch and candidate publication under the stopped epoch | `bridge.test.mjs` "acceptance: a real Stop…": the turn ends `aborted`, later input, steer and resume are rejected as `stopped`, and no model call follows | **new dispatch: met.** Candidate publication does not exist yet (S1-07/S1-12), so nothing is published to test |

| Adverse check | Evidence | State |
|---|---|---|
| Duplicate delivery does not repeat an admitted domain effect | `bridge.test.mjs` "adverse: duplicate delivery…": the second answer carries the original native seq, the command is journaled once and one model call is made | **met at the bridge.** Domain admission is S1-02 |
| A late peer message cannot revive a stopped task | `bridge.test.mjs` Stop test and "adverse: a stopped attempt stays stopped across restart even when the service binding is stale" | **met for service-delivered input.** The peer channel is S1-10, which must route through the same fence |
| A forbidden host tool remains forbidden inside a PTC program | `roles.test.mjs` "adverse: a forbidden host tool stays forbidden inside a workflow (PTC) program…" and the direct-call case | **met** |
| Hold retains pending context without permitting a native wake or goal driver to execute it before an explicit valid Resume | `bridge.test.mjs` "adverse: Hold retains pending context…": the context is retained in the inbox or stash, no model call is made while held, new input is refused as `held`, and after Resume the context reaches the model | **met** |

Also covered: malformed, foreign-unit and stale-epoch commands are rejected
without effect, and an accepted newer epoch retires the older one at once.
The crash windows between the journal and dsh's flush are covered: a lost
command is re-executed, a held command is not sent twice, and lost
redelivered held input returns. Observations survive an outage and a
restart. A service that refuses the ready report leaves the bridge
`not_ready` and polling nothing. A session whose recorded role the unit no longer defines
refuses to resume. A second supervisor on the same project home is refused.
An exhausted restart budget is a terminal `failed`. The launch environment
carries only named credentials.

## Evidence

Final `pnpm check` on this commit's tree: [check.log](../evidence/S1-03/check.log).
It shows every identity `match`, the unit tests and the integration tests
(profile gate, bridge, recovery, roles, supervisor, live-steer rehearsal) passing: 30 unit and 51 integration tests.

```text
pnpm install --frozen-lockfile
pnpm artifacts:record        # bundle archive re-recorded after each bridge change (now sha256 8577ffe4…0712)
pnpm check                   # toolchain → build → typecheck → unit → artifacts → integration
node --test --test-concurrency=1 --test-timeout=180000 tests/integration/<suite>.test.mjs   # per-suite during work
pnpm live:steer              # exit 2: OPENAI_API_KEY is not set in this environment
pnpm live:steer --rehearse   # exit 0 against the mock; live: false
```

Source-register ids consulted: DSH-02, DSH-03, DSH-04, DSH-08, DSH-09,
DSH-10, DSH-11, DSH-12, DSH-13, DSH-18 (see [SOURCE_MAP](../SOURCE_MAP.md)).
The facts learned at the pin are SOURCE_MAP §3 items 6–11.

## Decisions and changes

- **Development model route (Davide, 2026-09-24):** `openai/gpt-6-luna` at
  `high` reasoning through the pinned `@deepseek-ai/dsh-llm-pi-ai`, with the
  credential passed by reference (`OPENAI_API_KEY`). The route is declared
  in the bundle patch because the pinned pi-ai catalog predates the model.
  D13 (DeepSeek Flash) stays the release baseline; switching back is a
  bundle-patch change and a new recorded unit. `live_verified` stays
  `false`.
- **Correlation lives in a bridge journal, not a dsh session extension
  event.** This deviates from work-sequence step 2. At the pin, a session
  holding an out-of-repo event type cannot be reloaded unless the stored
  envelope is marked `ignorable`, and the public `Session.append` cannot set
  that marker (SOURCE_MAP §3 item 7). The journal
  (`$DSH_HOME/sophia-bridge/<session>.jsonl`, fsynced per record) keeps the
  log-first order: record, then act natively. Restart folds it together
  with the native history.
- **Durable versus transient.** Receipts and observations come only from
  durable `session/event` records. Assistant stream chunks are not
  forwarded. `delivered` is sent after `ctx.sessions.flush`.
- **Hold keeps claimed input itself.** A rejected pre-step drops the
  messages it claimed (item 8). A Hold therefore journals them as a stash,
  and Resume redelivers them.
- **Job settlement.** No role can reach `bash` or the `job_*` tools, so
  Hold and Stop have no host job to settle. They wait for the driver to go
  idle and report `outcome_unknown` if it does not.
- **Roles.** Five versioned presets in `role-registry.ts`. Visibility uses
  agent-scoped `restrict`, computed from the registered tools because
  `restrict` fails on unknown names (item 11). Execution uses one global
  guard that walks runtime ownership, so `workflow` child agents inherit
  their parent attempt's role (item 9). The dsh preset registry is not used.
  Sophia domain tools (`src/tools/`) are not built yet.
- **`session-title-llm` disabled** in the bundle: it made a second model
  call per session (item 10). The gate requires it to stay disabled.
- **Readiness order.** The bridge tells the service it is ready *before*
  it logs `readiness=ready`, which the supervisor waits for. The supervisor
  therefore never reports ready ahead of the service.
- **Execution-host supervisor** (`apps/execution-host`): one project home
  per unit under a single-writer lease (across processes and within one),
  a fully explicit environment, bounded crash restarts and a terminal
  `failed` state.
- **Live check made testable.** `scripts/live-steer.mjs` passes only if the
  steer lands before the first turn ends and is incorporated after delivery.
  Its `--rehearse` mode is an integration test and never writes evidence.
- **Codex review of `36dd709` (seven findings, all fixed, each with a test in
  `tests/integration/recovery.test.mjs`, `supervisor.test.mjs` or
  `tests/unit/bridge-core.test.mjs`):**
  - The fence on restart is the stronger of the service binding's and the
    journal's, applied before dsh loads the session. A Hold the service
    admitted but the journal never saw now holds.
  - Only a *settled* command is answered from the journal. An unsettled one
    is re-executed on redelivery without resending a message dsh already
    holds. Held input a Resume redelivered is journaled by its new ids first,
    and anything dsh never received goes back to the stash.
  - Every accepted command advances the in-memory authority epoch.
  - Receipts and observations are retained and retried until acknowledged.
    The acknowledged observation cursor is journaled, and a restart replays
    the rest.
  - A torn journal tail is cut before the next append.
  - A failed first supervisor start is terminal and releases the lease. A
    child killed on purpose no longer triggers recovery.
  - A binding that cannot be restored is named in the ready report
    (`unrecovered`), and its commands are refused until a Resume succeeds.
- **Codex review of `a27c019` (six findings, all fixed, each with a test that
  fails on `a27c019`):**
  - Commands run in service order per attempt, including the one that
    creates it.
  - An accepted `inspect` raises the authority epoch durably.
  - A binding naming another native session is unrecovered and never
    resumed here.
  - Incorporation receipts are re-sent by their own acknowledgement, not
    the observation cursor.
  - Settlement journals the receipt's stage, so a redelivered Hold or Stop
    is answered with `checked` or `outcome_unknown`.
  - A failed first start waits for the killed child to exit before the
    lease is released.

No new authorization was needed, and nothing outside this repository was
affected.

## Remaining obligations

- **Live steer.** Add `OPENAI_API_KEY` to the session environment (as an
  environment variable, never in chat), then run `pnpm live:steer --evidence
  docs/evidence/S1-03/live-steer.json`. On a pass, set
  `model_route.live_verified: true` in the same commit.
- **S1-02 swap.** `packages/dsh-bundle/src/protocol.ts` is a local copy of
  the pack's command contracts, and the fixture stands in for admission.
  Once S1-02 lands, replace the copy with `packages/contracts` and rerun the
  acceptance against real admission.
- **Execution host.** Container isolation, the deployed host and image
  digests are not built (`required_before_deploy` lists them).
- **Not built:** `packages/dsh-bundle/src/tools/` and `skills/`. The peer
  channel is S1-10.
- **Platforms.** Only linux-x64 is recorded and proven.
- **No retained runtime data.** The tests' Harness homes and journals live
  under the system temp directory and are removed. There are no active
  jobs, and no stopped epoch exists outside the tests.

## Next bounded action

- **Davide:** provide `OPENAI_API_KEY` to the environment and run the live
  steer check, which is the last open S1-03 acceptance item on this route.
- **Luis (S1-02):** land the contracts and admission. S1-03 then replaces
  `protocol.ts` and the fixture binding in a follow-up attempt. Keep the
  DESTINATION_MAP rows current.
- Then S1-05 and S1-07 can start against this runtime (both depend on
  S1-03).
