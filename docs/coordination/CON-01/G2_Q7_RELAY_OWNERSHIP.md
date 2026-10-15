# CON-01 G2 Q7: who owns a reply child's relay (a proposal for the runtime owner's agreement)

**What this is.** CON-01's answer to the open Q7 in [G2_RUNTIME_PLAN](G2_RUNTIME_PLAN.md) §0 ("Which process owns a reply child's relay"), and to §2.1's "Required" descendant-settlement mechanism. Codex asked for it in CX-0139 and mission request 6116456625. It is **one recommended design for the runtime owner (WBC-02/SDD-01) to agree or correct, as an engineering matter, before any Phase B write.**

**Revision 8, after Codex's CX-0153 and the joint runtime owner's exact-r7 record** ([durable record `610b1f2d`](https://github.com/davidelaverga/Sophia/blob/610b1f2d99c473147384447e7f75dbb239440fd6/docs/coordination/CON-01/CX-0153.md); the joint record's original SHA-256 `d5bd2ac5…`, its safe copy `70ab66a0…`). The reviewed base is revision 7 (`c48b17ae`, SHA-256 `0e4e00cc…`).
- **The joint record** is CHANGES_REQUIRED_NOT_FULL_ENGINEERING_ACK. It read all 1250 lines and verified 12 dependencies.
- **It finds revision 6's findings addressed at design level:** `home_exists`, the same-instance `check`, the two-settle test, and "verified gone".
- **Two P2s remain,** which Codex traced independently. Neither is a demonstrated purge race, late home, provider call, duplicate claim or deletion.
- **Unchanged:** P1-E stays withdrawn, and the hello lease-loss table stays optional with safe accounting. The immutable L0 artifacts and the route assessment (`9e752d5a`) are untouched.

Revision 8 changes only these:

| CX-0153 | What was wrong in revision 7 | Where it is corrected |
|---|---|---|
| P2: the cleanup `retire`'s delivery rows | Revision 7 allowed one `retire` but still said no row creates an outbox row. The existing schema makes every runtime command carry its own outbox row: `outbox_id` is non-null, unique per project, and a foreign key, and `command_id` is a foreign key (0012:74, 77-79). The `create`'s outbox row is already taken. CX-0151's wording behind it was too broad as well | §6, §10: **exactly one idempotent cleanup `retire` per attempt, with the delivery rows it needs:** its `commands`, `outbox` and `runtime_commands` rows, keyed to the same attempt and reply. Never a new Ask, `create` or execution, attempt, reservation, provider or model call, or allowance reset. The `stopping` row's replay creates no dispatch. The writer, its idempotency, and BINDING_MAP §8.2.1's test bullets (:297, :299) are the core owner's to align in an accepted shared window. That held binding isn't edited here, and no new queue is invented |
| P2: an empty home in the current root | `check`'s `empty` in the current root counted for `stop` on the drain alone. The drain covers launchers admitted now. It doesn't cover this attempt's one launcher held before its shared lock or its `mkdir`, so `stop` could answer `checked` while that launcher was unreaped | §5, §6, §7, §10: **the spawn fence**, the guard `absent` already had. In the current root, an `empty` counts only while this bridge holds no unreaped launcher for the attempt. Its claim allows one spawn, so no other launcher follows. Otherwise the answer is `outcome_unknown` and the home stays pending. Revision 7's "no admission can follow a drain" now applies to renamed roots only. A renamed root's `empty` still counts on its drain |
| Implementation notes (joint record; not defects) | — | §5: scoped live proof's lease read uses `check`'s no-link locator checks, and falls back to `check` across every root if its own root was renamed or a second home is found. §6: each fresh `check` has its own time budget, also after the original deadline has passed |

**Revision 7, after Codex's terminal CX-0151 review of revision 6** ([durable record `9fe14e70`](https://github.com/davidelaverga/Sophia/blob/9fe14e70fe2d4c82b759bd68f6ff0650088ffff7/docs/coordination/CON-01/CX-0151.md), with the joint runtime owner's exact-r6 record, SHA-256 `ec28d195…`). The reviewed base is revision 6 (`09892924`, SHA-256 `ff172950…`).
- **The joint record** is CHANGES_REQUIRED_NOT_FULL_ENGINEERING_ACK. It accepts the admission, life-lock, receipt-mapping, shared-deadline and predicate directions at design level. It adds one P1.
- **Codex's root review** adds three P2s and a precision note.
- **P1-E stays withdrawn.** Hello's lease-loss table stays an optional core and ledger design.
- **The immutable L0 artifacts** (`a5fcb20c`) are unchanged. Their fixture's `check` is not a production rule (§9).

Revision 7 changes only these:

| CX-0151 | What was wrong in revision 6 | Where it is corrected |
|---|---|---|
| P1: what `home_exists` proves | Exit 71 was "settled", and `stop` and `retire` took any settled exit the live bridge saw as proof. But the launcher that exits 71 never created, opened or locked the home that already exists. An occupied home (a whole lease, a held life lock, a live recorded child) could have been retired on that exit | §5: **scoped live proof.** A settled exit proves only what that launcher could have done. It covers only the home that launcher created, whose lease's launcher record carries the nonce this bridge gave that spawn. Exit 71 proves only that the new launcher forked nothing: the existing home goes to `check` and is kept until it is verified. §6, §7 and §10 carry this to every caller, with 71 in the adverse controls |
| P2: `stop` after an unsettled exit | `check` was allowed only for an attempt "this bridge never ran". So a same-instance replay after exit 74, a signal or no exit could never reach `checked`, even once the child had settled | §6: **a fresh, bounded `check` for any attempt without scoped live proof,** whether or not a `ReplyChild` is still held. It joins the original `t0` and deadline, signals nothing, and resets nothing. §7 and §10: unknown, then proven, then one `retire`, on the same instance and on a new one |
| P2: the two-settle test | It let the terminal receipt go once the *first* settle answered | §10: **every** pending settle answered, or the shared deadline. One early answer with the other pending gives no receipt. Both answered is the early control |
| P2: hello's "no command" test | It said no row creates any command, while the lease-loss rows write `retire` | §6, §10: no new `create`, Ask, outbox row, reservation or call. The one idempotent `retire` that the lease-loss rows require is the only command written. The `stopping` row replays the existing `stop`. *(Revision 8: "outbox row" is withdrawn from this list, because the cleanup `retire` needs its own delivery rows)* |
| Precision | "Verified" in §5's `check` table could be read as a matching live identity | §5: **verified gone.** A matching live entry is `unsettled`, never settlement |

The empty-home rows change with the P1, since an empty home carries no nonce:
- An empty home is settled by the drain of its own root, the current root included (§5). *(Revision 8: in the current root, only together with the bridge's spawn fence)*
- A zero-byte lease, or one whose launcher record is torn, is `unresolved` on every path. Revision 6's live-path exception for it is withdrawn.
- A whole launcher record carrying the spawn's nonce is still scoped live proof's case, even when the fork intent after it is torn: that launcher forked nothing.

**Revision 6, after Codex's CX-0148** ([#198 comment 6117637047](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6117637047); reviewer packet [`7744eaa9`](https://github.com/davidelaverga/Sophia/blob/7744eaa9fee53910807c551b4cd9bcfb7fb87bd3/docs/coordination/CON-01/CX-0148.md), with the joint runtime owner's handback added at [`cdff2bdf`](https://github.com/davidelaverga/Sophia/blob/cdff2bdf5adc7910ab3b37c9a44bfcaab5d8fe89/docs/coordination/CON-01/CX-0148.md)), which read revision 5 (`971793db`, SHA-256 `a63cbc3d…`).
- **The joint runtime owner's exact-r5 record** (`e0893d6e`) is CHANGES_REQUIRED. It confirms the same four groups, and adds one item: the forked child must close every unused gate write end it inherits.
- **Codex's filesystem probe** (Darwin, Node 24.21.0, owned scratch): a descriptor opened before the rename still writes and `fsync`s into the renamed root, while a fresh open by name gets `ENOENT`. It ran no Q7 `check` or `retire` and forced no `mkdir` race.
- **P1-E stays withdrawn.**

Revision 6 changes only these:

| CX-0148 | What was wrong in revision 5 | Where it is corrected |
|---|---|---|
| P1: a rename doesn't settle earlier writes | Revision 5 said the launcher held no descriptor into a home until its lease was durable, and took the rename as the end of every older write. But an `O_EXCL` open, write and `fsync` holds a descriptor before durability, and a rename revokes nothing: operations already in flight finish in the renamed root | §5: **the admission lock.** From before its `mkdir` until its lease is whole and durable, each launcher holds a shared `flock` on its root's `.admit`, and it verifies its root by name while holding it. `check` trusts an absent, empty or lease-less home in a renamed root only while it holds that lock exclusively (**the drain**). The rename is the linearization point for new admissions; the drain proves that none is in flight. A zero, torn or partial lease is `unresolved`, never the empty case |
| P1: the unrecorded child | `home_deleted_child_unrecorded` deleted a home and answered `checked` without proving the forked child gone. That broke §8.5's stop-and-settle-before-clean, and left its inherited fd 3 and diagnostic descriptors unaccounted | §5: **the life lock.** The launcher takes an exclusive `flock` on the lease as it creates it, and holds it for its whole life. The forked child inherits it and lets go only at its `execve` (close-on-exec) or its exit. So a free life lock with no valid child entry proves, with no pid, that the child exited without ever executing, and that every descriptor it inherited is closed. Landlock gives the reply's dsh no right on the lease. The child closes the gate's write end and the status pipe's read end it inherits before it waits. `child_unrecorded` and `home_deleted_child_unrecorded` are withdrawn |
| P2: the classifier's other callers | Withdrawal answered `stop` `checked` unconditionally. Hello's `cancelled` row and the crossing table disagreed about who writes `retire` | §6, §7: every caller follows §8.2.1:272-273. `stop` `checked`, on proof only, writes `retire`. `stop` `outcome_unknown` leaves the binding `stopping`, its purge pending and any open reservation `uncertain`. **The same `stop` command is then replayed at the next hello** and evaluated again, never answered from memory |
| P2: the aggregate settle bound, and consistency | `settleWaitMs` bounded each settle, while the stop's bound added a single `settleWaitMs` for all of them | §6: **one shared settle deadline** for every pending settle of a reply (at most two ordinals, resent in parallel), `settleWaitMs` after the reply's process settlement point. Also: the generation paths carried through §5's argv, §7's chain and `retire`, and §8; the filter placed after the gate; and the eight named predicates kept distinct from the relay's own condition |

**Revision 5, after Codex's CX-0145** ([#198 comment 6117419664](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6117419664); reviewer packet [`51153041`](https://github.com/davidelaverga/Sophia/blob/511530415b3fe894da28553b86e8bf44ce48675c/docs/coordination/CON-01/CX-0145.md)), which read revision 4 (`387fb2dc`, SHA-256 `49e59d2a…`).
- **The joint runtime owner's r3 record** (`15ae009a`) is CHANGES_REQUIRED.
- **Codex ran the unchanged supervisor locally,** with owned stand-ins on Darwin and Node 24.21.0. A supervisor exited; its old child survived; a replacement took the same project lease; and the old child then wrote a late synthetic reply home.
- **That run is no dsh, provider, Linux, Render or Q7 failure.** It shows that "a new instance means the old one exited" is not a premise this design can use.

Revision 5 changes only these:

| CX-0145 | What was wrong in revision 4 | Where it is corrected |
|---|---|---|
| (1) No future writer | Hello, an absent home, or an empty home was read as the old bridge or a paused launcher being gone | §5: **the generation seal.** Each launch has its own reply root, and the next launch renames every older root before it starts. The launcher resolves every path by name and holds no descriptor into a home before its lease, so a sealed generation can never create or fill a home again. §6, §7: no death is inferred from a hello, a sweep or an absence. *(Revision 6: the descriptor premise was wrong, and the rename is only a namespace fence; the drain and the life lock are the proof)* |
| (2) The unrecorded child | A crash between the fork and the child's entry left a launcher-only lease, read as "no fork" | §5: a fork intent is written before the fork, and there is **one gate** that the child can't pass until its entry is durable and its `pidfd` held. Before the gate it does nothing but arm its own bound. §7: `home_deleted_child_unrecorded`, only with the launcher proven gone. *(Withdrawn in revision 6: settled by the life lock instead)* |
| (3) The classifier's callers | `stop` answered `checked` on any launcher exit | §6: `stop` (and the replayed `stop`) follows the settled/unsettled classifier, as `retire` does. Disposal and recovery take nothing as proof |
| (4) One clock, one bound | `killMs` ran from `TERM` in one place and from `stop` in another. The create bound left out the cleanup after a refused go | §6: one clock from the `stop` line (`TERM` at `+graceMs`, `KILL` at `+killMs`, as §8.5). The create handler's cleanup is decoupled: a later `stop` or `retire` joins it. Bounds are named per phase |
| (5) The acknowledgement | A hello was taken to satisfy "the terminal receipt is recorded" | §7: named predicates (`terminalWriter`, `createAnswered`, `capture: none` only with no `turn/end` on both sides, and the rest), for the core and ledger owners to bind. No record is ever asserted that doesn't exist |

**Revision 4, after Codex's CX-0144 recheck of revision 3** (the same comment, updated; reviewer packet [`dc538c17`](https://github.com/davidelaverga/Sophia/blob/dc538c175bd8869dd0a8c5a4fe3b2c69d0873f9b/docs/coordination/CON-01/CX-0144.md)), which read revision 3 (`5969756f`, SHA-256 `55d743dd…`).
- **Codex withdrew P1-E's "stranded for ever".** The cursor's replay of the unanswered `create` reaches a writer.
- **The joint runtime owner's r2 record** (`f4472120`) conditionally accepts A–D and requires the startup bounds. Its corrected record (`f42cdd11`) withdraws its P1-E. Neither is an ACK.

Revision 4 changes only these:

| CX-0144 | What was wrong in revision 3 | Where it is corrected |
|---|---|---|
| P1-E, withdrawn | Revision 3's table said nothing ended a claimed `pending` request, and §10 and CC-0170 called that a fail-before. The replay does end it: the new bridge's claim is refused, and it answers `outcome_unknown` (§8.2.1) | The P1-E row below, §6, §10. Hello's table stays as an **engineering choice** for the core and ledger owners, with its own reason (§6), not as a missing writer. CC-0170's fail-before attribution is withdrawn in CC-0171 |
| Queued stop | "a queued `stop` runs at most `goWaitMs` later" ignored the claim, the startup and `ready` before `go` | §6: named bounds for the create handler (claim, ready, go) and for the stop (grace, kill, exit, settles). §10: a `stop` in each phase |
| Blocking calls | The 50 ms poll was presented as a bound on a blocking copy or `fsync` | §5: the poll interval versus the `alarm` fallback, and that an `alarm` exit proves nothing |
| No `pidfd` | Closing the gate and waiting on the pid assumed a child at the gate; one stalled before it could hold the launcher | §5: the child's own `alarm` before its `exec`, and a bounded `waitpid(WNOHANG)` with no signal. Exit 74 `child_unsettled` claims nothing |
| Proof | Launcher exit, `alarm` or `PDEATHSIG`, or a home with no lease, could read as "the child is gone" | §5: the lease is the first file (so no lease means no fork), and exits are settled or unsettled. §7: `retire` by what is actually proven |

**Revision 3, after Codex's CX-0143/CX-0144** ([#198 comment 6117118271](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6117118271); reviewer packet `815bccc3`), which read revision 2 (`1e5f9469`, SHA-256 `125fd49a…`) in full.
- Codex found A–D materially amended, and one more P1 open.
- The joint runtime owner's r1 record (`e24c0cf5`) is CHANGES_REQUIRED at revision 1. Revision 2 is under its review, not accepted.

Revision 3 changes only these:

| CX-0143/0144 | What was wrong | Where it is corrected |
|---|---|---|
| **P1-E** (as CX-0143 raised it; withdrawn by CX-0144) | CX-0143: a claim committed under one bridge, with that bridge dying before `go`, had no hello rule: a new hello terminalized only `running` requests. **Corrected in revision 4:** the cursor replays the unanswered `create` (0012:398-401), the new bridge's claim is refused, and its `outcome_unknown` receipt ends the request (§8.2.1). So it was never stranded | §6: hello's reply branch as one atomic table, by request, claim and lease, with unclaimed `pending` kept distinct. The replayed `create` (`runtime_cursor`, 0012:398-401) gets a truthful receipt. §7: `retire` for no home and for each partial home, never claiming a deletion that didn't happen. §10: every crash point and crossing as a test |
| Guardian waits | The launcher's waits before the runtime started (its setup, the exec gate, the exec-status read) didn't all honour a cancellation or the end of the control channel | §5: every wait before the runtime starts is a bounded poll of the control channel, its child's `pidfd` and its own pipe. A self-armed `alarm` is the last resort. New exit codes: 72 (cancelled) and 73 (the exec wait timed out) |
| Evidence | Revision 2 called pnpm's layout symlinks, citing `realpathSync`. Codex's pristine Darwin profile has 0 symlinks and 0 special files in 86 entries | §5, §9: the link rule is a policy for whatever links the Linux template has, and their actual targets are unknown. CX-0143's profile-only copy is added as the Darwin baseline only |

**Revision 2, after Codex's CX-0142** ([#198 comment 6116884508](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6116884508)), which reviewed revision 1 (`1c404b44`, SHA-256 `b088c4d0…`). The direction stays: (c), with the bridge owning fd 3. Revision 2 corrected three lifecycle findings and two details:

| CX-0142 | What was wrong | Where it is corrected |
|---|---|---|
| **P1-A** | The bridge stopped the child with `ChildProcess.kill`, which is a numeric `kill(pid)`. libuv reaps every exited child before running their callbacks, so a stop can name a freed pid. Revision 1's "`kill()` after the exit returns `false`" check didn't cover that window | §2, §3, §5, §6: the launcher stays resident and holds a `pidfd` for its one child, acquired before that child may `exec`. The bridge never sends a signal; it writes control lines |
| **P1-B** | `ready` isn't a committed running request. The `delivered` receipt travels by its own queue, so a reserve could arrive while the request is still `pending` and be refused (`reply_not_running`, S2 :311) | §4, §6: a run gate. The child takes no step and makes no call until the API has committed `pending` → `running` (`conversationGo`, 0049), with lost-answer replay and withdrawal before go |
| **P1-C** | Hello marked open reservations `uncertain`, but recovery promised to resend the journaled settles, which S2 refuses for `uncertain` (:364-366). `conversation_reconcile` is a `no_proof_source` stub (:407-411) | §6, §7: a recovery table per ledger state. Settles finish before any terminal receipt; late usage is persisted with its ordinal; reconciliation stays separately authorized, through 0049's proof source |
| Detail | §5 refused every symlink in the profile copy, but pnpm's install has them. CX-0140 was cited beyond what it shows | §5: a named copy recipe and digest, with a rule for link targets. §9: CX-0140 cited as the Darwin runtime-profile baseline only |
| Detail | §9 left a reply child able to signal other processes of the same uid | §5: the filter allows signals only to the process itself, and denies creating `AF_UNIX` sockets. §9 names what remains |

**What it is not:**
- Nothing here is written to any held file.
- No runtime, dsh, provider, credential, host or live effect was used. The only things run were L0 checks of Node, Python and the kernel, on owned processes in CON's scratch (§9). No PID reuse was attempted, and nothing outside those owned processes was signalled.
- It doesn't change option C, B-1's isolated home per reply, the one pinned harness, or the request's cumulative allowance (§8). It doesn't ask Davide anything.
- The source freeze, the Luis, core and ledger ACKs, and the exact accepted base still apply. So do Q6, Q8–Q12 and D-4. The Studio lane stays held.

**Read at** `7d8f415f`. For `apps/execution-host`, `packages/dsh-bundle`, `scripts`, `config`, `renderers`, `tests/integration` and `tests/support`:
- `7d8f415f` is byte-identical to the plan's `f36a8fa0`, so the plan's line numbers hold.
- **Later `main` commits,** up to the one this revision was written against, change these paths only in `scripts/paperclip-*.mjs`. (CON's own unmerged `0048` is on the reply branches, not on `main`.) No line reference here depends on `main`.

Abbreviations:
- `supervisor:` is `apps/execution-host/src/runtime-supervisor.ts`;
- `bridge:` is `packages/dsh-bundle/src/control-bridge.ts`;
- `index:` is `packages/dsh-bundle/src/index.ts`;
- `transport:` is `packages/dsh-bundle/src/transport.ts`;
- `S2` is `db/candidates/con01-s2-conversation-reply-ledger.sql`;
- `runtime_lease` is `db/migrations/0012_runtime_service.sql:386-395`. It locks the project and then the runtime instance, and refuses a bridge that is no longer the instance's (`40001`, "Runtime lease superseded"). Receipts (0016:85), observations (0023:22), `ready` (0012:615), research reserve (0025:367) and design (0039:59, 0041:46) all go through it.

Pinned-package references are to the runtime artifact that `7d8f415f`'s build reproduces, `.artifacts/runtime/node_modules/.pnpm/…` (dsh `0.2.0-rc.2`). libuv is cited from Node v24.21.0's `deps/uv/src/unix/process.c` (SHA-256 `e79f9bd90787011d`).

## 1. The choice: (c), the bridge spawns through a launcher the supervisor owns

**The facts that decide it, at `7d8f415f`:**
- **The supervisor** builds one environment for the project's dsh process: supervisor:131-155. It holds the bridge URL and token (:151-152), with `extraEnv` spread last (:153). It spawns that one process with `stdio: ['ignore','pipe','pipe']` (:183), and keeps no channel to it beyond those two output pipes.
- **The bridge runs inside that dsh process.** `apply` builds it with the service binding and the journal directory (index:240-262, the service at :253, the journal at :255).
  - It owns the one `ServiceTransport`, whose `bridgeInstanceId` is the bridge's random `instanceId` (bridge:154, :170-172).
  - It is the only poller of runtime commands (bridge:358-376).
  - It serializes each attempt's commands (bridge:651-672) and answers them (bridge:694-732).
  - Its model-call accounting is an in-process `llm/stream` hook (bridge:295-306; `metered` :467-533, `meteredDesign` :543-586).
- **So a reply `create` arrives in the bridge, in the project's dsh process.** And a child's fd 3 is held by whichever process spawned the child: the other end of the socket is in that process.

**(c) is chosen: the bridge spawns each reply's launcher itself, and the launcher is code the supervisor owns and names.** The launcher passes fd 3 through to the reply's dsh and closes its own copy, so fd 3 runs between the bridge and the reply's dsh only. The bridge then holds all of these in one process, the same one that already holds the transport and the receipts:
- the claim and the run gate;
- fd 3's parent end;
- the relay;
- every transport call: claim, go, reserve, settle, observations, acknowledged;
- the epoch.

The launcher holds the reply's process identity (§2). The supervisor owns the code and the paths it hands the bridge at launch: the launcher, the reply root, the reply template and its digest. It also runs the restart sweep. The child's relay belongs to the bridge **because the bridge is the spawning process**, and fd 3's only two ends are the bridge's and the child's.

**(a), the supervisor relays, is not chosen.**
- The `create`, and its prompt, arrive in the bridge. The supervisor would need a new bridge-to-supervisor channel carrying the prompt. That is a second copy of the prompt in a second parent, where the binding allows one pipe (§8.5, "The parent retains no content").
- It would need its own transport with the same token: two `bridgeInstanceId`s for one unit. The claim's lease would name the supervisor while the receipts come from the bridge.
- §8.5's eighth barrier condition, the parent's own (the relay `closed`), would sit in the supervisor while `retire` is answered by the bridge. The barrier would then span two processes.
- The supervisor has no transport, poll, journal or accounting today. (a) builds a second control plane.

**(b), the descriptor passed to the bridge, is not chosen.**
- The supervisor and the dsh process share no Unix socket today (supervisor:183). Node's only public API for passing a socket to another running process is a child-process IPC channel (`subprocess.send(message, socket)`). That would mean adding an `'ipc'` slot to the project's dsh process, and `process.send`/`'message'` are visible to every plugin in it.
- The supervisor would still have spawned the child, so its exit and its signals would sit in one process and its fd 3 in another.
- The bridge would still need a channel to ask for each child.

## 2. Who owns what, and who may signal

```
execution-host supervisor (Node)       the launcher path, the reply root, the reply template and digest, the sweep
└─ the project's dsh (Node; the bridge)   the claim, the run gate, fd 3's parent end, the relay, the transport;
   │                                        the launcher's control pipe. It never sends a signal
   └─ reply-launch.py run (Python, resident)   the pidfd of its one child; the only sender of a reply's signals
      └─ the reply's dsh (Node, the reply template)   fd 3's child end; no process, no signal but to itself
```

| Owner | Owns | Never holds or does |
|---|---|---|
| Supervisor (held) | `SupervisorOptions.replies`; the `SOPHIA_REPLY_*` environment it gives the bridge; `sweepReplies()`; the reply template's install and digest (`scripts/runtime-host.mjs`, `scripts/lib/profile.mjs`) | A reply's prompt, fd 3, any reply output. Its `this.output` stays the goal path's (supervisor:209-215) |
| The launcher, `apps/execution-host/reply/reply-launch.py` (new, held; supervisor-owned code in the runtime image) | The home's creation, the lease, the profile copy and check, containment, the fork and the `exec`; **a `pidfd` for its one child, and every signal sent to it**; `sweep`, `check`, `probe`, `digest` | Content. It reads no prompt and writes none. It never signals a numeric pid |
| The bridge (held) | `ReplyChildren`; each `ReplyChild` (the launcher's `ChildProcess`, used to write its control pipe and observe its exit) and `ReplyRelay` (fd 3); the claim, go, reserve, settle, observation and acknowledged calls; the reply's receipts | Any signal: no `ChildProcess.kill` and no `process.kill` on any reply path. The child's service credential: the child has none (§4) |
| The reply's dsh (the same pinned dsh, the reply template) | One agent, `sophia-<attemptId>`, with no tools; the projection; its journal in its home | `SOPHIA_BRIDGE_URL`, `SOPHIA_BRIDGE_TOKEN`, any path outside its home, any process creation, any signal to another process |

**Why the bridge may not signal (CX-0142 P1-A).** Node's `subprocess.kill` is libuv's `uv_process_kill`, which is `kill(process->pid, signum)` on a number (`process.c:1097-1105`). `uv__wait_children` first reaps every exited child into a pending list, and only then runs their exit callbacks, one at a time (`process.c:101-176`). So JavaScript running in one child's exit callback can still call `kill()` on a sibling whose pid was already reaped and freed. Revision 1's L0, `kill()` returning `false` after the `'exit'` event, doesn't cover that interval or pid reuse. It is withdrawn as evidence of identity.

**The kernel identities, all acquired before the process they name can do anything:**
- **The launcher's `pidfd` for the reply's dsh.**
  - **When it is taken:** `pidfd_open(child)` right after the fork and the child's lease entry. The child is still waiting at the gate (§5), where it has done nothing but arm its own bound and close the unused pipe ends it inherited (revision 6).
  - **Why the pid can't be reused first:** the child is the launcher's own unreaped child, and `SIGCHLD` is `SIG_DFL` (never `SIG_IGN`, which would reap it automatically). Only the launcher can reap it, and it does so only through `waitid(P_PIDFD, pidfd)`.
  - **Every signal goes through it,** with `pidfd_send_signal`. A signal to an exited but unreaped child is discarded; after the reap the call gets `ESRCH`. Neither can reach another process.
  - **No numeric fallback.** If `pidfd_open` fails, the launcher sends no signal at all:
    - It closes the gate without its byte. The child, which has nothing but trivial steps before the gate, exits there at once. Its own `alarm` is behind that.
    - It waits, bounded by `childSettleMs`, with `waitpid(WNOHANG)` on its own child, which can't be another process.
    - **Reaped:** exit 69.
    - **Otherwise:** exit 74 `child_unsettled`, which proves nothing (§5).
- **Parent-death signals.** The launcher arms `PDEATHSIG` against the bridge and checks `getppid()` (`owned-exec.py:13-16`). The reply's dsh arms it against the launcher and checks the same way. If the bridge dies, the kernel kills the launcher, and then the reply's dsh. Both are bound to the parent relation itself, not to a number.
- **The bridge's part is a pipe.** It writes `TERM` or `KILL` lines to the launcher's control pipe, or closes it (which the launcher treats as `KILL`), and observes the launcher's exit. A write after the launcher exited gets `EPIPE` and reaches nothing.

**Pre-existing, unchanged, and named:** the goal path's supervisor stops the project's dsh with the same `ChildProcess.kill` (supervisor:200, :258, :263). Q7 doesn't widen that, and doesn't change it either. It's named here for the owner.

## 3. Descriptors, and who holds each end

**The bridge spawns the launcher:**
```
spawn(SOPHIA_REPLY_PYTHON, ['-I', launcher, 'run', …], { stdio: ['pipe','ignore','ignore','pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, cwd: '/' })
```
- **fd 0, the control pipe:** bridge → launcher; `TERM` and `KILL` lines. "Pipe" here is Node's `'pipe'`, an `AF_UNIX` stream socket, like fd 3. The launcher never reads fd 3.
- **fd 3, the reply socket:** passed to the reply's dsh.
- **The credential:** once D-4 binds a route, the launcher's environment also gets that route's credential variable, by name, from the project's dsh environment (supervisor:137-140), and nothing else.

**Exactly four descriptors survive the reply's dsh `exec`:**

| fd | What | Opened by | The other end |
|---|---|---|---|
| 0 | `/dev/null`, read | the child, over the inherited control pipe, before the filter | — |
| 1 | `diag/stdout`, `O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW`, 0600 | the launcher, after it creates the home, before the fork | — |
| 2 | `diag/stderr`, the same | the launcher | — |
| 3 | an `AF_UNIX` `SOCK_STREAM` socket, duplex (libuv makes `'pipe'` as a socketpair) | Node's `'pipe'`, in the bridge | the bridge: `child.stdio[3]`, owned by the reply's `ReplyRelay` |

- **The only other descriptors:** the gate's read end, closed before the `exec`; and the exec-status pipe's write end and the lease's descriptor with its life lock (revision 6, §5). Those two are close-on-exec, so the `exec` itself closes them. L0 (§9) found exactly 0–3 open in the new image, and revision 6's run found the lease's descriptor gone from it.
- **Right after the fork, each side closes the pipe ends it doesn't use (revision 6):**
  - the child closes its inherited gate write end and status read end;
  - the launcher closes the gate's read end and the status pipe's write end.

  Each pipe then has one writer, so its end-of-file means what §5 says.
- **The launcher closes its own copy of fd 3** once the child has it, so the two ends are the bridge's and the reply's dsh's, and each sees the other's end-of-file.
- **The launcher checks fd 3** with `getsockopt` (`SO_DOMAIN` `AF_UNIX`, `SO_TYPE` `SOCK_STREAM`), else exit 64.
- **fd 3's lifetimes:**
  - **The child's end:** the reply row opens it once, as `net.Socket({ fd: 3 })`. It closes when the child exits.
  - **The parent's end:** the relay keeps it open after the child's exit and reads the tail to end-of-file. It is destroyed only when the relay is `closed` (§7), or when the bridge is disposed.
  - **Each side treats the other's end-of-file as "my peer is gone".** The child exits on it (the binding's "exits when its control pipe closes"). The parent classifies the relay on it.

**An amendment to BINDING_MAP §8.5, for the owner to agree:**
- **What §8.5 says:** the four were "the prompt pipe (read), fd 3, stdout, stderr", with the prompt on stdin.
- **Here:** fd 0 is `/dev/null`, as on the goal path (supervisor:183), and the prompt is the first parent-to-child line on fd 3. The count stays four.
- **Why:**
  - **A parent-to-child channel is needed anyway** for the run gate and the reply's own accounting (§4). One ordered stream carries the prompt, the gate, the answers and the stop.
  - **Every `--profile` boot loads `dsh-cmdline`** (`provideCmdline`, dsh `lib/profile-boot-BZ2ZjNWi.js:276`), which builds `process.stdin` at import (`dsh-cmdline` `lib/index.js:35`). Only the stdio apps `dsh-acp-app` and `dsh-sdk-app` tie their exit to stdin's end (`exitOnStdinEnd`, :50-72), and neither is in the runtime profile. With fd 0 `/dev/null`, the prompt never sits in a stream that any plugin can reach as `process.stdin`.

## 4. fd 3: the line contract

**Framing.** Both directions carry UTF-8 JSON objects, one per line, each with a type `t`, and `additionalProperties: false` at every level.
- **Child to parent:** each line is bounded at **1 MiB, incrementally, before any parse** (§8.5).
- **Parent to child:** the `start` line is bounded at 2 MiB, which covers a prompt at the wire's 200,000-character `maxLength` at 6 bytes per character. Every other parent-to-child line is bounded at 4 KiB.
- **Either side, on a line that breaks its bound or schema, stops reading.** The parent then fences (`relay_invalid`); the child exits.

| Direction | `t` | Fields | When |
|---|---|---|---|
| parent → child | `start` | `attemptId`, `sessionId` (= `sophia-<attemptId>`), `epoch`, `nonce`, `route` `{provider, model, reasoningEffort}`, `maxTokens`, `prompt` | Exactly once, first |
| parent → child | **`go`** | — | At most once: only after the API answered `go` (§6). **Before it, the child takes no agent step and makes no model call** |
| parent → child | `reserved` / `refused` | `n`, and `code` when refused | The answer to the child's `reserve` `n` |
| parent → child | `settled` / `settle_unknown` | `n` | The answer to `settle` `n` |
| parent → child | `stop` | — | Withdrawal, the deadline, a fence, a refused or unconfirmed go |
| child → parent | `status` | `s`: `ready`, or `failed` with a fixed `code` | `ready` once the agent exists, before any step. `failed` (`containment_unavailable`, `profile_mismatch`, `home_exists`) only from the launcher or its child before `exec`. `child_exited`, `timeout`, `runtime_busy` and `go_unconfirmed` are the parent's own codes, never a line |
| child → parent | `obs` | the reply-only projection, §8.5's table (five types), in `RuntimeObservation`'s envelope. **`assistant/message` and `compaction/summary` add `ordinal`** (1–2): the reservation their model call consumed | After the child has journaled it |
| child → parent | `reserve` | `n` (1, 2, …), `tokens`, `priceMicros` | After `go`, before each model call; the call waits for the answer |
| child → parent | `settle` | `n`, `outcome` (`settled` or `uncertain`), `used` `{calls, tokens, priceMicros}`, `usage` | After the call ends, success or not |

**Rules the parent enforces:**
- **No `reserve` is accepted before the parent wrote `go`.** One that arrives earlier is a protocol violation: `relay_invalid`, with no call made.
- **`n` must be the next ordinal.** S2's ledger allows ordinals 1 and 2, in order and never reused (S2:272-296). A third is answered `refused` `invalid_ordinal`, and the call doesn't leave.
- **The parent builds each reserve body itself:** the reply's request id, the ordinal, and the route, credential reference and owner-resource reference from its own claimed `create`. From the child it takes only the amounts. Then it calls `conversationReserve`.
- **Both the reserve and the settle are resent under the same ordinal until answered,** within a bound. This is `boundedAccounts`' existing pattern (`packages/dsh-bundle/src/review-tools.ts:159-173`, used for designs at bridge:551-554).
  - A reserve with no answer refuses the call.
  - A settle with no answer by the reply's one shared settle deadline (§6) leaves the reservation open. §6's ordering and §7's table say what follows; a settle is never sent after a terminal receipt.

**`ordinal` on the usage-bearing items** amends §8.5's projection table. It is correlation, so §8.2.2's scrubbed form keeps it. It is what ties each recorded usage to its reservation (§7).

**Order is the safety.** Every line rides one stream, in order.
- **A held observation also holds the `reserve` behind it.** While delivery is blocked, no new model call can leave; the reply's deadline still runs.
- **The answer to a `reserve` is written only after the API answered.**
- **The run gate isn't ordered by fd 3 alone.** The `delivered` receipt travels its own path (bridge:667, :684-690), so `go` waits for the API's own committed answer (§6), not for the receipt.

**The child has no service credential.** Its environment never has `SOPHIA_BRIDGE_URL` or `SOPHIA_BRIDGE_TOKEN`. It reaches the service only through these lines, so a reply child can't call any runtime route.

## 5. The launcher, its containment, and settling descendants

**`reply-launch.py run`**, its argv: `--root <projectRoot>/replies/gen-<generation>` (this launch's `SOPHIA_REPLY_ROOT`, §6), `--attempt <id>`, `--parent <bridge pid>`, `--nonce <hex>`, `--node`, `--entry` (`unit.runtimeDir` + `unit.launcherEntry`), `--runtime-dir`, `--template`, `--template-digest`, `--profile-name`, `--unit <runtimeUnitId>`.

**In the launcher, before the fork:**
1. **The parent binding:** `prctl(PR_SET_PDEATHSIG, SIGKILL)`, then `getppid() == --parent`, or exit 119 (`owned-exec.py:13-16`). `SIGCHLD` is set to `SIG_DFL`, never `SIG_IGN`, and `SA_NOCLDWAIT` is never set, so only this launcher reaps its child. Node spawns from its loop thread, which lives as long as the process.
2. **fd 0 (the control channel) and fd 3 must both be `AF_UNIX`/`SOCK_STREAM`,** as Node's `'pipe'` makes them, or exit 64. Then `alarm(setupSeconds)` (30 s by default): the last-resort bound over everything before the runtime starts (below).
3. **Admission, under its generation's root (revisions 5 and 6).** `--root` is this bridge generation's own root, `<projectRoot>/replies/gen-<generation>` (§6). It must exist (else exit 78 `root_sealed`), be owned by the effective uid, have mode 0700, and not be a link.
   - **The admission lock (revision 6).**
     - The launcher opens `<root>/.admit` by name (`O_RDONLY|O_NOFOLLOW|O_CLOEXEC`; `ENOENT` is exit 78).
     - It takes `flock(LOCK_SH)`, polled with `LOCK_NB` like every other setup wait.
     - **While holding it,** it verifies by name that `<root>/.admit` is still the file it locked (the same device and inode), else exit 78.

     A launcher that verifies is **admitted**.
   - **Every path is resolved from `--root` by name.** During admission the launcher holds exactly two descriptors that reach the root: the admission lock, and, from step 4, the lease.
     - A by-name step after its root was renamed fails (`ENOENT`, exit 78).
     - An operation already in flight still completes into the renamed root, and so does a write through a descriptor already open (CX-0148).
     - The admission lock accounts for both (the seal, below).
   - **Then `mkdir(<root>/<attemptId>, 0700)`,** which may not already exist. `EEXIST` is the leftover case, `home_exists`, exit 71. `ENOENT` means the root was renamed meanwhile: exit 78.
4. **The lease, the first file in the home, and its life lock (revision 6).**
   - **The life lock.** `lease.json` is created by name with `O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC`, 0600. The launcher at once takes `flock(LOCK_EX)` on that descriptor. It never closes or unlocks it, so the lock is held until the launcher exits.
   - **The child's copy.** The forked child inherits the descriptor, and only the child's `execve` (close-on-exec) or its exit lets go of that copy.
   - **What the lease holds before any fork.** Two records; then the file and its directory are fsynced:
     - **the launcher's own entry,** with §8.5's five fields:
       - the pid;
       - `/proc/<pid>/stat` field 22, which an `exec` doesn't change;
       - the boot id;
       - the executable: the Python realpath for the launcher, the realpath of `--node` for the child;
       - the nonce;
     - **a fork intent (revision 5).**

   **Admission ends here.** With both records whole and durable, the launcher closes the admission lock. A failure before that is exit 77 `lease_failed`, or 78 if the root was renamed, with no fork either way. **A home without a lease never had a child, and neither did a lease without both whole records.**
5. **Then the rest of the home:** `home/`, `home/tmp/`, `dsh-home/profiles/`, `work/` and `diag/`, each 0700. fds 1 and 2 are opened onto `diag/stdout` and `diag/stderr` and `dup2`'d into place.
6. **The profile copy** (below), and its digest check, else `profile_mismatch`, exit 70.
7. **The capability check:** a Landlock ABI of at least 4, `seccomp`, x86_64, and `pidfd_open`. Else `containment_unavailable`, exit 69.

**Between steps 3 and 7, and between copied files,** the launcher polls fd 0 without blocking. A `TERM` or `KILL` line, or end-of-file, ends the setup: exit 72 `cancelled`. No child exists yet, and the partial home stays for `retire` (§7).

**The fork.** The gate and the exec-status pipe are made first.
- **Right after the fork (revision 6),** the launcher closes the gate's read end and the status pipe's write end. The child closes the other two ends (a, below).
- **So each pipe has exactly one writer:**
  - the child sees the gate's end-of-file the moment the launcher is gone;
  - the launcher sees the status pipe's end-of-file at the child's `exec` or exit (CX-0148's joint record).

**In the child: nothing before the gate but its own bound (revisions 5 and 6).**
- **a. Its bound, its unused ends and its parent binding,** and nothing else:
  - first `alarm(childSetupSeconds)` (10 s by default);
  - then it closes the gate's write end and the status pipe's read end that it inherited;
  - then `PDEATHSIG` (`SIGKILL`);
  - then `getppid()` must be the launcher, or exit 119.
- **b. The gate.** Wait for the launcher's one byte, then close the gate.
  - An end-of-file instead ends the child at once, with exit 118. That happens when the launcher closes the gate without the byte, or dies; the child holds no write end of its own (a).
  - **Before this point the child has opened, written and executed nothing.** That is proof that nothing executed. **It is not process settlement.** Until it exits, this child holds what it inherited:
    - fd 0's copy of the control channel;
    - fds 1 and 2, onto `diag/`;
    - fd 3;
    - the gate's read end and the status pipe's write end;
    - the lease's descriptor, with the life lock.

    Its settlement is the life lock (below).
- **c. Containment, after the gate:**
  - `/dev/null` onto fd 0;
  - `RLIMIT_CORE` 0 (`landlock-launch.py:99`);
  - **Landlock:** an ABI of at least 4 (:96-98), with every filesystem right that ABI defines handled.
    - **Read and write beneath `home/`, `dsh-home/` and `work/` only (revision 6).** The home's top directory, `lease.json` and `diag/` get no right at all. So the reply's dsh can't read, rewrite, rename, lock or remove its own lease, which is the settlement record. Its fds 1 and 2 are already open onto `diag/`.
    - Read and execute on the runtime directory, the pinned Node, and the system libraries and certificates (`/usr/lib`, `/lib*`, `/etc/ld.so.cache`, `/etc/ssl`, `/etc/resolv.conf`, `/etc/hosts`, `/etc/nsswitch.conf`), plus `/proc/self`, `/dev/null` and `/dev/urandom`. Nothing else; P7's trace fixes the exact read list. Then `no_new_privs` (:139) and `restrict_self` (:141);
  - **the self-test:** creating a file in `<root>`, outside the home, must fail, and so must opening `lease.json`;
  - **the seccomp filter** (below), built with the child's own pid, which the `exec` doesn't change.

  A stall here falls in the launcher's exec-status wait, where the `pidfd` is already held.
- **d. The `exec`.** Close everything but 0–3 and the two close-on-exec descriptors: the status pipe's write end and the lease's. The `execve` closes those two. `chdir(work/)`. Then `alarm(0)`, since an alarm survives `execve`. Then `execve(--node, [node, entry, '--profile', name], env)`. `env` is built here from nothing:
  - `HOME`, `TMPDIR` and `DSH_HOME` under the home, and `SOPHIA_WORKSPACE` its `work/`;
  - `DSH_TELEMETRY_DISABLED=1`, `LANG=C.UTF-8`, `PATH=/usr/bin:/bin`;
  - `SOPHIA_RUNTIME_UNIT`, `SOPHIA_REPLY_FD=3`, `SOPHIA_REPLY_NONCE`;
  - the route's credential, by its one name, once D-4 binds one.

  No other name passes, so `extraEnv` can't reach a reply child's `HOME`, `TMPDIR` or `DSH_HOME` (the plan's §2.1, item 3).
- **A failure in c or d** writes one `status` `failed` line on fd 3 and exits 69. A failed `execve` writes a byte on the status pipe.

**In the launcher, after the fork. The gate opens only when the child is both recorded and held:**
1. **The child's entry** is appended to the lease and fsynced, from `/proc/<child>/stat` of its own unreaped child.
2. **`pidfd_open(child)`.**
3. **If either step fails,** the gate is closed without its byte. The child, which is at the gate or about to reach it, exits 118. The launcher sends no signal: it polls `waitpid(child, WNOHANG)` on its own unreaped child until `childSettleMs` (`childSetupSeconds` plus a margin).
   - **Reaped:** exit 77 (the entry failed) or 69 (no `pidfd`), settled.
   - **Not reaped by then** (only a process in uninterruptible sleep): exit 74 `child_unsettled`, which claims nothing.
4. **Close its fd 3, then write the gate's byte.** From here on, the child is recorded and its `pidfd` is held.
5. **The exec-status wait:** a poll of the status pipe, fd 0 and the `pidfd`, until `execWaitMs` (10 s by default). Each outcome:
   - **end-of-file on the status pipe:** the `exec` succeeded. Then `alarm(0)`;
   - **a byte on it:** the `exec` failed. The child is killed through the `pidfd` and reaped; exit 69;
   - **a control line, or end-of-file on fd 0:** the child is killed through the `pidfd` and reaped; exit 72 `cancelled`;
   - **the `pidfd` readable first** (the child died before its `exec`): reaped; exit 69;
   - **the deadline:** the child is killed through the `pidfd` and reaped; exit 73 `exec_timeout`.
6. **Loop on fd 0 and the `pidfd`:**
   - a `TERM` line is `pidfd_send_signal(SIGTERM)`;
   - a `KILL` line, or end-of-file on fd 0, is `pidfd_send_signal(SIGKILL)`;
   - the `pidfd` readable means `waitid(P_PIDFD)`, then exit: 0 if dsh exited 0, 75 if it exited non-zero, 76 if a signal ended it.

**If the launcher itself dies between the fork and step 4** (a crash, or its own `alarm`), the gate's write end closes with it. The child exits 118 at the gate, or by its `PDEATHSIG`, never having opened, written or executed anything. The lease then shows the fork intent with no valid child entry.

**That child's settlement is the life lock (revision 6).** It never reaches its `execve`, so it holds the lease's descriptor until it exits.
- The life lock is free only once the launcher and the child have both exited.
- At that point every descriptor the child inherited is closed too.
- Until then, `check` reports `unsettled` (below), however long the child is held.

No pid is used, so none can be reused.

**Exit codes, and which of them prove anything.**
- **A settled exit** is one the launcher makes only after it reaped its child, or before any fork.
- **What it proves:** only what that launcher could have done (revision 7). It counts as proof only when **the live bridge that spawned the launcher sees it**, and only for the home that launcher created (scoped live proof, below).
- **Anything else is unsettled** and proves nothing; §7 then needs `check`.

| Exit | Meaning | Settled |
|---|---|---|
| 0 | dsh exited 0 | yes |
| 64 | usage: a bad argv, or fd 0 or fd 3 not an `AF_UNIX` stream | yes (no fork) |
| 69 | `containment_unavailable`, a failed or early-ended `exec`, or no `pidfd` (the child reaped at the gate) | yes |
| 70 | `profile_mismatch` | yes (no fork) |
| 71 | `home_exists`: this launcher forked nothing, and never created, opened or locked the home that exists | yes, for this launcher only. **Never proof for the existing home** (revision 7) |
| 72 | `cancelled` before the runtime started | yes (no fork, or the child reaped) |
| 73 | `exec_timeout` | yes (the child reaped) |
| 74 | `child_unsettled`: the child not reaped within `childSettleMs` | **no** |
| 75 | dsh exited non-zero | yes |
| 76 | a signal ended dsh | yes |
| 77 | `lease_failed` | yes (no fork, or the child reaped at the gate) |
| 78 | `root_sealed`: a newer generation renamed this root, seen at admission or at a later by-name step | yes (no fork) |
| 119 | wrong parent | yes (no fork) |
| ended by a signal (`SIGALRM`, its own `PDEATHSIG`, …) | `setup_timeout` or killed | **no** |

**Scoped live proof (revision 7; CX-0151's P1).** A settled exit is proof for exactly one home: the one that launcher created. It needs all three:
- **the live bridge reaped the launcher it spawned for this attempt, and the exit was settled;**
- **the home is that launcher's.** The bridge reads the home's `lease.json` by name, at `<its own root>/<attemptId>`, with `O_NOFOLLOW`. Its launcher record must be whole and carry the nonce the bridge generated for that one spawn. Nonces are fresh and random per spawn, so a home created by any other launcher carries another nonce, or none.
  - **The locator checks (revision 8):** the read uses `check`'s no-link checks. The root and the home must not be links, and must be owned by the uid with mode 0700.
  - **When it falls back to `check` across every root:** if its own root was renamed, or a home for the attempt also exists in another root.
- **all its possible writers are covered:**
  - that launcher, now reaped;
  - its one possible child, which a settled exit reaped;
  - nothing else: any other launcher for the same path stops at `mkdir`'s `EEXIST` and writes nothing.

**Everything else needs `check` (§7):**
- a home whose lease carries another nonce, or no readable nonce. That includes the home behind exit 71, which the exiting launcher neither created nor locked;
- a zero-byte lease, or a torn launcher record;
- an empty home, or an absent one;
- any unsettled or missing exit.

**What exit 71 proves:** only that the new launcher forked nothing. The existing home keeps its lease, its life lock and any recorded child, and it stays until `check` verifies it on its own terms.

**Bounded before the runtime starts, and what that doesn't promise.**
- **Normally,** a cancellation is seen at the next poll point: between setup steps and between copied files, and at once during the exec-status wait.
- **A single blocking call delays it until that call returns.** That could be the copy of a large file, or an `fsync` on a slow disk. 50 ms is the poll interval, not a bound on such a call.
- **If a call never returns:**
  - the launcher's `alarm` (`setupSeconds`) ends the launcher, and that exit is unsettled;
  - a child before its gate has only trivial steps, with its own `alarm` behind them.
- **Nothing is ever signalled by number.**

The L0 cases are in §9.

**The generation seal, and the admission drain (revisions 5 and 6; CX-0145, CX-0148).** Before each launch, `sweepReplies` (§6) does three things:
- it **renames** every older `gen-*` root under `<projectRoot>/replies` to `sealed-<generation>`;
- it fsyncs `<projectRoot>/replies`;
- it creates the new generation's root fresh, with its empty `.admit` (0600).

Generation ids are random and never reused. Nothing ever renames a root back or recreates an old one.
- **What the rename is: a namespace fence, and the linearization point for admission.** After it, an older launcher fails (exit 78) when it verifies its root by name under its shared lock. So does every later by-name step of any older launcher.
- **What the rename is not:** descriptor revocation, or I/O quiescence. These still complete into the renamed root (CX-0148's probe; revision 6's L0, §9):
  - a write or `fsync` through a descriptor opened before the rename;
  - an operation whose path resolution passed the root before the rename.
- **The drain.** `check` and `sweep` take `flock(<root>/.admit, LOCK_EX|LOCK_NB)` on the root they judge.
  - **The retry window (revision 7):** the attempt is retried for at most `drainWaitMs` (500 ms by default), because an admission lasts only through a `mkdir` and the lease's writes.
  - **While a launcher of that generation is admitted** (it holds the shared lock), that fails. Every absent, empty or lease-less home in that root is then `unsettled` (`admission_open`). A concurrent `check` or `sweep` holding the lock reads the same way: fail-closed, and retried. The life lock below behaves the same way.
  - **Once it succeeds in a renamed root,** no launcher of that generation is admitted. None can be admitted later either: the verification is made under the shared lock, and its root's name is gone.
  - **From then on:** a home that is absent stays absent, an empty home stays empty, and a lease's records are as final as their writer left them.

  This is the only sense in which the seal proves "no future writer", and only for those three kinds of home. **A home with a whole lease is settled by the life lock and its entries, never by the seal.**
- **In the current root (revisions 7 and 8),** a successful drain proves less, because launchers can still be admitted after it. It covers the launchers admitted now. It doesn't cover this attempt's own launcher, which the bridge may have spawned and which is held before its shared lock or its `mkdir`.
  - **It settles an empty home only together with the bridge's spawn fence (revision 8).** The fence holds while the bridge holds no unreaped launcher for the attempt, and its claim allows only one spawn. Under both:
    - the home's creator made it while admitted and no longer is, so it has exited without a lease;
    - this generation spawns no other launcher for the attempt;
    - an older generation's launcher can't reach the current root.

    Without the fence, the empty home is filesystem state only, and proves nothing about the process.
  - **It never settles an absence there,** with or without the drain. Only the bridge's spawn fence can (§7).
- **What the seal doesn't claim:** that any process is dead. CX-0145 ran the unchanged supervisor locally, with owned stand-ins: an old dsh can outlive its supervisor, and its replacement takes the same project lease. So neither a new hello, a sweep, a rename nor an absent file is used as proof of death.
- **If the seal fails,** that generation starts with replies off (§6). Homes in any root that wasn't renamed stay `unresolved`.

**What can still complete into a renamed root, by where the older launcher is when the rename happens (revision 6):**

| The older launcher | What may still complete into the renamed root | `check`, in that root |
|---|---|---|
| not yet started, or before opening `.admit` | nothing: the open by name gets `ENOENT`, exit 78 | the drain succeeds; `absent` |
| `.admit` open, not yet verified under its shared lock | nothing: the verification by name fails, exit 78 | the drain may succeed at once, since the launcher isn't admitted; `absent`, and it stays so |
| admitted, before or during its `mkdir` | at most that `mkdir`, if its path resolution passed the root first. Otherwise `ENOENT`, exit 78 | `admission_open` until the launcher exits; then `absent`, or `empty` |
| after `mkdir`, before or during the lease's `O_EXCL` create | at most that create, the same way | `admission_open`; then `empty`, or, for a zero-byte lease, `unresolved` |
| the lease open: before, during or after its writes and `fsync` | every write and `fsync` through that descriptor. Its directory `fsync` by name fails, exit 78, before any fork | `admission_open`. Then: a torn or incomplete lease is `unresolved`. A whole one goes to the life lock: once that is free, with no child entry and the launcher's entry verified, it is `gone` |
| admitted and finished (the lease whole), at any later step | writes through descriptors already open (the lease, and fds 1 and 2 onto `diag/`), and any by-name step already in flight. Its next by-name step fails, exit 78 | not an admission case. The whole lease is settled by the life lock and its entries' `pidfd` checks |

**`reply-launch.py sweep --replies <projectRoot>/replies`** (the supervisor's) and **`check --replies … --attempt …`** (the bridge's, for `retire` when it holds no handle).
- **Where they look:** for the attempt's home in every root: the current `gen-*`, every `sealed-*`, and any older `gen-*` the seal failed to rename. A home found in two roots is impossible (one claim, one launcher), and is `unresolved`.
- **In a renamed root,** both first take the drain (above).
- **For each whole lease:**
  1. **The life lock (revision 6):** `flock(LOCK_EX|LOCK_NB)` on a fresh read-only open of `lease.json`. If it fails, the launcher, or a child that hasn't executed, is still alive. `check` reports `unsettled`; `sweep` goes on to the entries.
  2. For each valid recorded entry, `pidfd_open(pid)`. `ESRCH` means `gone`.
  3. Verify the five fields from `/proc/<pid>`.
  4. Signal 0 through the `pidfd`.
  5. Only then, for `sweep`, `pidfd_send_signal(SIGKILL)`, the child before the launcher, and wait until each `pidfd` is readable.

**A mismatch signals nothing, and the home is `unresolved`.** A process that can't be identified is never signalled. That includes a child with no valid entry while the life lock is held. `sweep` can end that child's launcher through the launcher's `pidfd`, and the child then exits at the gate's end-of-file, or by `PDEATHSIG`.

**What `check` reports for each kind of home (revision 6):**

| The home | What is known | Report |
|---|---|---|
| absent, empty, or with a lease that isn't whole, in a root whose drain fails (for an absence, a renamed root) | a launcher of that generation is admitted | `unsettled` (`admission_open`) |
| absent from every root, each older root renamed and drained | no older launcher can create it (the drain). Whether this generation could is the bridge's to know: it counts `absent` only while it holds no unreaped launcher for the attempt (§6, §7) | `absent` |
| no lease, nothing else, in a root whose drain succeeds, current or renamed (revision 7) | there was never a child (step 4). In a renamed root, its creator has exited without a lease, and nothing can add to it by name. **In the current root,** the drain doesn't cover this attempt's own launcher if it is held before its shared lock or its `mkdir`. So the bridge counts that `empty` only under its spawn fence, as it does `absent` (revision 8) | `empty` |
| no lease, but other files | impossible by the order | `unresolved` |
| a lease of zero bytes, or without both whole launcher records | its writer may have died mid-write, and no fork can have followed. **Never the empty case**, and kept fail-closed, as CX-0148 asks | `unresolved` |
| a whole lease, the life lock held | the launcher, or a child that never executed, is alive | `unsettled` |
| a whole lease, the life lock free, no child entry or a torn one | the launcher has exited. A forked child held the lock until its exit, because without a valid entry it can't have passed the gate to its `execve`. So it has exited, and every descriptor it inherited is closed | `gone`, once the launcher's entry is also **verified gone** (`ESRCH`). A matching live entry is `unsettled`; a mismatch is `unresolved` |
| a whole lease, the life lock free, a valid child entry | the launcher has exited. The child may have executed and outlived it, since its copy closed at `execve` | `gone`, once both entries are **verified gone**. A matching live entry is `unsettled` (`child_live`), never settlement; a mismatch is `unresolved` |
| a host without `pidfd` or `flock` | nothing is verifiable | `unresolved` for every home with a lease |

- **The report** is content-free JSON lines: `{attemptId, root, state: gone|stopped|absent|empty|unsettled|unresolved, reason}`.
- **`check` exits 0 only for `gone`, `absent` or `empty`.**
- **What it reports stays true** once established:
  - in a renamed root, no admission can follow a drain;
  - in the current root, an absent or empty home stays so only under the bridge's spawn fence (revision 8);
  - no process can take back a life lock its holders let go.
- **`sweep` and `check` never delete:** only `retire` does (§7).

**The other subcommands:**
- **`probe`** checks step 7's capabilities and the self-test once, at host start, in a short-lived child. Its exit status is the verdict.
- **`digest <dir>`** prints the template digest (below).

### The profile copy: a template, a recipe and its digest

**The template.** At host start, the reply profile (`config/dsh/reply-rows.reviewed.json`, new, Q8) is installed once, frozen and offline, as today's `installInto` does (`scripts/lib/profile.mjs:54-67`), into a template directory.
- It is never booted, so dsh's boot-time rewrite of its profile files never touches it.
- It is then made read-only, and its digest is recorded with `reply-launch.py digest`.
- `profileDrift` (:110-134) also passes on it, as it does for the project's profile.

**The recipe, `sophia-reply-tree-v1`:** a walk with `lstat` that never follows a link, sorted by the relative path's bytes, one line per entry:
- a directory: `d <path>`;
- a regular file: `f <path> <x|-> <sha256 of its bytes>`;
- a symbolic link: `l <path> <hex of its target bytes>`.

Any other type (a FIFO, socket or device) makes the tree invalid. Hard links are read as independent files. The digest is SHA-256 over the lines joined with `\n`. Nothing is excluded: the template is never booted, so a byte-identical copy has the identical digest.

**The copy, per reply, by the launcher before any containment:**
- Directories get 0700.
- Files are created with `O_CREAT|O_EXCL|O_NOFOLLOW`, 0600, or 0700 with the exec bit, and their bytes are copied.
- **Each symbolic link is recreated with its target bytes unchanged, never followed or resolved.**
- Then the copy's digest must equal the recorded one, else exit 70.

**The link rule,** checked when the template is recorded and again on every copy:
- a relative target, resolved lexically from the link's own directory, must stay inside the tree;
- an absolute target must lie beneath the read-only runtime directory, which Landlock grants read and execute.

Any other target, or one dangling inside the tree, makes the template invalid. A bad template disables replies at host start (§6); goals are unaffected.

**Whether the installed template has any links at all is not established.** Codex's pristine Darwin profile had 0 symlinks and 0 special files in its 86 entries (CX-0142, CX-0143). `profileDrift`'s `realpathSync` (`profile.mjs:126`) resolves a link if there is one, but proves none. The rule is a policy for any link a template has. The Linux template's actual entries and targets are unknown until P1 records them (§9). If they are entries the rule refuses, that is an incompatibility to report, not a reason to loosen the rule.

### Descendants, signals and sockets: the child's filter

The seccomp filter is installed in the child after the gate, after Landlock and before the `exec` (step c). Revision 5 wrongly said "before the gate" here. It is x86_64 only, and refuses x32 and every other architecture (the renderer's prologue, `landlock-launch.py:179-186`).

| What | Rule | Why |
|---|---|---|
| `fork`, `vfork`; `clone` without `CLONE_THREAD` | `EPERM` | No process, so no descendant to settle |
| `clone3` | `ENOSYS` | The C library falls back to `clone`, whose flags a filter can read |
| `kill`, `tgkill`, `rt_sigqueueinfo`, `rt_tgsigqueueinfo` | allowed only when the target is the process's own pid (a constant in the filter); else `EPERM` | Signals reach only itself (CX-0142's containment detail) |
| `tkill`, `pidfd_open`, `pidfd_send_signal`, `pidfd_getfd` | `EPERM` | No other way to signal or reach another process |
| `socket`, `socketpair` with `AF_UNIX` | `EPERM` | No new local socket, abstract or by path; the inherited fd 3 is unaffected |
| `io_uring_setup`, `io_uring_enter`, `io_uring_register` | `EPERM` | SQE socket creation must not bypass the socket syscall predicates |

Approved CON01-FILTER-AMENDMENT (14 October 2026): the child inherits no ring descriptors. Only the already specified standard descriptors, relay and pre-exec close-on-exec status/lease descriptors are allowed. The syscall filter alone does not prove descriptor closure. This source-only amendment does not authorize installation or provider execution.

ptrace stays confined by Landlock's own domain scoping.

**Not supported:**
- **arm64,** which the runtime unit also pins a Node for (`config/runtime-unit.json:49`), is `containment_unavailable` until the owner names its filter.
- **So is Darwin,** where CX-0140 ran: it has neither Landlock nor this filter. The deploy host is the Linux execution VM.

**What follows from the filter.** A reply's dsh can start no process, so "every descendant a reply child started" is the empty set by construction. Settling a reply is settling one process:
- **its launcher's `pidfd`:** `TERM` and `KILL` from the bridge's control lines, `KILL` at the control pipe's end-of-file;
- **`PDEATHSIG`,** through the launcher, when the bridge's process dies;
- **the end-of-file on fd 3.**

No PID namespace, numeric signal, process group or uid-wide selection is involved. This answers §2.1's "Required" item and CX-0116.

**What it rests on:**
- **L0 (§9).** On Node 24.21.0, the pinned version, under this filter:
  - threads, a `worker_threads` worker and its termination, DNS, file I/O, and an HTTP `fetch` over loopback TCP all work;
  - `spawnSync` and `execFile` fail `EPERM`;
  - a signal to an owned decoy process fails `EPERM`, while a signal to itself is delivered;
  - an abstract-socket listen and a connect by path fail `EPERM`, while the inherited fd 3 still carries lines.
- **The static scan.** In the pinned set, the packages that import `child_process` are:
  - `dsh-subprocess-local` and `dsh-sandbox-local`, which the runtime profile loads for tools (`config/dsh/base-rows.reviewed.json:147-154`);
  - `node-addon-system`'s `landlock-run` entry (`lib/index.js:16`, :90). Session persistence imports only its `flock` entry, which has no `child_process`;
  - `dsh-native-command`, `dsh-host-open-in-app`, `dsh-host-directory-picker-native`, `dsh-web-app` and `libreoffice-kit`.

  A no-tools reply template needs none of them. `session-title-llm` is already disabled (`cordis.patch.yml:47-51`), so a reply makes no title call. Whether the pinned dsh boots and answers under the filter is **P7** (§9).
- **If P7 shows the pinned dsh must create a process, signal another process, or open an `AF_UNIX` socket for a reply,** that is a demonstrated incompatibility. It is reported with its exact call site, and the choice goes back to the owner. Nothing falls back silently.

**Not chosen:**
- **A PID namespace whose init is held by a `pidfd`.** It needs user and PID namespaces that an unprivileged process can create. The renderer's pattern requires root (`namespace-launch.py:7-8`, `unshare` at :60). The execution host runs on a Docker VM (`docs/pack/ops/DEPLOYMENT_BINDINGS.md:7`), whose policy on namespaces is not established.
- **A subreaper launcher** (`PR_SET_CHILD_SUBREAPER`). Its kill-and-reap loop has no stated bound against a process that keeps forking. The filter makes forking impossible instead.

## 6. The bridge, the supervisor and the transport: exact changes (all held)

**Supervisor** (`runtime-supervisor.ts`):
- **`SupervisorOptions.replies?`:**
  ```
  { launcher, python, template, profileName, templateDigest, maxChildren = 2, deadlineMs = 120_000 }
  ```
  When it is absent, nothing below runs and no `SOPHIA_REPLY_*` name is set.
- **`environment()`** adds, **after** `...extraEnv`, so a test's `extraEnv` can't redirect them:
  - `SOPHIA_REPLY_ROOT` = `<projectRoot>/replies/gen-<generation>`, this launch's own root (revision 5). `<generation>` is a fresh random id per launch. `sweepReplies` creates the root 0700, with its empty `.admit` (§5), just before the launch. Also `SOPHIA_REPLY_DIR` = `<projectRoot>/replies`, for `check`;
  - `SOPHIA_REPLY_LAUNCHER`, `SOPHIA_REPLY_PYTHON`, `SOPHIA_REPLY_NODE` = `process.execPath`;
  - `SOPHIA_REPLY_ENTRY` = `join(unit.runtimeDir, unit.launcherEntry)`, and `SOPHIA_REPLY_RUNTIME_DIR`;
  - `SOPHIA_REPLY_TEMPLATE`, `SOPHIA_REPLY_PROFILE`, `SOPHIA_REPLY_TEMPLATE_DIGEST`.

  These are paths and a digest: no secret and no content.
- **`sweepReplies()`** is new and private. It runs `spawnSync(python, ['-I', launcher, 'probe'])`, then `sweep`, each bounded.
  - **Before each launch, it seals every older generation (revisions 5 and 6, §5):** it renames each `gen-*` root to `sealed-*` and fsyncs the parent, then creates the new generation's root and its `.admit`.
    - **It never waits for a drain.** An older launcher stuck in admission delays only the proof for its own root's homes (§5), never the new launch.
    - **The rename is the namespace fence** that CX-0145's supervisor-loss crossing calls for. The drain and the life lock (§5) are the settlement CX-0148 calls for.
    - It needs no broader supervisor change, and the goal path is untouched.
  - It runs before `launch('starting')` in `start()`, before `launch('restarting')` in `recover()`, and after the exit in `stop()`. The run after `stop()` sweeps without sealing.
  - A failed probe, seal or sweep, or a template that fails its digest or link rule, is logged as a fixed token. That generation's environment then omits the `SOPHIA_REPLY_*` names, so the bridge answers reply creates `rejected` (`containment_unavailable`) before any claim. **Goals are unaffected.**
- **`launch()`, `recover()` and `stop()`** are otherwise unchanged. The goal path's spawn, collector, restart budget, lease and signals are byte-identical (§2's pre-existing note).
- **`scripts/runtime-host.mjs` and `scripts/lib/profile.mjs`:** they install the reply template, check it and record its digest at host start (§5).

**Bridge** (`index.ts`, `control-bridge.ts`; new `reply-child.ts`):
- **`BridgeSettings.replies: ReplySettings | null`,** read in `apply` (index:240-262) from the `SOPHIA_REPLY_*` names. It is `null` when any name is missing. It also holds the named bounds (revision 4):

  | Bound | Covers |
  |---|---|
  | `claimWaitMs` | the claim's resends until answered |
  | `readyWaitMs` | from the spawn to `ready`. At least the launcher's `setupSeconds` plus `execWaitMs`, plus dsh's boot |
  | `goWaitMs` | the go call's resends until answered |
  | `graceMs` (2,000), `killMs` (5,000) | **one clock, from the `stop` line** (revision 5; §8.5, step 2: "`SIGTERM` after a 2 s grace and `SIGKILL` after 5 s"). The `TERM` line is at `stop + graceMs`, the `KILL` line at `stop + killMs` |
  | `exitWaitMs` | from the `KILL` line to the launcher's exit |
  | `settleWaitMs` | **one shared deadline (revision 6)** for every pending settle of the reply: at most two ordinals (S2:281), resent in parallel. The deadline is `settleWaitMs` after the reply's process settlement point: the launcher's exit as observed, or, under a stop, `t0 + killMs + exitWaitMs` if that comes first. A settle line read after the deadline is never sent |
  | `receiptWaitMs` | `retire`'s wait for the bridge's own queued receipts |
  | `deadlineMs` (120,000) | the reply, from its spawn |
- **`dispatch`** (bridge:651-672) is unchanged. Its `parseCommand` accepts a reply binding and `retire` once the wire does (`KINDS`, `protocol.ts:28`; the wire and contracts are held).
- **`execute`** (bridge:694) gains one branch, after the unit and id checks (:697-700) and before the duplicate, epoch and `switch` (:702-727): a binding with `conversationReplyId` goes to `this.replies.execute(command)`. Reply attempts never enter `attempts` or `bySession` (bridge:144-150), so the goal path's hooks, guard and `metered` never see them.

  | Kind | `ReplyChildren` method | What it does |
  |---|---|---|
  | `create` | `createReply` | **1. Redelivery:** a command this instance already holds is answered from its recorded receipts (as bridge:703-704), with no claim call. **2. Before the claim, `rejected`:** validation fails, `replies` is `null` (`containment_unavailable`), or 2 children are live (`runtime_busy`). **3. The claim:** `conversationClaim({attemptId, commandId, authorityEpoch, leaseId: instanceId})`, resent until answered within a bound. Only `first` goes on. `refused` (any code), or no answer, is answered **`outcome_unknown`** and spawns nothing. **4. Spawn** (§3), and the `start` line written. **5. The run gate,** on `ready`: `conversationGo({attemptId, commandId, authorityEpoch, leaseId})`, resent with the same body until answered within `goWaitMs`. **`go`:** write the one `go` line, queue the `delivered` receipt, and resolve; the command, and with it the prompt, is released. **`refused`** (`not_pending`, `stale_epoch`, `lease_mismatch`), **or no answer:** no `go` is written. The child's stop sequence is started (the `stop` line, then `ReplyChild` runs it on §6's one clock), and the create is answered `rejected` at once, with that code or `go_unconfirmed`. **Cleanup is decoupled from the create handler (revision 5):** a later `stop` or `retire` joins the same sequence and its clock, and never restarts it |
  | `stop` | `stopReply` | **Fence the relay,** then the `stop` line at `t0`; or join a sequence already started, keeping its `t0`. A `TERM` line at `t0 + graceMs`, a `KILL` line at `t0 + killMs`. Then wait for the launcher's exit until `t0 + killMs + exitWaitMs`, and for every settle the child sent, answered or out at the one shared settle deadline. **The answer follows the proof classifier (§5; scoped in revision 7):** `checked` needs one of two proofs. (1) **Scoped live proof** (§5): this bridge saw the settled exit of the launcher it spawned for the attempt, and the home carries that spawn's nonce. (2) **A fresh, bounded `check`** of the attempt's home across every root, which exits 0. Its time budget is per evaluation, also when the original deadline has long passed. Its `absent`, and an `empty` in the current root, count only under the **spawn fence:** this bridge holds no unreaped launcher for the attempt, and its claim allows only one spawn (revision 8). While its one launcher is unreaped, even one held before its shared lock or its `mkdir`, the answer stays `outcome_unknown`. The bridge runs that `check` for **any attempt without scoped live proof**, whether or not it still holds a `ReplyChild`. That covers an attempt it never ran, and one whose launcher exited unsettled (74, a signal), exited 71, or didn't exit by the bound. Without either proof the answer is `outcome_unknown`, and the home goes to verification (§7). **Every `stop` is evaluated, never answered from memory (revisions 6 and 7):** a replayed `stop` runs the classifier again, with a fresh `check` wherever scoped live proof is lacking. It joins the sequence's original `t0` and deadline without resetting them, signals nothing, and changes no allowance. What each answer writes is §8.2.1:272-273's, unchanged. `checked` writes `retire`, and the binding becomes `settled`. `outcome_unknown` leaves the binding `stopping`, the request `cancelled`, its purge pending and any open reservation `uncertain`, and the same `stop` is replayed at the next hello (the table below). **No signal is sent by the bridge** |
  | `retire` | `retireReply` | §7's order; `checked`, or `failed` with a fixed code |
  | `inspect` | `inspectReply` | A content-free state: the gate, the child, the relay, counts and bytes, the ordinals and their settle state |
  | `resume`, `input`, `steer`, `hold` | — | `rejected`: a reply takes only these four |

- **The run gate (CX-0142 P1-B).**
  - **No reserve before `go`, three times over:**
    - the child's `llm/stream` hook refuses any call before `go`, and the child submits the prompt only on `go`;
    - the parent refuses a `reserve` that comes before it wrote `go` (§4);
    - S2's `conversation_reserve` refuses a request that isn't `running` (S2:311).
  - **The bounds, phase by phase (revision 5).**
    - **The create handler** resolves at `go`, at the gate's refusal, or at a timeout, never at the reply's end. Because its cleanup is decoupled (above), it resolves within `claimWaitMs + readyWaitMs + goWaitMs`.
    - **A `stop` command** waits behind it in the attempt's queue (bridge:668-671), so it starts at most that late. It then joins, or starts, the one stop sequence. Its process settlement ends by `t0 + killMs + exitWaitMs`. All its settles together end by the one shared settle deadline, at most `settleWaitMs` after that (revision 6), whether one ordinal is pending or two. Its receipt follows the classifier.
  - **When a bound runs out:**
    - no `ready` within `readyWaitMs`: the stop sequence starts, and the create is answered `rejected` (`timeout`), since no `go` means no call;
    - no scoped live proof by `t0 + killMs + exitWaitMs`: a fresh `check` decides, and without its proof the `stop` is answered `outcome_unknown`, and the home waits for verification (§7). No false `checked`.
  - **These are engineering bounds for the runtime, not a promise to a person** about how quickly a withdrawal shows. That stays as §8.5 and the Studio say.
  - **Withdrawal before `go`.** `conversation_cancel` moves a `pending` request to `cancelled` and raises the epoch, so the go call answers `not_pending` or `stale_epoch`: the child is stopped with no step taken.
  - **Withdrawal after `go`** is the ordinary `stop` (§7).
  - **A lost `go` answer.** The same body is resent. The API answers `go` again for the same claim lease and command (below), and the bridge writes `go` to the child once (a flag in `ReplyChild`).
  - **No answer at all:** the child never got `go`, so no call left. The create is answered `rejected` (`go_unconfirmed`), and whichever state the request reached, pending or running, ends `failed`/`runtime_rejected` (§8.2.1).
- **The receipt stages for a reply `create`,** matching §8.2.1's table:
  - **`rejected`** only where no model call can have left:
    - before the claim (step 2);
    - after `first`, for a launcher that ended before the runtime started: exit 64, 69, 70, 72, 73, 74, 77 or 119, or a signal (`setup_timeout`). **`rejected` is about calls, not cleanup:** an unsettled exit (74, or a signal) still leaves its home to be verified (§7);
    - at the gate's refusal, or `go_unconfirmed`;
    - for a child that ended before `go`.
  - **`outcome_unknown`** for any claim refusal or lost claim answer, and for `home_exists`. These never release anything (§7). **The home behind `home_exists` is never settled by that exit** (revision 7): `check` decides it.
  - **`failed` after `delivered`,** with a fixed reason: `timeout`, `relay_invalid`, or `child_exited` (an end-of-file without a completed `turn/end`). A completed turn ends through capture, not through a receipt.
- **Settles before terminal receipts (CX-0142 P1-C, the live path).** Any terminal receipt for a reply waits until every `settle` the child sent has been answered, or the reply's one shared settle deadline has passed (revision 6). That covers `create` `failed` or `rejected` after `start`, and `stop` `checked` or `outcome_unknown`. So `conversation_mark_uncertain` (S2:377-397), which that receipt runs, never races an answered settle. **A settle still unanswered then is never sent after the receipt.** Its reservation becomes `uncertain` and follows §7's table.
- **`connect`** (bridge:319-350) hands each reply binding in the hello to `reconcileReply`, not `reconcile` (bridge:1251).
- **`start()`'s disposer** (bridge:309-316) also calls `replies.dispose()`: it fences every relay, and writes `stop` on fd 3 and `TERM` on each control pipe. Nothing is receipted from there, and nothing there is taken as proof. When the bridge's process ends, every control pipe closes, and each launcher sends `SIGKILL` through its `pidfd`. If the bridge dies abruptly, `PDEATHSIG` ends the launcher and then its child; the next hello does the rest.

**`reply-child.ts`** (new):
- **`ReplyChildren`:** a map by `attemptId`, the cap, `execute`, `reconcileReply`, `dispose`.
- **`ReplyChild`:**
  - the nonce it generated for this one spawn, the key to scoped live proof (§5, revision 7);
  - the launcher's `ChildProcess`, kept only for its control pipe and its exit. It observes `'exit'`, never `'close'`: fd 3 may still be held by a child that outlives its launcher (§5). **No `.kill(` is ever called on it; a test fails if one is**;
  - the gate's state (`starting` → `ready` → `go` | `refused`);
  - the deadline timer, from the spawn;
  - the ordinals reserved and settled;
  - the pending settle bodies (content-free);
  - the exit.
- **`ReplyRelay`:**
  - **reading fd 3:** the incremental 1 MiB line bound, the reply schema, admission at 64 items and 4 MiB, one held item, and `pause()`/`resume()`;
  - **its states:** `live` → `draining` | `fenced` → `closed`;
  - **delivery:** `transport.observations(batch, signal)` with a per-request timeout;
  - **the answers:** writing them to the child.

  Each is exactly §8.5's "The parent's relay".
- **`ReplyRelay.fromJournal`:** the recovery relay. It is `fenced` from the start and fed from the home's journal instead of fd 3 (§7).

**The child** (new `packages/dsh-bundle/src/reply-plugin.ts`; row `sophia-reply-child` in the reply template; the same bundle, so its archive and digest change, Q8):
1. Open fd 3 and wait for `start`. Check that its `attemptId` and `nonce` match `SOPHIA_REPLY_NONCE`.
2. Journal the command (contained). Create the one agent `sophia-<attemptId>` with no tools, on the route `start` names, which must be the template's single allowed route. Write `ready`, then wait for `go`. Before `go`, a `stop` or end-of-file ends it with no step taken.
3. **On `go`, submit the prompt.**
4. **An `llm/stream` hook** (global, prepended, as bridge:295-306):
   - it refuses any call before `go`, and any call not made for the reply's own agent session;
   - otherwise it sends `reserve` and awaits the answer, refusing the call on `refused` or when no answer comes before the deadline;
   - it sends `settle` in a `finally`.

   Each reserve answer and settle body is journaled before the line is written. The ordinal of the call in flight is kept for step 5.
5. **A `session/event` observer** projects each event (§8.5's five types, with `ordinal` on the usage-bearing two) and journals it: the file fsynced, and the directory fsynced at creation. It then writes the `obs` line, awaiting `drain` before the next.
6. **Exit:**
   - **After a `turn/end`,** once its last line is written, it exits 0.
   - **On `stop` or end-of-file,** it cancels the agent and exits.
   - dsh's own `SIGTERM` path also exits 0 (`interrupt(0)`, dsh `lib/profile-boot-BZ2ZjNWi.js:249-250`). CX-0140 saw status 0 after its bounded stop, on Darwin. That is why `draining` requires the completed `turn/end` read, not exit 0 alone (§8.5).

**Transport** (`transport.ts`, and their routes, held):
- **`conversationClaim(body, signal)`:** `POST /v1/runtime/conversation/claim`. It answers `{result: 'first'}` or `{result: 'refused', code: 'already_claimed' | 'not_pending' | 'stale_epoch'}`.
- **`conversationGo(body, signal)`:** `POST /v1/runtime/conversation/go`. It answers `{result: 'go'}` or `{result: 'refused', code: 'not_pending' | 'stale_epoch' | 'lease_mismatch'}`.
- **`conversationReserve(body, signal)`** and **`conversationSettle(body, signal)`:** `/reserve` and `/settle`, S2's `conversation_reserve` and `conversation_settle` (S2:275, :349).
- **`conversationAcknowledged(body, signal)`:** `/acknowledged`. It takes keys and states only. It answers §7's eight named predicates, which cover §8.5's seven API conditions (§8.5's "terminal receipt" is split into `terminalWriter` and `createAnswered`), with each ordinal's ledger state. The relay's `closed`, §8.5's eighth condition, is the bridge's own and is never asked of the API.
- **`observations(batch, signal?)`:** the signal is new and optional. The goal path passes none, so it is unchanged.

**The API and 0049** (held; the core and ledger owners' part):
- **The claim's `lease_id` is the bridge's `instanceId`,** the same string `runtime_hello` stores as the instance's `bridge_instance_id` (0012:412; 0028:91).
- **Every new runtime route goes through `runtime_lease`,** exactly as receipts and observations already do: claim, go, reserve, settle and acknowledged. A bridge superseded by a newer hello is therefore refused (`40001`), with the same lock order: the project, then the instance, then the request's row. A bridge that receives `40001` stops its reply children through their control channels and stops polling. That case arises when an older bridge outlives its replacement. CX-0145 reproduced it locally with the unchanged supervisor and owned stand-ins: the supervisor's lease names its own pid (supervisor:101-120), so an orphaned dsh survives the supervisor's death. These database fences stop its later calls. The generation seal (§5) stops its later by-name home writes, and the drain and the life lock account for any write already in flight.
- **`conversation_execution_go(attempt, command, lease, epoch)`, new** (behind `/go`). Under the request's row lock, for the claim's own command and lease, at the current epoch, with the request `pending`, it does exactly the transitions §8.2.1 assigns to `create` `delivered`: the binding and the attempt to `running`, and the request `pending` → `running`. It records the claim's outcome as `running` and answers `go`.
  - For the same lease and command, already `running`, it answers `go` again, without a second transition (the replay of a lost answer).
  - Anything else is refused.
  - The later `delivered` receipt is recorded and applies nothing twice. This replaces "only the committed delivered receipt moves pending→running" with one atomic transition that the receipt then records.
- **`runtime_hello`'s reply branch (CX-0144 P1-E): one atomic table.**
  - **Where it runs:** in the hello's own transaction, after its project lock and instance update (0028:90-94), so after `runtime_lease`'s order.
  - **How:** for each reply request of this runtime unit that is not yet retired, its row is locked `FOR UPDATE`, in attempt-id order, and the request, its claim, and the claim's lease against this hello's `bridgeInstanceId` decide the row. The table is written as 0049's reply branch, the core owner's.
  - **What the table does not assume (revision 5; CX-0145).** It doesn't take a new instance id as proof that the old bridge, its launchers or its children are dead. An older bridge can outlive its replacement.
    - **The table only settles database state.** The old bridge's later calls are refused (`runtime_lease`). Its later by-name home writes are fenced by the generation seal, and writes already in flight are accounted for by the drain and the life lock (§5).
    - **No-writer proof comes from the drain, the life lock and the lease checks** (§5, §7), never from the hello.

  | Request | Claim | Claim's lease | Transition (once, under the lock) | Hello lists | `retire` |
  |---|---|---|---|---|---|
  | `pending` | none | — | **none: unclaimed pending is untouched.** If its `create` command exists, the cursor replays it (`runtime_cursor`, 0012:398-401), and it may still claim `first`. That is its first execution, since no claim means no spawn. If no command exists, §2.4's reconcile path applies | `active` | — |
  | `pending` | `claimed` | this instance (a reconnect) | none | `active` | — |
  | `pending` | `claimed` | another instance | **lease lost before `go`:** the request goes to `outcome_unknown` (terminal, `settled_at` set), the attempt to `outcome_unknown`, the binding to `lost`, and the claim's outcome to `lost`. `conversation_mark_uncertain` runs and moves 0, since no reservation can exist before `running` (S2:311). The `create` payload is scrubbed in `runtime_commands.body` | `stopped` | written |
  | `running` | `running` | this instance | none | `active` | — |
  | `running` | `running` | another instance | **lease lost after `go`:** as the row above, and every open reservation becomes `uncertain` | `stopped` | written |
  | `cancelled` (withdrawn) | `claimed` or `running` | another instance | the request stays `cancelled`; the claim's outcome becomes `lost`. Its `stop` is replayed to the new bridge, which answers it by the classifier (revision 6) | `stopped` | written **only** by a `checked` answer to that `stop` (§8.2.1:272). An `outcome_unknown` answer leaves the binding `stopping`: the next row |
  | any; **the binding `stopping`** (its `stop` was answered `rejected`, `failed` or `outcome_unknown`) | any | any | none to the request, which stays where it ended. **The same `stop` command is replayed** to the bridge that says hello, a reconnect of the same instance included. It is evaluated again, with a fresh `check` wherever scoped live proof is lacking, its retained `ReplyChild` notwithstanding (revisions 6 and 7) | `stopped` | only after a later `checked` answer |
  | any other terminal state, the binding not `stopping` | any | any | none | `stopped` until retired | already written |

  - **The `stopping` row is required whatever the owners decide about the lease-loss rows (revision 6).**
    - **It is §8.2.1:273's existing "retried at the next hello", with its writer named.** At each hello, the cursor's starting point (`runtime_cursor`, 0012:398-401) counts a `stop` with no recorded `checked` answer as unanswered. So it is replayed once per hello, never in a loop within one connection, until a `checked` answer is recorded.
      - §8.2.1's hello note already asks the same of `retire` ("The `retire` command stays queued until answered `checked`").
      - The core owner binds both in 0049's cursor rule. No applied migration is edited.
    - **It creates nothing.** No new command, request, reservation or call. Each answer is recorded once per stage (`(project, command, stage)`, 0012:93).
    - **A later `checked` moves the binding** from `stopping` to `settled` and writes `retire` once.

  - **Why a table at all, now that the replay is known to reach a writer (CX-0144).** Without it, a claim lost before `go` still ends: the replayed `create`'s claim is refused, and the `outcome_unknown` receipt ends the request. The table is therefore **an engineering choice for the core and ledger owners to accept or drop, not a missing writer.** Its reasons:
    - **It ends the request at the hello,** not whenever the replay is processed.
    - **It makes the outcome independent of how the new bridge answers the replay.** A bridge whose replies are off, or that is busy, answers `rejected` before any claim. For a request still `running`, §8.2.1's `rejected` row would release a reservation the old execution may have used. The `running` row prevents that; the `pending` row is its consistent counterpart.
    - **If the owners drop the table,** the bridge must ask the claim before ever answering a replayed `create` `rejected`.
  - **The hello writes no runtime receipt.** Its transition is the terminal writer. The `create` command stays unanswered, so the cursor replays it to the new bridge, whose claim answers `not_pending`. That bridge answers it `outcome_unknown` (`claim_refused:not_pending`), a true answer that is recorded and moves nothing (§8.2.1, "No receipt revives a reply"). The command is then answered, the cursor moves past it, and its outbox row maps to `outcome_unknown`, which Q12's correction keeps out of the reconcile window.
  - **Whatever the new bridge answers a replayed `create` with** (`outcome_unknown` after the claim's refusal, or `rejected` before any claim, when its replies are off or it is busy), a receipt after a terminal state moves nothing (§8.2.1). The `rejected` row releases only a reservation still `reserved`, and the hello left none: it moved them to `uncertain`, or there were none.
  - **No new logical request, model call or allowance reset.** No row creates an Ask, a `create` command or execution, an attempt, a reservation, or a provider or model call, and only `uncertain` changes any count.
  - **The one exception: the cleanup `retire` (revisions 7 and 8).** It is what the lease-loss rows require:
    - exactly one per attempt, idempotent, keyed to the same attempt and reply. A repeated hello or a replayed receipt writes none;
    - with the delivery rows the existing schema needs for any runtime command: its `commands` row, its own `outbox` row and its `runtime_commands` row. `outbox_id` is non-null, unique per project and a foreign key to `outbox`, and `command_id` is a foreign key to `commands` (0012:74, 77-79). The `create`'s outbox row is already taken;
    - those rows dispatch cleanup only, never an execution;
    - **the `stopping` row** writes no command and no delivery row: it replays the existing `stop`.

    Revision 7's "no outbox row", and CX-0151's wording behind it, were too broad and are withdrawn.
  - **Owned by the core owner.** The writer and its idempotency key go in 0049, through the reviewed change that adds `retire` to `runtime_commands.kind` and the wire. BINDING_MAP §8.2.1's test bullets (:297, :299) say "no second … outbox row or runtime command" beside "one `retire`". They are aligned in the same accepted shared window. That held binding isn't edited here, and no new queue is invented.
  - **Races, all serialized by the project lock and then the request's row:**
    - a claim or go from the old bridge either committed before the hello (and the table sees it) or is refused afterwards (`40001`, or `not_pending`);
    - a `conversation_cancel` either committed first (the `cancelled` row) or follows, and finds the request terminal.
- **`conversation_reconcile`'s proof source** (S2:407-411, a `no_proof_source` stub today): the attempt's recorded `usage_records`, matched to the reservation by the item's `ordinal` (§7). It is wired by the ledger owner and run only by an operator, separately authorized. Q7 adds no automatic path to it.

## 7. Correlation, the uncertain dispatch, recovery, and settlement before cleanup

**The durable chain, one key per hop.** Nothing in it is content except the prompt, and that only in `runtime_commands.body` until it is scrubbed.

| Hop | Durable record | Key |
|---|---|---|
| Request | `conversation_requests` | `requestId` |
| Native attempt (option C) | `work_attempts`, `conversation_reply_id` = request, `goal_id` NULL | `attemptId` |
| Outbox | one row per request | `outbox.id` |
| Runtime command | `UNIQUE(project, outbox_id)`, 0012:77 | `commandId`, `authorityEpoch` |
| **The claim** | `conversation_executions(attempt_id PK, command_id, lease_id, claimed_at, outcome)` | `attemptId`; lease = `bridgeInstanceId`; outcome `claimed` → `running` at `go` |
| Spawn | `<projectRoot>/replies/gen-<generation>/<attemptId>/` (`sealed-<generation>` after a seal) and its lease. `check` locates it across every root. A home is identified by its root and `attemptId` together, and verified through its lease, never by its basename alone (revision 6) | `attemptId`, `nonce` |
| Session | the child's agent | `sophia-<attemptId>`, as bridge:829-833 |
| Observation | `UNIQUE(project, binding, upstream_key)`, 0001:125 | `unit:sophia-<attemptId>:seq` (0023:33) |
| Usage | `UNIQUE(project, attempt, provider_call_id)`, 0012:19-20 | `sophia-<attemptId>#seq` (0023:42), with the item's `ordinal` |
| Reservation | `conversation_reservations` | `(reply, ordinal 1–2)` |
| Receipt | `(project, command, stage)`, 0012:93 | `commandId`, `stage` |

**The uncertain dispatch** (the plan's §2.4, unchanged by Q7):
- **Only an outbox row with no runtime command is re-dispatched** (`reconcile_runtime_outbox`, 0012:782-797, with Q12's owner correction: Phase A, #256, not merged). Its `create` is the first to reach the claim.
- **A row with a command is never re-dispatched.**
- **A `create` that may have run** (any claim refusal, a lost claim answer, `home_exists`, or a restart) is `outcome_unknown`: nothing is spawned, and an open reservation becomes `uncertain`, still counted.
- **Why claim refusals are never `rejected`:** `rejected` would release a reservation an earlier, claimed execution might have used (§8.2.1).
- **No request is ever run twice, and asking again is a new request.** The cumulative allowance is the request's own, through `(reply, ordinal)`.

**Each ledger state, live and after a restart** (CX-0142 P1-C). S2's transitions are fixed:
- `reserved` → `settled` by `conversation_settle` (S2:349-375; an identical settle replays, any other is refused);
- `reserved` → `uncertain` by `conversation_mark_uncertain` (S2:379-397);
- `uncertain` changes only through the operator's `conversation_reconcile` (S2:407-411, a stub today).

Q7 never calls anything else.

| State of `(reply, ordinal)` | The journal holds | Live (same bridge) | After a restart (`reconcileReply`) |
|---|---|---|---|
| no row | a `reserve` with no answer journaled | nothing: no call left, because the hook waits for `reserved` | nothing |
| `reserved` | the settle body | the same settle resent until answered, **before any terminal receipt** (§6) | **only if the request isn't `running` at the hello** (it ended through capture, so no terminal receipt moved it): the same settle resent; S2 accepts it while `reserved`. A `running` request's reservation was moved to `uncertain` by the hello, so see that row |
| `reserved` | no settle body (the call was cut off) | the child is still running the call, or the stop path waits for it | hello's lease rule moves it to `uncertain` |
| `settled` | an identical settle body | nothing (a replay would just return the same receipt) | skipped |
| `settled` | a different body | impossible: the journal holds exactly what was sent. If seen: `barrier:settle_conflict`, and the home stays unresolved | the same |
| `uncertain` | a settle body, or none | **never settle, release, retry or reset.** Its usage is persisted through its items (below) | the same: the journal's items are sent reduced, with their usage and `ordinal` |
| `released` | — | can't follow a call that left: a release needs proof that the call never left (S2:399-401) | — |

**Late usage, persisted with authority:**
- **Every metered call yields a usage-bearing item** (`assistant/message`, or `compaction/summary`) carrying its `ordinal`. It is journaled before it is emitted, and delivered live, or recovered from the journal, scrubbed with its usage kept.
- **`usage_records` rows are keyed `sophia-<attemptId>#seq`, once,** so a replay records nothing twice.
- **The proof outlives the home.** One barrier condition is "the usage of every provider call the journal names is recorded", and cleanup waits for it.
- **The hook refuses any call that isn't the reply agent's own,** so no metered call goes without an item. A call cut off before dsh wrote its `assistant/message` leaves its reservation `uncertain` with no recorded usage. It stays counted until the operator reconciles it from outside evidence. P7 records what dsh emits for an interrupted call.
- **Reconciling an `uncertain` reservation stays the operator's,** separately authorized, through 0049's proof source (§6). Nothing in Q7 releases a reservation, retries a call, or resets the allowance.

**Settled before cleanup, in this order:**
1. **The reply ends:** a completed `turn/end`; `stop`; the deadline; a refused or unconfirmed `go`; or the child's exit or death.
2. **Stop and reap.** A `stop` line, then `TERM` and `KILL` lines, all through the launcher's `pidfd` (or the child's own exit). The launcher reaps, then exits; the bridge observes that exit. The relay reads fd 3 to end-of-file, under its bound, schema, admission and backpressure. Nothing is cleaned while the child lives. That includes a child the lease never recorded: only the life lock (§5) proves its exit, and nothing short of that cleans its home.
3. **Settles, then the terminal receipt.** Every settle the child sent is answered, or the reply's one shared settle deadline has passed (revision 6). Then the terminal receipt goes (§6).
4. **Delivery.** A `draining` relay sends its items with their text. A `fenced` one sends them reduced. Every item is acknowledged.
   - **The relay is `closed`** at end-of-file, with no item held, every item acknowledged, and fd 3's parent end destroyed.
5. **`retireReply`, in this order:**
   1. proof that no reply process remains, for this exact home: scoped live proof (§5), or a fresh `check` exiting 0 for it. Its `absent`, and an `empty` in the current root, count only under the spawn fence (§6, revision 8; the table below);
   2. the relay is `closed`;
   3. the journal's keys and ordinals are read from the home, under the same bound and schema;
   4. `conversationAcknowledged` confirms all eight named predicates (below), and every ordinal is `settled`, `released`, or `uncertain` with its usage recorded;
   5. the home's path is not a link, and neither is its root. That path is `<projectRoot>/replies/<gen-or-sealed>-<generation>/<attemptId>` as `check` located it, or under this generation's own root for a home this bridge ran;
   6. delete it without following links, and verify it is gone (`lstat` `ENOENT`);
   7. drop the `ReplyChildren` entry;
   8. answer `checked`.

   Anything missing is `failed` with a fixed code (`child_live`, `unsettled`, `admission_open`, `unsealed`, `unresolved`, `relay_open`, `barrier:<condition>`, `lease_mismatch`, `delete_failed`). The home stays, said pending, and is retried at the next hello (§8.5, step 5).

   **Before step 4,** `retireReply` waits, within a bound, until every receipt this bridge itself queued for the attempt has been acknowledged. So the barrier never runs ahead of the bridge's own receipts.

**`retire` by the state of the home, and by what is proven (revisions 5 and 6),** including a new bridge with no `ReplyChild` for the attempt.
- **`retire` needs two things before `checked`:**
  - **no live writer:** every process that could write the home has exited, and that is proven;
  - **no future writer:** nothing can create or add to the home later.

  Neither comes from a hello, a sweep, a rename, an absent file or `PDEATHSIG` alone.
- **What is proof:**
  - **Scoped live proof (§5, revision 7).** The live bridge saw the settled exit of the launcher it spawned, and the home is the one that launcher created: its lease carries that spawn's nonce.
    - The launcher reaped its child, and the bridge reaped the launcher, so neither has an operation in flight.
    - Any other launcher for the path stopped at `EEXIST`.
    - **It never covers a home the launcher didn't create.** Exit 71 proves only that the new launcher forked nothing.
  - **For a home with a whole lease: the life lock is free, and each valid entry is verified `gone` through a `pidfd`** (`check`). The lock covers the launcher and a child that never executed. The `pidfd` covers a child that did.
  - **The drain (§5), for these:**
    - an empty home in a renamed root;
    - an absence from a renamed root.

    In a renamed root it proves that no admission is in flight and that none can start. In the current root it never settles anything alone (revision 8). It doesn't prove any process is dead, and it is never used for a home with a lease.
  - **An absence from the current root, and an empty home there, also need the bridge's own knowledge: the spawn fence.**
    - The fence holds when the bridge never spawned a launcher for the attempt, or reaped the one it spawned, and its claim refuses any other.
    - While its one launcher is unreaped, neither counts, even if that launcher is held before its shared lock or its `mkdir` (revision 8).
    - Separately, the relay's `closed` barrier (step 5.2) blocks any deletion while that launcher still holds fd 3. The fence makes `stop`'s answer honest too.

  These are not proof of settlement:
  - an unsettled exit (74, or a signal such as `SIGALRM`);
  - exit 71, for the home that already exists (revision 7);
  - a fork intent with no child entry;
  - a closed gate.

  **Revision 5's `child_unrecorded` is withdrawn (CX-0148).** Such a home is settled by the life lock, or stays pending.
- **`checked` says only what is true, and never comes before the barrier.** Its reason distinguishes `home_absent`, `home_empty` and `home_deleted`. It never claims a deletion that didn't happen, or a process gone without proof.

| The home | What is proven | `retire` |
|---|---|---|
| the home this bridge's own launcher created (its lease carries that spawn's nonce), and that launcher's settled exit observed: scoped live proof (revision 7) | that launcher and its one possible child have exited, and any other launcher for the path stopped at `EEXIST` | the journal read under its bound and schema; the barrier; delete, verify; `checked`, `home_deleted` |
| a home this bridge's launcher didn't create: its launcher exited 71 (`home_exists`), or the lease carries another nonce (revision 7) | nothing from that exit: the new launcher forked nothing, and never opened or locked this lease | `check` decides, by the rows below. Until the original home is verified on its own terms, `failed` (`unsettled`, `unresolved` or `lease_mismatch`), and the home is kept |
| absent from every root; each older root renamed and drained | no older launcher can create it (the drain), and this generation can't: this bridge never spawned a launcher for it, or reaped the one it spawned (its claim refuses any other) | the barrier, then `checked`, `home_absent`. It claims no process verified |
| absent, but an older root not renamed, or renamed and not drained | nothing: an older launcher could still create it | `failed`, `unsealed` or `admission_open`; said pending |
| no lease, nothing else, in a renamed root whose drain succeeds | there was never a child. Its creator has exited without a lease, and nothing can add to it by name | delete, verify, `checked`, `home_empty`. It claims no process verified |
| no lease, nothing else, in the current root: the drain succeeds **and** the spawn fence holds (revision 8) | there was never a child. Its creator has exited without a lease, and this generation spawns no other launcher for the attempt | delete, verify, `checked`, `home_empty`. It claims no process verified |
| the same in the current root, while this bridge's one launcher for the attempt is unreaped (revision 8) | nothing. The drain doesn't cover a launcher that isn't admitted yet | `failed`, `unsettled`; said pending. `stop` answers `outcome_unknown` |
| a lease of zero bytes, or a torn launcher record | nothing: no whole record binds it to any launcher (fail-closed, on every path; revision 7) | `failed`, `unresolved`; said pending |
| a whole lease, the life lock free, no child entry or a torn one, the launcher's entry verified gone | the launcher exited. Any forked child exited without executing (it held the lock until its exit), with every descriptor it inherited closed | the barrier; delete, verify; `checked`, `home_deleted` |
| a whole lease, the life lock free, both entries verified gone, no journal or a journal with no observation | the run ended before `go`: the journal holds at most its command record | the journal read under its bound and schema; the barrier; delete, verify; `checked`, `home_deleted` |
| the same, with a journal holding observations | the run passed `go` | the recovery relay first (`fromJournal`, below), then as above |
| the life lock held, or a recorded entry not yet proven gone (after an unsettled exit, or on a host without `pidfd` or `flock`) | nothing | `failed`, `unsettled`. The home stays, said pending, and `check` is retried at the next hello |
| no lease, but other files in it | the order makes this impossible | `failed`, `unresolved` |
| a journal torn or unreadable beyond its last whole entry | — | `failed`, `barrier:journal`; the home stays, said pending |
| a lease entry live and matching | can happen only before the next sweep | `failed`, `child_live`; the next sweep stops it through its `pidfd` |
| a lease entry live, not matching | — | `failed`, `lease_mismatch`; the home is unresolved |

**The acknowledgement, as named predicates (revision 5, for the core and ledger owners to bind).** §8.5's seven API conditions stay. None is skipped, and none is ever answered by asserting a record that doesn't exist.
- **Eight predicates.** `/v1/runtime/conversation/acknowledged` answers the seven as **eight** named predicates, each with its key, because §8.5's "the terminal receipt is recorded" is split in two: `terminalWriter` and `createAnswered`.
- **What `retireReply` requires:** all eight, **and, separately,** the relay's `closed`. That is §8.5's eighth condition, the parent's own, and it is never asked of the API (revision 6 makes the count consistent):

| Predicate | True when | Key |
|---|---|---|
| `observations` | every journal key is recorded | each `upstream_key` |
| `usage` | every provider call the journal names has its usage recorded | each `provider_call_id`, with its `ordinal` |
| `reservations` | each ordinal is `settled`, `released`, or `uncertain` with its usage recorded | each `(reply, ordinal)` |
| `terminalState` | the request is in a terminal state, with `settled_at` set | the request |
| `terminalWriter` | names the one record that made it terminal: a receipt (its `(command, stage)`), capture (its answer or refusal), or the hello's lease-loss transition (its hello and lease) | that record |
| `createAnswered` | the `create` command has a recorded answer: its own receipt, or, after a lease loss, the replay's `outcome_unknown` (§6). Required either way, since `retire` waits for it (step 5) | `(command, stage)` |
| `capture` | `published` or `refused` for a run with a `turn/end`; for a run without one, `none`, which holds only when **no** `turn/end` observation is recorded for the attempt **and** the journal holds none | the answer or refusal, or the absence on both sides |
| `payloadScrubbed` | the `create` payload is scrubbed in `runtime_commands.body` | the command |

**Database state never substitutes for the no-live-writer and no-future-writer proof above.** Both are required.
- **Nor does the recovery relay's `closed`.** It says the new bridge has read the journal to its end. It doesn't say the old child's descriptors are closed.
- **Those are settled by the process proof:** the life lock and the entries (revision 6).

**After a restart** (`reconcileReply`):
- **What the supervisor established before this dsh started:** it renamed every older generation's root and swept their leases. That fences new admissions by name. `check`'s drain proves none is in flight, and the life lock and the `pidfd`s settle each lease. None of it proves the old bridge is dead.
- **What hello lists, by §6's table:**
  - each lease-lost or terminal binding, `stopped`; a `stopping` one too, with its `stop` replayed (§6's table);
  - an unclaimed `pending` one, `active`: its replayed `create` may still claim `first`;
  - this instance's own, unchanged.
- For a home that exists, `ReplyRelay.fromJournal`:
  - asks `/acknowledged` which keys are recorded, and each ordinal's ledger state;
  - sends the missing items reduced, with their usage and `ordinal`;
  - resends a journaled settle only for an ordinal still `reserved` (the table);
  - closes.
- Nothing is re-run, and a recovered observation never publishes (§8.2.2).

**Every crash point and crossing (CX-0144, CX-0145, CX-0148).** L1 is the bridge that claimed; L2 is the next instance. The `create` replay is the cursor's (0012:398-401). "L1 dies" includes the case CX-0145 showed, where L1 is **not** dead but has outlived its supervisor: every row holds for a live L1 too, because its calls get `40001`, its root is renamed, and its home writes are accounted for by the drain and the life lock.

| Where L1 stops, or what crosses | Outcome |
|---|---|
| after its claim call, with the claim not committed | no claim. L2's hello leaves the request `pending`; the replayed `create` claims `first` under L2 and runs once |
| after the claim committed, before the spawn | the hello's "lease lost before `go`" row: `outcome_unknown`. The replayed `create` is answered `outcome_unknown` by L2. `retire`: `home_absent` once L1's root is renamed and drained. L1 spawned no launcher, so the drain succeeds at once |
| **L1 alive, paused after `first`, before spawning its launcher or with its launcher not yet admitted; L2 renames L1's root, says hello and retires; then L1 resumes** (CX-0145's crossing) | the drain succeeds: `retire` `home_absent`. L1's launcher then fails its open or its verification by name, exit 78, with no home. If L1 reaches its go call instead, that gets `40001`. **No late home and no call** |
| **The same, with L1's launcher admitted, paused before its `mkdir`** (revision 6) | the drain fails: `retire` `failed`, `admission_open`, said pending. When the launcher resumes, its `mkdir` by name fails (exit 78), or, if it was already in flight, completes into the renamed root. The next `retire` drains and finds the home absent or empty: `home_absent`, or `home_empty` (deleted) |
| **L1's launcher paused after `mkdir` and before its lease, or with its lease open, before, during or after its writes and `fsync`** (CX-0148's crossing) | while it is admitted, the drain fails: `retire` `failed`, `admission_open`, said pending, with nothing deleted. When it resumes, writes through its open lease descriptor complete into the renamed root (CX-0148's probe). Its next by-name step fails, exit 78, no fork. The next `retire` drains: an empty home is `home_empty`; a zero or torn lease `unresolved`, said pending; a whole lease with the life lock free and no child entry `home_deleted` |
| after the spawn, before the `mkdir` or during the lease (L1 dead) | the same rows. The drain succeeds once the launcher has gone, by `PDEATHSIG` or its own exit: `home_absent`, `home_empty`, or, for a zero or torn lease, `unresolved` |
| **L1's launcher dies after the fork, before the child's entry is durable, or after a partial entry** | the lease shows the fork intent with no valid child entry. The child exits 118 at the gate's end-of-file, or by `PDEATHSIG`, never having passed it, and lets go of the life lock only by exiting. `retire`: `failed`, `unsettled` while the life lock is held, including while the child is held alive. Then `home_deleted`, once the lock is free and the launcher's entry verified (revision 6) |
| after the `start` line, before `ready` or before the go call | the hello's row. The child was sent `SIGKILL` by `PDEATHSIG`, which isn't proof. `retire` deletes the pre-`go` home only once `check` finds the life lock free and verifies both lease entries `gone` through `pidfd`s. Until then it answers `failed`, `unsettled` |
| a lost claim answer, L1 alive | the resend finds `already_claimed`: `outcome_unknown`, no spawn (§6) |
| a lost claim answer, then L1 dies | the "lease lost before `go`" row |
| `go` committed, its answer lost, L1 alive | the resend is answered `go` again (same lease and command); one `go` line |
| `go` committed, L1 dies before or after writing `go` | the "lease lost after `go`" row: `outcome_unknown`, open reservations `uncertain`. Recovery follows §7's ledger table |
| L1's `delivered` receipt, or any write, sent after L2's hello | refused by `runtime_lease` (`40001`), so nothing is recorded. One that committed before the hello is the `running` row's input |
| a reconnect by the same instance | its own rows untouched. A replayed `create` is answered from memory (§6, step 1). A replayed `stop` or `retire` is evaluated again, with a fresh `check` wherever scoped live proof is lacking (revisions 6 and 7) |
| withdrawn while `pending` and unclaimed | `conversation_cancel` ends it. The replayed `create`'s claim is refused: `outcome_unknown`, which moves nothing |
| withdrawn while claimed, before `go`, L1 alive | the go call is refused, the child is stopped with no step, and the create is answered `rejected` |
| withdrawn while claimed, before `go`, L1 dead or outlived | the `cancelled` row. L2 answers the replayed `stop` by the classifier. `checked`, only if `check` exits 0, writes `retire`. Otherwise it is `outcome_unknown`: the binding becomes `stopping`, and the same `stop` is replayed at the next hello (§6, §8.2.1:272-273) |
| withdrawn after `go` | the ordinary `stop` (below), or the `cancelled` row if L1 died |
| a `stop` answered `outcome_unknown`, then proven later (the child reaped, the life lock freed) | the binding stays `stopping`. At the next hello the same `stop` is replayed and evaluated again by a fresh `check`. That holds on the same instance, whose retained `ReplyChild` and unsettled exit no longer block it (revision 7), and on a new one. Its `checked` writes `retire` once. Nothing is released, retried or reset, `t0` and the deadline are not restarted, and the reservation stays `uncertain` |
| a second launcher for the attempt exits 71 against a home already there (revision 7) | `create` is answered `outcome_unknown`. That exit settles nothing about the existing home: `stop` and `retire` take `check`'s verdict on it. An occupied home (a whole lease, a held life lock or a live recorded child), or one with a mismatched lease, stays until it is verified |
| a `stop`'s receipt lost | the command is unanswered, so the cursor replays it. It is evaluated again, never answered from memory, and its answer is recorded once per stage |

**Withdrawal:**
- **Before `go`:** the go call is refused, the child takes no step, and the create is answered `rejected` (§6).
- **After `go`:**
  1. `conversation_cancel` raises the epoch to 2 and writes `stop`.
  2. `stopReply` fences the relay first. Queued items are reduced in place, and later lines are reduced at parse.
  3. Then the `stop` line, `TERM` and `KILL` through the launcher, and the exit.
  4. Settles are answered, or the one shared settle deadline passes.
  5. **`stop` is answered by the classifier (§6; revision 6).**
     - `checked` only on proof. It writes `retire`, and the binding becomes `settled`.
     - Otherwise `outcome_unknown`. That leaves the binding `stopping` and the purge pending, and says so; the same `stop` is replayed at the next hello.
     - Either way, any reservation still open becomes `uncertain` (§8.2.1:272-273).
  6. `retire`, once written, runs behind the barrier.

A late line, live or recovered, is stored scrubbed with its usage. A later `create` for the attempt meets the claim's refusal and spawns nothing.

## 8. What is preserved

- **Option C:** one native attempt per request, and the reply binding as A04's `oneOf`, as the plan's §2.2 has it.
- **B-1's isolated home per reply:** every writable path is under the reply's own home, `<projectRoot>/replies/gen-<generation>/<attemptId>/` (under `sealed-<generation>` after a seal). Landlock enforces it, with a self-test, and it gives no right on the home's lease (revision 6). The environment is set once, at `exec`, and no process-global home changes. The parent's and the supervisor's environments never change.
- **One pinned harness:**
  - the same dsh `0.2.0-rc.2`, through the same `unit.launcherEntry`;
  - the same Node (`process.execPath`), the same bundle, and a reviewed reply template.

  The launcher is the binding's own new launcher (§8.5, "part of the shared-file request"). It isn't a runtime or a second agent loop: it holds one process identity and `exec`s dsh.
- **The cumulative allowance:** reservations are keyed by request and ordinal. The claim fences every duplicate, the run gate allows no call before `running`, and an uncertain execution stays counted until the operator reconciles it.
- **§8.5's copy table:** every row stands, with three changes:
  - the prompt crosses on fd 3 (the kernel socket buffer and Node's write buffer) rather than on a stdin pipe;
  - the child's journal also holds its content-free reserve and settle records;
  - the usage items carry `ordinal`.

## 9. Evidence, and what is not established

**L0, run in CON's owned scratch** (`…/scratchpad/q7/`, local only):
- **Versions:** Node 24.21.0, which is the pinned version; Python 3.13.16; glibc 2.39; Linux 6.18 in this session's container, not the deploy host. The scratch filesystem is ext4.
- **Limits:** no dsh, no network beyond loopback, no credential. Every process signalled was one the probe itself started; no pid reuse was attempted.
- **Static reads** of the pinned artifact and of libuv's source are cited where used (§2, §3, §5).

| File | SHA-256 (first 16) | What it shows |
|---|---|---|
| `src/libuv-process.c` (Node v24.21.0 `deps/uv/src/unix/process.c`, fetched read-only) | `e79f9bd90787011d` | `uv__wait_children` reaps all exited children, then runs callbacks (:101-176); `uv_process_kill` is a numeric `kill` (:1097-1105) |
| `l0-launcher.py` | `968015d0980f6d88` | §5's resident launcher in miniature: its `PDEATHSIG` and parent check; the fork; the child's filter (process creation, signals to itself only, `pidfd_*`; `AF_UNIX` sockets behind a probe flag); the exec gate; `pidfd_open` before the go byte; the control loop; `waitid(P_PIDFD)` |
| `l0-bridge.mjs`, `l0-child.mjs` | `8aba1349eee42beb`, `338ba566cf580667` | The bridge stand-in writes `TERM`, or closes the control pipe, and counts its own `ChildProcess.kill` calls; the child stand-in checks what the filter allows |
| `l0-run.out` | `d3d1b170430259d6` | `TERM`: the child exits 0 by its handler, the launcher exits 0, fd 3 reaches end-of-file. Control end-of-file: `SIGKILL` by `pidfd`, launcher exit 76. In the child: spawn `EPERM`, a signal to the owned decoy `EPERM`, a signal to itself delivered, a worker run and terminated. The decoy survives; the bridge stand-in made 0 `kill` calls |
| `l0-fds.py`, `l0-fds-bridge.mjs` | `a158e541874aa6a9`, `4d5c79423e677403` | A stand-in image that lists its descriptors at start |
| `l0-fds.out` | `3ce9f7646f124f0a` | Exactly fds 0–3 survive the `exec`: 0 is `/dev/null`, 3 is `AF_UNIX`/`SOCK_STREAM`; the gate and the status pipe don't. Its fd 2 is the probe's own redirect |
| `l0-unix-child.mjs`, `l0-unix-bridge.mjs` | `6798f72c43a82a69`, `c5d3fb2bdeb922ec` | The same launcher, with and without the `AF_UNIX` rule |
| `l0-unix.out` | `622407a8e92c9990` | Without the rule, an abstract listen succeeds. With it, an abstract listen and a connect by path fail `EPERM`; DNS, a loopback `fetch`, a worker, and the line on the inherited fd 3 all still work |
| `l0-launcher2.py`, `l0-cancel-bridge.mjs`, `l0-cancel-child.mjs` | `c1e4d600110c1b2b`, `ca3c09080cc95af1`, `beba341f7fd541cb` | Revision 3: §5's waits before the runtime starts. Setup polls the control channel between steps; the exec-status wait polls the status pipe, the control channel and the `pidfd`, until a deadline. The bridge stand-in cancels at each stage and never signals |
| `l0-launcher3.py`, `l0-settle-bridge.mjs`, `l0-settle-child.mjs` | `d0873372841b0832`, `5475fbe1ef528125`, `06d2dfcce432c16e` | Revision 4: the lease's launcher entry before the fork and the child's entry right after; the child's own `alarm` before its `exec`; the no-`pidfd` settlement by `waitpid(WNOHANG)` only; a child-entry failure settled through the `pidfd`. The bridge stand-in never signals, and checks `/proc` afterwards |
| `l0-settle.out` | `e3a23449182355b3` | **No `pidfd`, child at the gate:** exit 69, settled, the child already reaped. **No `pidfd`, child stalled before the gate, its `alarm` 1 s:** exit 69, settled. **No `pidfd`, its `alarm` 4 s beyond the 1 s settle bound:** exit 74, unsettled. The child was **still present** at the launcher's exit and gone 5 s later (`PDEATHSIG`), so the unsettled exit rightly claims nothing. **The child's entry failing after the fork:** exit 77, settled through the `pidfd`, the lease holding the launcher's entry alone. **A normal run:** exit 0. No cancelled case reached the runtime. Each case's elapsed time includes a fixed 5 s observation after the launcher's exit |
| `l0-launcher4.py`, `l0-seal-bridge.mjs`, `l0-seal-child.mjs` | `df916b176e870e12`, `3cdd3ab3e25afe93`, `582c95a77358b10b` | Revision 5: paths resolved by name from a generation root; the lease with the launcher's entry and a fork intent before the fork; one gate, opened only after the child's entry is durable and its `pidfd` held; the seal as a `rename` of the generation root by the stand-in. The stand-in never signals. Every directory is owned and temporary |
| `l0-seal.out` | `bea921b654dc1070` | **Old launcher paused before `mkdir`, root sealed, resumed:** exit 78, and no home anywhere. **Paused after `mkdir` and before its lease, sealed, resumed:** exit 78; the sealed home stays empty, with nothing written after the seal. (Revision 6: that pause came before the lease's open. A descriptor already open would still write after a rename, as CX-0148 showed and `l0-admit`'s A1 repeats.) **The launcher dying after the fork, before the child's entry:** a lease of `[launcher, fork]`, and the child never passed the gate (no marker). **After a partial entry:** `[launcher, fork, torn]`, the same. **No `pidfd`:** exit 69, the gate never opened. **A normal run:** passed the gate and ran |
| `l0-admit.py` | `14df746c7ee179f5` | Revision 6, on Linux. **The admission lock:** a shared `flock` on the root's `.admit`, verified by name while held. **The seal and the drain:** the seal as a `rename`; the drain as a non-blocking exclusive `flock`. **The life lock:** an exclusive `flock` on the lease, close-on-exec, inherited by the forked child. **Unused pipe ends:** the gate's and the status pipe's, closed on both sides after the fork. Each launcher stand-in is the probe's own fork, and each child stand-in is its fork. The probe is a child subreaper, so it reaps an orphaned child itself. The probe sends no signal; the only signals are the stand-ins' own `alarm`s and `PDEATHSIG`. **Its `check` is a fixture, not a production rule** (CX-0151): its `entry_gone` reads a start-time mismatch as gone, where §5 reads it as `unresolved`; its empty-root and identity cases are fixture-scoped; it records observations without assertions; and its final cleanup waits a bounded time and then removes its scratch whether or not children remain (none did) |
| `l0-admit.out` | `6785e9f643fc18a4` | **A1, the lease open (zero bytes, the life lock held), then the seal:** a fresh by-name open gets `ENOENT`, and the drain fails (`admission_open`). Resumed, the launcher's writes and `fsync` through its open descriptor land in the renamed root; its directory `fsync` by name fails, exit 78. The drain then succeeds: the lease is whole with no child entry and the life lock free, so `gone`, deleted and verified. **A2, a torn launcher record:** `admission_open`, then `unresolved` (`torn_lease`), the home kept. **A3, `.admit` open but not yet locked:** the drain succeeds at once, and the home is `absent`. Resumed, the verification by name fails, exit 78, still `absent`. **A4, started after the seal:** exit 78, `absent`. **A5, admitted, before `mkdir`:** `admission_open`; resumed, exit 78; then `absent`. **B1, the launcher crashing after the fork, before the child's entry:** the child exits 118 at the gate's end-of-file, within 5 ms of the launcher's reap. Then the life lock is free: `gone`. **B2, a torn child entry:** the same. **B4, the control:** a child that keeps its inherited gate write end sees no end-of-file, and ends only by its own `alarm` (`SIGALRM`, 1.8 s after the launcher's reap). **B1p, with `PDEATHSIG`:** `SIGKILL`, within 5 ms of the launcher's reap. **B3, the child held alive after the launcher's crash:** the life lock stays held (`unsettled`), the home is kept, and fd 3 has no end-of-file. Once the child exits, fd 3 reaches end-of-file and the home is `gone`. **B5, a normal run:** the life lock is held during the run. The executed image holds fds 0–3 (plus its listing's own descriptor) and not the lease. Exit 0, then `gone`. **B6, the image executed and its launcher crashed, without `PDEATHSIG`:** the life lock is free, but the valid child entry reads live (`child_live`) until the image exits. **B6p, with `PDEATHSIG`,** which survives `execve`: the image is killed, and reads `child_live` until it is reaped. Scratch removed; no child left |
| `l0-cancel.out` | `028d1c07a7556686` | **Setup cancelled by a `TERM` line:** exit 72 in 366 ms, with no child forked. **Child stalled before the gate, control end-of-file:** exit 72 in 357 ms, the child killed through the `pidfd` and reaped (`/proc/<pid>` gone). **Child stalled after the gate:** the exec wait timed out at 1 s, exit 73, the child reaped. **Runtime started, `TERM`:** exit 0. None of the cancelled cases reached the runtime (no fd 3 line) |
| `fd3-parent.mjs`, `fd3-child.py`, `fd3-run.out` | `cf26d1433d93cdd0`, `96be0ff2ad75be66`, `26314673f260b457` | From revision 1: Node's `'pipe'` at fd 3 is a duplex `AF_UNIX`/`SOCK_STREAM` socket |
| `fd3-node-parent.mjs`, `fd3-node-child.mjs`, `fd3-node-run.out` | `3907ed69697cf325`, `9b7281407b8c8e6c`, `80bc52444c13cd5a` | From revision 1: a Node child opens fd 3 as `net.Socket({fd: 3})` and exits on end-of-file. **Its "`kill()` after the exit returns `false`" is withdrawn as evidence of identity** (§2) |
| `noproc-exec.py`, `noproc-node.mjs`, `noproc-run.mjs`, `noproc-run.out` | `978d111723c7e06c`, `c7169f3709a5186c`, `3aad16b9b666a48c`, `397e7cf2161e820c` | From revision 1: the process-creation part of the filter alone |

**The immutable copies (CC-0174).** `l0-admit.py`, `l0-admit.out` and the void run's output are published unchanged, with a README, on `claude/con01-q7-r6-l0-evidence` at [`a5fcb20c`](https://github.com/davidelaverga/Sophia/tree/a5fcb20c4c9047ce386c0e6c0dace2c9bdb606b9/docs/coordination/CON-01/evidence/20261012-cc174-q7r6-l0). Their full SHA-256s:
- `l0-admit.py` `14df746c7ee179f544cbb3c3d785fc7b49b59c5070aab98a133e12ac0071072e`;
- `l0-admit.out` `6785e9f643fc18a4ed3616d271dc23ad558425d9093b740cdb9ca88b89a0c475`;
- the void run's output `2a829390bbcedcbded24613f825f00d2f0852776a175381149301bf9dd478dd9`.

Codex read them without re-running them. They are author evidence only, and the void run counts as nothing.

**Codex's CX-0148 probe** (`rename-descriptor-probe.mjs`, SHA-256 `fdcf5236…`; receipt `5b184121…`) is Codex's evidence, and it is not re-run here. On Darwin with Node 24.21.0, filesystem only, a descriptor opened earlier wrote and `fsync`ed into the renamed root, while a fresh by-name open got `ENOENT`. A1 reproduces that premise on Linux, with the drain added.

**Runs not kept:**
- **Revision 6's first `l0-admit` run** (`l0-admit.void.out`, `2a829390bbcedcbd`) is void, for two harness faults. It was corrected and re-run:
  - the launcher stand-in crashed before its child reached the gate, so the child exited 119 at its parent check. The fix is a test-only delay before the crash;
  - the child's descriptors for fd 1 and fd 3 collided, so the image failed. The fix raises the descriptors before the `dup2`.
- **Revision 1's void run:** the first `noproc` run had a broken worker check, a bare `postMessage`, that failed filtered and unfiltered alike. It was corrected and re-run.
- **Earlier `l0-run` and `l0-fds` runs, on the launcher before its two test-only knobs** (`PROBE_URL` passed through, and the `DENY_UNIX` flag) gave the same results. The outputs kept are the final launcher's re-runs. In the first `l0-fds` run, fd 2 was a pipe rather than the file.

**Not established.** Each is a probe on the pinned runtime with a loopback stub route, offline and labelled as such, or a probe on the host. None has run as stated here; only P1 has partial evidence, from Codex.
- **P1–P6:** the plan's §4.1.
  - **P1 now names the template recipe (§5):**
    - install the reply template once on Linux;
    - record every entry's type, every link and its target, against the link rule, and its `sophia-reply-tree-v1` digest (none of these is known for Linux today);
    - copy it into an empty home and match the digest;
    - boot the copy offline.
  - **Codex's CX-0140** ([`ebd87c1d`](https://github.com/davidelaverga/Sophia/blob/ebd87c1dd20212c5447db43eb6e32f211662a4dc/docs/coordination/CON-01/CX-0140.md), `CX-0140.md` SHA-256 `00fc4f0c385cc635`) is **the Darwin runtime-profile baseline only**:
    - **the setup:** all network denied by `sandbox-exec`, no credentials, Node 24.21.0, and the existing artifact matching `7d8f`'s recorded Darwin runtime (tree-v2 `e24cb887…`, 28,427 entries) and bundle;
    - **what it saw:** a frozen offline install in 376 ms; a copy of that pristine install, into a second empty home, with `profileDrift` `[]`; and an 8-second bounded boot that loaded the bridge, reported `not_ready` (no service binding), was never ready, printed no startup diagnostic, and ended with status 0 after the bounded stop. **That pristine profile had 0 symlinks and 0 special files** (CX-0142, CX-0143), so revision 2's "symlinks kept" is withdrawn.
    - **What it doesn't show:** it is not evidence for a Linux reply template, for this recipe or its link rule, or, in Codex's words, for "a useful reply, complete file-write/canary accounting, absence of other host copies, pidfd/namespace/Landlock, descendant settlement, crash/orphan recovery, withdrawal or durable delivery".
  - **Codex's CX-0143 profile-only copy** ([`815bccc3`](https://github.com/davidelaverga/Sophia/blob/815bccc3cd89b767a370fa96878e48511c1eea59/docs/coordination/CON-01/CX-0143.md), `profile-only.safe.json`) narrows CX-0140 from a whole-home copy to the profile alone:
    - the same Darwin setup, from source `3b1a7ea6` with helpers identical to `7d8f`;
    - only `profiles/<name>` copied into an empty home: template and copy have 86 entries each and the same digest, `sophia-tree-v2:sha256:108d23ed611cea04…`;
    - `profileDrift` `[]`;
    - an 8-second boot: bridge loaded, `not_ready`, never ready, status 0.

    It too is the Darwin baseline only. It is not P1's Linux template, P7, P8, the copy's completeness, or provider acceptance. (Comparing a template and its copy with the existing `sophia-tree-v2` worked there. The reply recipe differs in also listing directories and excluding nothing, and either must be one implementation used at both ends.)
- **P7 ring-path qualification (approved amendment):** prove EPERM for all three io_uring entrypoints and absence of inherited ring descriptors on the actual target, then qualify the pinned Node/dsh under that policy. A compatibility failure is reported with its call site; no fallback, policy relaxation or provider switch. Pure bytecode and mocked syscalls cannot close this gate.
- **P7:** dsh `0.2.0-rc.2` boots a copy of the reply template under the real launcher: Landlock, the full filter, four descriptors, and fd 3 opened by `sophia-reply-child`. It then completes one stub reply:
  - no step and no call before `go`;
  - every model call reserved over fd 3, and each `assistant/message` and `compaction/summary` carrying its `ordinal`;
  - the journal written before each emit;
  - no process created, no signal sent except to itself, no `AF_UNIX` socket opened.

  Plus `strace -f` from boot to exit for `fork`, `clone`, `execve`, `kill`, `tgkill` and `socket`. And what dsh emits for a call cut off by `stop`.
- **P8:** the deploy host's execution-host container:
  - Landlock ABI ≥ 4 and `seccomp` available to an unprivileged process there, under the container's own seccomp profile;
  - `pidfd_open`, `pidfd_send_signal` and `waitid(P_PIDFD)` work;
  - it is x86_64;
  - the image has `python3` ≥ 3.9;
  - `flock` works on the filesystem that holds `<projectRoot>/replies` (revision 6). It must be a local filesystem; else replies are `containment_unavailable`.

  The image doesn't exist yet: `imageDigest` is null (`docs/pack/ops/deployment-units.json`, unit `execution_host`).
- **Still open after the filter, named for the owner (a containment gap, not an authority):**
  - **A reply child can open outbound TCP and UDP.** That is how it reaches its provider route, so other local listeners are reachable too, unless the host's egress policy restricts execution jobs, as the deployment bindings already require ("Restrict egress for execution jobs separately").
  - **Landlock's network rights (ABI 4) could confine it to the route's port,** once D-4 names one.

## 10. Tests, by file (held, written with the code; each states its expected result first)

Every process these tests signal is one they started themselves. None attempts pid reuse or touches a hosted or unrelated process.

- **`apps/execution-host/reply/test_reply_launch.py`** (new, `unittest`, like `test_owned_exec.py`). With a stand-in for `--node`:
  - exactly fds 0–3 survive the `exec`, with the right types;
  - a wrong parent, for the launcher and for the child, gives 119;
  - a leftover home gives 71, with nothing written, and the existing home's lease, life lock and files untouched (revision 7);
  - an ABI below 4 (the reader stubbed), the self-test write succeeding, or `pidfd_open` failing (stubbed) gives 69, with the child reaped and no signal sent;
  - the stand-in can't start before the launcher holds its `pidfd`: it records its start, and the launcher records when it acquired the `pidfd`;
  - the lease's two entries match `/proc`;
  - `diag/` receives fds 1 and 2;
  - the environment has exactly §5's names;
  - **the filter:**
    - `fork`, `vfork` and `clone` without `CLONE_THREAD` get `EPERM`, `clone3` gets `ENOSYS`, and threads run;
    - a signal to an owned decoy gets `EPERM`, and one to itself is delivered;
    - `tkill` and the `pidfd_*` calls get `EPERM`;
    - an `AF_UNIX` `socket` or `socketpair` gets `EPERM`, while fd 3 still works;
  - no `core*` after an abort.

  **Bounded before the runtime starts (revision 3):**
  - a `TERM` line, and separately end-of-file, during setup (a stubbed slow copy): exit 72, no child forked, the partial home left for `retire`;
  - the child stalled before the gate, then control end-of-file: exit 72, the child killed through its `pidfd` and reaped;
  - the child stalled after the gate: exit 73 at `execWaitMs`, the child reaped;
  - a setup step that blocks (stubbed): the `alarm` ends the launcher, which is an unsettled exit, never treated as proof;
  - **revision 4's and 5's settlement:**
    - **no `pidfd`:** the gate is closed without its byte, and the child gives exit 69, settled. One not reaped within `childSettleMs` (stubbed) gives 74, unsettled, and its home is never `checked` until verified;
    - **the child's lease entry failing:** the gate is closed, and exit 77 follows with the child reaped by `waitpid`;
    - **the launcher's entry or intent failing:** exit 77, with no fork;
    - **the launcher dying after the fork, before the child's entry, and after a partial entry (revision 6):**
      - the child exits 118 at the gate's end-of-file and never passes it;
      - `check` gives `unsettled` while the life lock is held, and `gone` only once the lock is free and the launcher's entry verified gone.
    - **with the child deliberately held alive** (a hook in the stand-in): `unsettled`, fd 3 with no end-of-file at the bridge stub, and the home never deleted, until the child exits; then `gone`. A normal exit: `gone` after the reap;
    - **the unused ends (revision 6):** after the fork, `/proc/<pid>/fd` shows that the child holds neither the gate's write end nor the status pipe's read end, and the launcher neither the gate's read end nor the status pipe's write end. A control case that keeps the child's gate write end shows no end-of-file at the launcher's death;
    - **the life lock:**
      - held by the launcher for its whole life, and inherited by the child;
      - absent from the executed image's descriptors;
      - free only once the launcher has exited and the child has exited or executed;
      - with an executed child alive after its launcher's death, the lock is free but the valid entry gives `unsettled`;
    - **the admission lock and the drain (revision 6, CX-0148's crossings):**
      - **Where the launcher is held (a test hook):** before opening `.admit`; before its shared lock; after its verification and before `mkdir`; after `mkdir` and before the lease's create; after the `O_EXCL` open and before the first write; after a partial record and before `fsync`; and after the file's `fsync` and before the directory's.
      - **At each point,** the root is renamed, `check` runs, and then the launcher resumes.
      - **While the launcher is admitted:** `check` reports `admission_open`, and nothing is deleted.
      - **Afterwards:** `absent`, `empty`, `unresolved` (a zero or torn lease) or `gone` (a whole lease, the life lock free, no fork), as §5's table says. Never a late `checked`.
      - **Writes through the open lease descriptor** land in the renamed root, and the launcher's next by-name step exits 78.
      - **An in-flight `mkdir` across the rename** can't be forced by the test. The drain covers it by construction, and the test asserts the outcome table, not the race;
    - **Landlock and the lease (revision 6):** the reply's dsh stand-in can't open, rename, lock or remove `lease.json`, and can't create a file in the home's top directory or in `diag/`;
    - **a blocking copy or `fsync`** (stubbed): the cancellation is seen when the call returns, and the `alarm` covers a call that never does;
  - the gate closed without its byte: the child exits 118 with no `exec`;
  - in every case: no fd 3 line from a runtime, and an owned decoy untouched.

  **Control and signals:**
  - a `TERM` line, a `KILL` line, and control end-of-file each reach the child only through `pidfd_send_signal`. `strace -e trace=kill,tgkill,tkill,pidfd_send_signal` on the launcher shows no numeric `kill`;
  - a child exiting at the same moment as a `TERM` line: the launcher gets `ESRCH` or a discarded signal, and nothing else is signalled (an owned decoy survives);
  - the exit codes 0, 75 and 76.

  **The copy:**
  - a template with relative symlinks inside it, and absolute ones into the runtime directory, copies with links kept and the digest matched;
  - a link escaping the tree (`../..`), an absolute target outside the runtime directory, a dangling link, a FIFO, and one byte changed in the copy are each refused: 70 for a copy, invalid at record time for a template;
  - `digest` is stable across two copies.

  **`sweep` and `check`:**
  - every root searched (revision 6): a home in `gen-*`, in `sealed-*`, and in a root the seal failed to rename. A home in two roots is `unresolved`. No old root is ever recreated;
  - an unrelated owned process of the same uid, named by a rewritten lease, survives: `unresolved`;
  - a matching one is killed through its `pidfd`;
  - one that exits between the check and the signal gives `ESRCH`, and nothing else is signalled;
  - **the drain in the current root (revisions 7 and 8):** an empty home is `empty` only when the drain succeeds. With another launcher admitted it is `admission_open`. Neither an absence nor an empty home there is settled by `check` alone: the caller applies its spawn fence;
  - **verified means verified gone:** a matching live entry is `unsettled`, and a start-time mismatch `unresolved`, never `gone`;
  - neither ever deletes.
- **`tests/integration/supervisor.test.mjs`** (extended):
  - `sweepReplies` runs before each launch and after the stop;
  - **the seal (revisions 5 and 6):**
    - before each launch, every older `gen-*` root is renamed to `sealed-*`, and a fresh root is created with its `.admit`. The run after `stop()` doesn't seal;
    - the seal never waits for a drain: an admitted older launcher, held by a test hook, doesn't delay the new launch. A seal failure (a stubbed `rename` error) leaves the new generation's replies off, its older homes `unresolved`, and a goal still starting;
  - the `SOPHIA_REPLY_*` names are present, and `extraEnv` can't override them;
  - a failing probe, or a template failing its digest or link rule, leaves them out, and a goal still starts;
  - the goal path's spawn, environment and `log` are byte-identical.
- **`packages/dsh-bundle/test/reply-child.test.ts`** (new; a stub launcher and a stub child speaking §3 and §4):
  - **No signal from the bridge:** `ChildProcess.prototype.kill` and `process.kill` throw when called on any reply path, and every case passes.
  - **The run gate:**
    - the go answer delayed: no `go` line, no `reserve` accepted, and S2 and the stub provider never called;
    - the go answer lost, then resent: exactly one `go` line;
    - `not_pending` (withdrawn before go), `stale_epoch`, `lease_mismatch`, and no answer at all: the child stopped with no step, and `rejected` with that code or `go_unconfirmed`;
    - a `reserve` before `go`: `relay_invalid`;
    - the `delivered` receipt delayed or never acknowledged after `go`: the reserve still succeeds (the request is already `running`), and nothing is applied twice;
    - a `stop` arriving during the go wait runs once the create resolves.
  - **Settles before the receipt:**
    - a settle answered late: the terminal receipt waits for it;
    - a settle never answered: after the shared deadline, the receipt goes and that settle is never sent again;
    - **two ordinals (revisions 6 and 7):**
      - both settles pending, resent in parallel;
      - **one answered early and the other still pending: no terminal receipt before the shared deadline.** The receipt waits for every pending settle to be answered, or for the deadline;
      - at the deadline, the receipt goes once. The unanswered settle is no longer resent and is never sent after the receipt, and its reservation becomes `uncertain`;
      - **the control:** both answered before the deadline. The receipt goes at the second answer, without waiting for the deadline;
      - no per-ordinal deadline, and no reset;
      - a `stop` that joins after a refused go keeps its `t0` and that deadline.
  - **The relay:**
    - a 2 MiB line with no newline: the buffer never exceeds 1 MiB, nothing is parsed, `relay_invalid`;
    - a schema-invalid line;
    - admission at exactly 64 items and 4 MiB (the crossing item is held);
    - `pause`, then `resume`;
    - `draining` versus `fenced`, and a full queue at the exit (CX-0113).
  - **Stop and timing:**
    - `stop`'s timing, with fake timers: the `stop` line, then `TERM` and `KILL` written on the control pipe;
    - the deadline.
  - **Ordinals and the claim:**
    - a `reserve` held behind an observation;
    - a third ordinal refused;
    - a third `create` gives `runtime_busy` with no claim call;
    - the claim's `first`, each `refused` code, and a lost answer: spawn counts 1, 0, 0, and the stages `delivered`, `outcome_unknown`, `outcome_unknown`;
    - a redelivered `create` answered from memory, with no claim call.
  - **Crash points and crossings (revision 3, P1-E).** A stub API and a second bridge instance cover each row of §7's crossing table. Each case states its terminal state, its replayed-command receipt, and its spawn, claim and stub-provider call counts: no second claim `first`, no second spawn, no new call.
  - **Retire and recovery:**
    - **`retire` by each row of §7's home table (revision 6):**
      - absent, with every older root drained (`home_absent`), and with one launcher admitted (`admission_open`);
      - empty (`home_empty`);
      - a zero-byte lease or a torn launcher record: `unresolved`, on every path, the live one included (revision 7);
      - the home this bridge's own launcher created, with its nonce, after that launcher's settled exit (`home_deleted`);
      - an empty home in the current root, in three cases: drained with the spawn fence holding (`home_empty`); not drained (`admission_open`); drained but with this bridge's own launcher unreaped (`failed`, `unsettled`; revision 8);
      - a whole lease with the life lock free and no child entry (`home_deleted`);
      - the life lock held (`unsettled`);
      - both entries proven gone with a pre-`go` journal (`home_deleted`);
      - an entry not yet proven after an unsettled exit (`failed`, `unsettled`, and **never `checked`**);
      - other files with no lease (`unresolved`);
      - a torn journal;
      - a live matching lease (`child_live`);
      - a mismatched lease (`lease_mismatch`);
    - **a `stop` in each phase (revisions 4 and 5):** during the claim's resends, during the launcher's setup (before `ready`), during the go wait, after a refused or unconfirmed go (it joins that sequence and its `t0`), after `go`, and during the settles.
      - Each starts within `claimWaitMs + readyWaitMs + goWaitMs`.
      - `TERM` comes at `t0 + graceMs` and `KILL` at `t0 + killMs` (fake clocks).
      - Each ends by `t0 + killMs + exitWaitMs + settleWaitMs`, however many settles are pending (one shared deadline).
      - **The answer by the classifier:** `checked` for scoped live proof (a settled exit, and the home carrying that spawn's nonce). `outcome_unknown` for exit 74, a signal exit, an overrun, or exit 71 against an occupied home, until a fresh `check` proves the home. A replayed `stop` is evaluated again, never answered from memory;
    - **withdrawal by the classifier (revisions 6 and 7):** a withdrawal after `go` gives `outcome_unknown`, never `checked`, when the launcher exits 74, exits by a signal, or doesn't exit by the bound, until a fresh `check` proves the home. With scoped live proof it gives `checked`;
    - **the current-root empty guard (revision 8):**
      - **The setup:** the supported leftover fixture pre-seeds an empty home in the current root. This bridge's one claim gives `first`, and it spawns. A test hook holds its launcher in three cases:
        - before it opens `.admit`;
        - between that open and its shared lock;
        - after its shared lock and before `mkdir`, where the drain itself fails (`admission_open`);
      - **while it is held:** the create times out, with its decoupled cleanup, and `stop`'s bound passes. `check` may report `empty` as filesystem state. But `stop` answers `outcome_unknown`, and the binding stays `stopping`. `retire` stays pending: the spawn fence fails, and the relay isn't `closed` while the held launcher keeps fd 3;
      - **then the launcher is let go.** It exits on its queued cancellation, or with 71 if it reaches `mkdir` with the home there, and is reaped. The replayed `stop`'s fresh `check` gives `checked`. Then exactly one cleanup `retire`, and one deletion of that exact home behind the full barrier;
      - **the control:** the same empty home in a renamed, drained root counts at once, with no fence needed;
      - **in every case:** `t0`, the deadline and the allowance are unchanged, and nothing is signalled;
    - **same-instance reverification (revision 7):** after exit 74, a signal exit, and no exit by the bound, the bridge keeps its `ReplyChild` and answers `outcome_unknown`. The child is then let go (the stub child exits), and the same instance replays the same `stop`:
      - before the fresh `check` proves the home: `outcome_unknown`, binding `stopping`;
      - after it: `checked`, and one `retire`;
      - `t0`, the deadline, the command id and the uncertain amounts are unchanged;
      - nothing is signalled;
      - a new instance gets the same result;
    - `retire` waits for the bridge's own queued receipts for the attempt before the barrier;
    - `retire` with each of the eight predicates, and the relay's `closed`, withheld in turn;
    - `fromJournal` against each row of §7's table (`reserved` with a settle body and the request answered; `reserved` with the request `running` at the hello; `settled`, the same and different; `uncertain`). It resends a settle only for the first, and never calls settle for `uncertain`.
  - **Goals:** goal attempts' observations and receipts byte-identical.
- **`packages/dsh-bundle/test/reply-plugin.test.ts`** (new):
  - before `go`, no step, and the hook refuses any call;
  - a call not made for the reply's own session is refused;
  - the five projected types at their maxima, with `ordinal` on the two usage-bearing types;
  - 16,000 code points, with `oversize`, `invalidText` and empty;
  - journal-before-emit, with the file and directory fsynced (a spy);
  - a refused or unanswered reserve: no call;
  - exit on end-of-file and on `stop`, before and after `go`.
- **`tests/integration/reply-runtime.test.mjs`** (new, L1: the real supervisor, bridge, launcher and pinned dsh; the stub provider; real PostgreSQL). §8.5's qualification table, row by row, plus:
  - the reply's dsh is the launcher's child, and the launcher the project's dsh's;
  - the reply's dsh's `/proc/<pid>/fd` at `exec`;
  - `SIGKILL` on the project's dsh: the launcher and the reply's dsh are gone within a bound (`PDEATHSIG`), and the next hello ends the request `outcome_unknown` by the lease rule;
  - **the same `SIGKILL` at each pre-`go` point:** after the claim and before the spawn, after the spawn and before the `start` line, and after `ready` and before `go`.
    - Each ends `outcome_unknown`, by the hello's table, and **without the table** (a control) by the replay's claim refusal and its `outcome_unknown` receipt (CX-0144's chain: cursor, poll, claim refusal, receipt, `retire`). Both reach the same terminal state.
    - `retire` gives `home_absent` or `home_empty`, or `home_deleted` once `check` finds the life lock free and proves the entries gone.
    - The stub provider's call log is unchanged.
  - **a replies-off or busy new bridge** answering a replayed `create` of a `running` request with `rejected`. With the table, nothing is released. In the control without it, the release the table prevents is observed on the stub API;
  - **CX-0145's crossing, carried through Q7 (revision 5).** Supervisor A's wrapper exits without `stop`, and its dsh (L1) stays alive, as CX-0145 observed. L1 is held by a test hook after the claim's `first` and before its launcher's `mkdir`. Supervisor B starts, seals A's root, and its bridge (L2) says hello and retires the attempt `home_absent`. Then L1 resumes:
    - its launcher exits 78, and no home appears in any root;
    - its go, or any receipt, gets `40001`;
    - the stub provider's log is unchanged;
    - no process outside the test's own is touched;
    - the old dsh is then stopped through the test's own control.
  - **The same crossing with L1's launcher held (revision 6):** after its verification, after `mkdir`, and after its lease's `O_EXCL` open.
    - While it is held, L2's `retire` answers `failed`, `admission_open`, and deletes nothing.
    - After it resumes and exits 78, the next hello's `retire` gives `home_absent`, `home_empty`, or `home_deleted` (a whole lease, the life lock free, no fork).
    - A lease left torn gives `unresolved`, said pending.
    - No late `checked`;
  - **the classifier at every caller:**
    - `stop` and `retire` after a launcher exit of 0, 69, 72, 73, 75, 76 or 77 (settled, scoped to the home carrying that spawn's nonce);
    - after 74, a signal or no exit (unsettled);
    - **after 71 (revision 7).**

    Only scoped live proof, or a fresh `check` that exits 0 for the exact home, ever gives `checked`.
  - **The 71 controls (revision 7).** A fixture pre-seeds the attempt's home, and a second run then exits 71. In two cases: an occupied home (a whole lease with its life lock held, and a live recorded child), and a mismatched lease.
    - `create` is answered `outcome_unknown`;
    - `stop` never answers `checked` and `retire` never deletes while the original home is unsettled;
    - the home and its lease survive byte for byte;
    - once the original home is independently settled (its child let go, the lock freed, its entries verified gone), the exact verified home retires behind the full barrier, once.
  - **The same classifier holds for (revisions 6 and 7):**
    - a withdrawal after `go`;
    - the `cancelled` row's replayed `stop`;
    - a `stop` answered `outcome_unknown`, then replayed at the next hello after the child is reaped, **by the same instance** (its `ReplyChild` retained, after 74, a signal or no exit) **and by a new one.** The binding stays `stopping` until that `checked`, which writes `retire` once. The reservation stays `uncertain`, the allowance unchanged, and `t0` and the deadline unrestarted;
    - a lost `stop` receipt, which replays and is recorded once;
  - a crash after a reserve and before its settle's answer: after the restart the reservation is `uncertain`, no settle is sent for it, its usage is recorded with its `ordinal`, and the allowance is unchanged until an operator reconciles;
  - no reply text in the supervisor's `log`.
- **`packages/persistence/src/runtime.db.test.ts`** (extended):
  - the claim's three refusals;
  - **`conversation_execution_go`:**
    - `pending` gives `go` and §8.2.1's `delivered` transitions;
    - the same lease and command replayed gives `go` with no second transition;
    - after `conversation_cancel`, `not_pending`;
    - an older epoch, `stale_epoch`;
    - another lease, `lease_mismatch`;
    - the later `delivered` receipt applies nothing twice;
  - **hello's table (the chosen design, §6), each row of §6's table under real PostgreSQL.** CX-0144 withdrew the "stays `pending` for ever" fail-before: the replay ends that row without the table, and the bridge test above shows it. The table's own transitions are tested here:
    - that row ends `outcome_unknown`, with `conversation_mark_uncertain` moving 0, the payload scrubbed, and `retire` written once;
    - the `running` row ends `outcome_unknown` with its reservations `uncertain`;
    - this instance's own rows are untouched;
    - an unclaimed `pending` row is untouched, and its replayed `create` claims `first` under the new instance;
    - a `cancelled` claimed row stays `cancelled`;
    - **the `stopping` row (revision 6):**
      - a `stop` answered `outcome_unknown` is replayed at the next hello, by the same instance and by a new one, until a `checked` answer;
      - that `checked` writes `retire` once;
      - a second `outcome_unknown` is recorded once and moves nothing;
    - **no row creates a new Ask, `create` command or execution, attempt, reservation, or provider or model call** (revisions 7 and 8):
      - **the lease-loss rows:** exactly one cleanup `retire`, with its own `commands`, `outbox` and `runtime_commands` rows, keyed to the same attempt and reply. Counted: one cleanup command and one delivery after the hello. Still one after a repeated hello and after a replayed receipt;
      - **the `stopping` row:** no command and no delivery row. It replays the existing `stop`, and that replay is not a new dispatch;
      - **the accounting:** no second `create` outbox row for execution, no new attempt or reservation, and the uncertain amounts unchanged;
    - the replayed `create`'s `outcome_unknown` receipt moves nothing;
    - **races:**
      - a claim, go, reserve, settle or receipt from the superseded instance after the hello gets `40001`;
      - one committed before the hello is the table's input;
      - `conversation_cancel` either before or after the hello leaves one terminal state;
  - **the acknowledgement's predicates (revision 5):**
    - each of §7's eight predicates withheld in turn;
    - `terminalWriter` naming a receipt, capture, or the hello's transition, each in its own case;
    - `createAnswered` false until the replayed `create`'s receipt is recorded;
    - `capture: none` true only with no `turn/end` recorded, and false when one is;
    - no predicate ever reports a receipt that doesn't exist;
  - every goal case unchanged.

## 11. What the owner is asked to agree, before any Phase B write

1. **(c), as §1–§2:** the bridge spawns each reply's launcher and owns fd 3 and the relay. The resident launcher holds the reply's `pidfd` and sends its only signals. The supervisor owns the launcher, the paths and the sweep. This amends §8.5's "asks the supervisor for a reply child" and "The supervisor holds each child's process handle".
2. **fd 3** as one duplex socket carrying the prompt, the run gate and the accounting (§3–§4), with fd 0 `/dev/null`. This amends §8.5's four descriptors in name, not in count, and adds `ordinal` to its two usage-bearing items.
3. **No descendants, and signals only to itself, by construction** (§5's filter), as the settlement and containment mechanism, subject to P7 and P8. A failure of either comes back as a stated incompatibility, not a fallback.
4. **The template recipe, `sophia-reply-tree-v1`,** and its link rule (§5), with P1 recording the Linux template.
5. **The exact names in §6:** the methods, transport calls, settings, launcher subcommands and exit codes.
6. **The run gate:** `conversation_execution_go` as the one atomic `pending` → `running` transition, with its replay rule (§6, with the core and ledger owners).
7. **The claim's lease** as `bridgeInstanceId`, every new runtime route behind `runtime_lease`, and **hello's reply table as a chosen design** (§6, with its reasons; the core and ledger owners may keep or drop it). Also `retire` by home state and proof, the crossing table (§7), and **the acknowledgement's eight named predicates** (§7), for the core and ledger owners to bind, beside the relay's own condition. Also **the `stopping` row:** the same `stop` replayed at the next hello, as §8.2.1:273's writer (revision 6).
7a. **The generation seal, the admission lock and its drain** (§5, §6; revision 6):
    - the rename as the namespace fence, and the linearization point for admission;
    - the drain as the proof that no admission is in flight;
    - partial leases kept `unresolved`.

    It works without assuming any process is dead, and leaves the goal path and the rest of the supervisor unchanged.
8. **The launcher's bounded, cancellable waits** before the runtime starts, its one gate and fork intent, and its settlement rules (§5), applied by every caller (`stop`, `retire`, dispose, recovery):
   - the lease first;
   - the child's own `alarm`;
   - the no-`pidfd` settlement with no signal;
   - settled versus unsettled exits: 72, 73, 74 and 77, and the `alarm` as the last resort;
   - **the life lock** as the settlement of a child the lease never recorded (revision 6);
   - **scoped live proof:** a settled exit proves only the home its launcher created, bound by that spawn's nonce. Exit 71 never proves the existing home (revision 7);
   - the unused pipe ends closed on both sides after the fork;
   - Landlock's denial of the lease to the reply's dsh.

   Plus the bridge's named bounds (§6).
9. **The receipt mapping and order** (§6):
   - `rejected` only where no call can have left;
   - every claim refusal is `outcome_unknown`;
   - settles before terminal receipts, under one shared settle deadline;
   - `stop` by the classifier at every caller, with §8.2.1:272-273's mapping (revision 6);
   - a fresh, bounded `check` for any attempt without scoped live proof, on the same instance too (revision 7). Its `absent`, and a current-root `empty`, count only under the spawn fence (revision 8);
   - **exactly one idempotent cleanup `retire` per attempt,** with its own command and delivery rows under the existing schema. No new Ask, execution, attempt, reservation, call or allowance reset (revision 8). The core owner binds its writer and aligns BINDING_MAP §8.2.1's test bullets in an accepted shared window.
10. **§7's recovery table,** and `conversation_reconcile`'s proof source as the operator's separately authorized path, with no automatic release, retry or reset.

Once agreed, the plan's §5 order stands. Each step is its own pin, with a fail-before and the full gates, on the accepted base, after Q12's correction.
