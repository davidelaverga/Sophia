# Implementation-session handoff

Goal and attempt: FND-C-TERMINAL-SESSION-RECOVERY-IMPLEMENTATION-01 (retire the sessions still attached to a completed
goal), attempt 1
Human owner / executor resource: Davide (D-RECOVERY, direct human approval `call_e00106ffed8d4eeb80ac661c2e0f6966`,
relayed by P) / Claude Code lane C (transcript `2ae2e877-b3cf-44a7-bccc-4db0d9846006`)
Native session: as above
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-17/sophia-terminal-session-recovery`, branch
`foundation/terminal-session-recovery-20261017`, from B2 `d0c46d5f9d6439e69ec77f74ea6fe996e5634b6b` (tree `f0e9b776…`)
Writable scope: migration `0075`, amendment `A41` and their generated outputs; persistence command admission; the
Studio goal controls; tests; this record. Names allocated by P only.
Runtime unit: Davide's macOS host; Node 24.21.0, pnpm 11.7.0 (offline, frozen); PostgreSQL 17.11 on 127.0.0.1:55496
(own, fresh cluster, stopped after). No native process, session, journal or production read.
Existing authority: P's C-terminal-session-recovery-implementation-packet-v1.txt and
decision-P-D-RECOVERY-source-boundary-20261017.json. SOURCE only: no production control, migration or deploy.
Ending commit/tree: the commit this record is in.

## Outcome

- **Retire remaining sessions:** a project admin's explicit control for a COMPLETED goal.
  - Kind `retire_sessions`: public in `GoalCommand` (A41) and persisted in `sophia.commands`, with its own request,
    idempotency and audit (`command.retire_sessions`).
  - Admin only (`sophia.is_admin`, the verified actor). Ordinary Stop keeps `can_edit`, unchanged.
  - Completed only, at the exact goal revision and authority epoch (40001 otherwise).
- **The fence:**
  - authority epoch +1 and state revision +1, under the project and goal row locks; status stays `completed`;
    revision unchanged;
  - pending non-cleanup rows of that goal are superseded;
  - every binding of the goal not yet settled, read from the database, gets a `native.stop` cleanup row; none →
    the existing empty `control.settle`.
- **The runtime's existing stop does the rest.** No new runtime command, protocol, SDK or bridge change.
  - dispatch sends a `retire_sessions` cleanup row as `stop`;
  - the bridge fences, cancels and waits boundedly (`checked`, «the native driver is idle and the handle is released»),
    or restops a session without an agent (`checked`, «the stopped epoch stands»: durable only), or answers
    `outcome_unknown`;
  - receipts settle each binding (or leave it `stopping`, visible); a completed goal is never moved by settlement.
- **A restart cannot bring the sessions back.** `runtime_hello` reports a completed goal's bindings `stopped` once a
  retirement holds at its current epoch, even before any receipt. Without it, completion read `active`.
- **Unchanged:** the work, closed review and run, jobs, attempts, grants, caps, costs and admission. Nothing resumes,
  replays, creates or deletes.
- **Not claimed:** native quiet beyond what each receipt says, freed memory, provider-side quiescence, or restart
  qualification.

## Source deltas (latest definitions, preserved)

- `0075_completed_goal_session_retirement.sql`, one transaction (`BEGIN; … COMMIT;`, as the migration runner requires):
  - new `sophia.admit_session_retirement` (granted to `sophia_api` only);
  - `dispatch_runtime_outbox`: latest 0064 byte for byte, plus one marked insertion `RETIRE-KIND`
    (`IF kind='retire_sessions' THEN kind:='stop'; END IF;` after `kind:=c.kind`);
  - `runtime_hello`: latest 0071 (carrying A40 and the conversation branches) byte for byte, plus one marked insertion
    `RETIRE-HELLO` (the retirement `WHEN`, before the stopping/stopped line).
  - `admit_goal_command`, `apply_runtime_receipt` and `settle_native_control` are not redefined.
  - `session-retirement-source.test.ts` proves both copies equal the latest definitions once the marked insertion is
    removed. The CON preservation guard (`conversation-runtime.db.test.ts`) now removes 0075's `RETIRE-*` insertions,
    named apart from CON's, before comparing the live definitions with the pre-CON baseline. Without that, it failed
    (the saved full `.db` run before the fix shows exactly these two deltas).
- `A41-completed-goal-session-retirement.json`: `GoalCommand.kind` gains `retire_sessions`; `Receipt.targets`
  (optional; bindingId, attemptId, nativeSessionId) names the admitted targets. That is admission, not settlement.
  OpenAPI, types and validators regenerated; the runtime wire is unchanged.
- Persistence: `admitGoalCommand` routes `retire_sessions` to the new function; every other kind is as before.
- Studio:
  - `commandsFor(status, admin)` offers «Retire remaining sessions» to an admin on a completed goal only;
  - `WorkControls` asks first («The goal stays completed and its review stays closed; nothing restarts. Whether a
    session was still busy, or its memory is freed, isn't known.»);
  - after sending it says how many sessions were sent a stop, and that each is retired only when its runtime
    confirms, «that isn't shown here». No auto-retry.
  - The admin flag is plumbed ProjectShell → GoalList → GoalCard → WorkControls.

## Evidence

- `runtime.db.test.ts` (real PostgreSQL 17.11, the real admission, dispatch, poll, receipts and hello; the completed
  status and a second attempt/binding are a labelled owner-written fixture), three new cases:
  - **an admin retires every remaining session:**
    - hello reads `active` before; ordinary Stop is still refused on the completed goal;
    - receipt: revision unchanged, epoch +1, both targets; same key replays, a different request conflicts;
    - hello reads `stopped` right after admission;
    - both targets are dispatched as `stop` under the new epoch;
    - a live `checked` and a durable `checked` settle them, their reasons kept apart;
    - the goal is still completed, attempts and jobs are byte-equal, the command is `retire_sessions`/`checked`;
    - hello no longer lists them.
  - **refusals:** editor, viewer and outsider → `forbidden`; a stale epoch or revision → `stale_revision`; a running
    goal → `invalid_state`; nothing moved.
  - **unconfirmed and lost:**
    - a lost binding is settled by dispatch without the runtime («no native session to fence»);
    - an `outcome_unknown` receipt leaves the other binding `stopping`, and hello still reads it `stopped`.
- `api.db.test.ts`: over HTTP:
  - not completed → 409 `invalid_state`; an editor → 403;
  - an admin → 202 with a contract-valid A41 receipt (`targets: []` on the seeded goal);
  - replay is equal; a different request is `idempotency_conflict`;
  - the snapshot shows the goal completed, revision 1, epoch 2.
- Unit: `session-retirement-source.test.ts` (3) and `commands-for.test.ts` (2).
- The handback has the logs, the full `.db` suite, the mutation and the ordinary `pnpm check`.

## Limits and open items

- **No per-target settlement reader exists** (the snapshot's goal carries status and epoch only). The UI shows the
  admission and its admitted targets, and says settlement isn't shown. A per-target reader would be a new route or
  snapshot field: not invented here.
- **The command row's one `state` is not per-target truth.** With one lost target settled by dispatch and one
  `outcome_unknown`, it reads `checked`. This comes from unchanged 0064 paths that ordinary multi-binding Stop shares.
  Per-target truth is each binding and its receipt.
- The production pair (goal `d1ebfca7…`) was not touched. Whether the live bridge holds those attempts is UNKNOWN; an
  unknown attempt is answered `rejected`, never a pass.
- Owed: R's independent review; B's integration (keeping Luis's labels and design); current-head CI (PG16); a V-sealed
  batch, R review and an exact human approval before any production operation.
