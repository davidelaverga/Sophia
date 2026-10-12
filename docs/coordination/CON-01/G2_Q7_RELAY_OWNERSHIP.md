# CON-01 G2 Q7: who owns a reply child's relay (a proposal for the runtime owner's agreement)

**What this is.** CON-01's answer to the open Q7 in [G2_RUNTIME_PLAN](G2_RUNTIME_PLAN.md) §0 ("Which process owns a reply child's relay"), and to §2.1's "Required" descendant-settlement mechanism. Codex asked for it in CX-0139 and mission request 6116456625. It is **one recommended design for the runtime owner (WBC-02/SDD-01) to agree or correct, as an engineering matter, before any Phase B write.**

**Revision 5, after Codex's CX-0145** ([#198 comment 6117419664](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6117419664); reviewer packet [`51153041`](https://github.com/davidelaverga/Sophia/blob/511530415b3fe894da28553b86e8bf44ce48675c/docs/coordination/CON-01/CX-0145.md)), which read revision 4 (`387fb2dc`, SHA-256 `49e59d2a…`).
- **The joint runtime owner's r3 record** (`15ae009a`) is CHANGES_REQUIRED.
- **Codex ran the unchanged supervisor locally,** with owned stand-ins on Darwin and Node 24.21.0. A supervisor exited; its old child survived; a replacement took the same project lease; and the old child then wrote a late synthetic reply home.
- **That run is no dsh, provider, Linux, Render or Q7 failure.** It shows that "a new instance means the old one exited" is not a premise this design can use.

Revision 5 changes only these:

| CX-0145 | What was wrong in revision 4 | Where it is corrected |
|---|---|---|
| (1) No future writer | Hello, an absent home, or an empty home was read as the old bridge or a paused launcher being gone | §5: **the generation seal.** Each launch has its own reply root, and the next launch renames every older root before it starts. The launcher resolves every path by name and holds no descriptor into a home before its lease, so a sealed generation can never create or fill a home again. §6, §7: no death is inferred from a hello, a sweep or an absence |
| (2) The unrecorded child | A crash between the fork and the child's entry left a launcher-only lease, read as "no fork" | §5: a fork intent is written before the fork, and there is **one gate** that the child can't pass until its entry is durable and its `pidfd` held. Before the gate it does nothing but arm its own bound. §7: `home_deleted_child_unrecorded`, only with the launcher proven gone |
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
- The eighth barrier condition (the relay `closed`) would sit in the supervisor while `retire` is answered by the bridge. The barrier would then span two processes.
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
  - **When it is taken:** `pidfd_open(child)` right after the fork and the child's lease entry. The child is still waiting at the gate (§5), where it has done nothing but arm its own bound.
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

- **The only other descriptors:** the gate, closed before the `exec`, and the exec-status pipe, close-on-exec, so the `exec` itself closes it. L0 (§9) found exactly 0–3 open in the new image.
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
  - A settle with no answer within its bound leaves the reservation open. §6's ordering and §7's table say what follows; a settle is never sent after a terminal receipt.

**`ordinal` on the usage-bearing items** amends §8.5's projection table. It is correlation, so §8.2.2's scrubbed form keeps it. It is what ties each recorded usage to its reservation (§7).

**Order is the safety.** Every line rides one stream, in order.
- **A held observation also holds the `reserve` behind it.** While delivery is blocked, no new model call can leave; the reply's deadline still runs.
- **The answer to a `reserve` is written only after the API answered.**
- **The run gate isn't ordered by fd 3 alone.** The `delivered` receipt travels its own path (bridge:667, :684-690), so `go` waits for the API's own committed answer (§6), not for the receipt.

**The child has no service credential.** Its environment never has `SOPHIA_BRIDGE_URL` or `SOPHIA_BRIDGE_TOKEN`. It reaches the service only through these lines, so a reply child can't call any runtime route.

## 5. The launcher, its containment, and settling descendants

**`reply-launch.py run`**, its argv: `--root <root>/replies`, `--attempt <id>`, `--parent <bridge pid>`, `--nonce <hex>`, `--node`, `--entry` (`unit.runtimeDir` + `unit.launcherEntry`), `--runtime-dir`, `--template`, `--template-digest`, `--profile-name`, `--unit <runtimeUnitId>`.

**In the launcher, before the fork:**
1. **The parent binding:** `prctl(PR_SET_PDEATHSIG, SIGKILL)`, then `getppid() == --parent`, or exit 119 (`owned-exec.py:13-16`). `SIGCHLD` is set to `SIG_DFL`, never `SIG_IGN`, and `SA_NOCLDWAIT` is never set, so only this launcher reaps its child. Node spawns from its loop thread, which lives as long as the process.
2. **fd 0 (the control channel) and fd 3 must both be `AF_UNIX`/`SOCK_STREAM`,** as Node's `'pipe'` makes them, or exit 64. Then `alarm(setupSeconds)` (30 s by default): the last-resort bound over everything before the runtime starts (below).
3. **The home, under its generation's root (revision 5).** `--root` is this bridge generation's own root, `<projectRoot>/replies/gen-<generation>` (§6).
   - **Every path is resolved from `--root` by name,** and the launcher holds no descriptor into the home until its lease is durable. So once a newer generation seals this root (below), a by-name step fails instead of writing anywhere.
   - **`--root` must exist** (else exit 78 `root_sealed`), be owned by the effective uid, have mode 0700, and not be a link.
   - **Then `mkdir(<root>/<attemptId>, 0700)`,** which may not already exist. `EEXIST` is the leftover case, `home_exists`, exit 71. `ENOENT` means the root was sealed meanwhile: exit 78.
4. **The lease, the first file in the home.** `lease.json` is created with `O_EXCL`, by name. Before any fork it holds two things, and the file and its directory are fsynced:
   - **the launcher's own entry,** with §8.5's five fields:
     - the pid;
     - `/proc/<pid>/stat` field 22, which an `exec` doesn't change;
     - the boot id;
     - the executable: the Python realpath for the launcher, the realpath of `--node` for the child;
     - the nonce;
   - **a fork intent (revision 5).**

   A failure is exit 77 `lease_failed`, or 78 if the root was sealed, with no fork either way. **A home without a lease never had a child.**
5. **Then the rest of the home:** `home/`, `home/tmp/`, `dsh-home/profiles/`, `work/` and `diag/`, each 0700. fds 1 and 2 are opened onto `diag/stdout` and `diag/stderr` and `dup2`'d into place.
6. **The profile copy** (below), and its digest check, else `profile_mismatch`, exit 70.
7. **The capability check:** a Landlock ABI of at least 4, `seccomp`, x86_64, and `pidfd_open`. Else `containment_unavailable`, exit 69.

**Between steps 3 and 7, and between copied files,** the launcher polls fd 0 without blocking. A `TERM` or `KILL` line, or end-of-file, ends the setup: exit 72 `cancelled`. No child exists yet, and the partial home stays for `retire` (§7).

**The fork.** The gate and the exec-status pipe are made first.

**In the child: nothing before the gate but its own bound (revision 5).**
- **a. Its bound and its parent binding,** and nothing else. First `alarm(childSetupSeconds)` (10 s by default). Then `PDEATHSIG` (`SIGKILL`). Then `getppid()` must be the launcher, or exit 119.
- **b. The gate.** Wait for the launcher's one byte, then close the gate.
  - An end-of-file instead ends the child at once, with exit 118. That happens when the launcher closes the gate without the byte, or dies.
  - **Before this point the child has opened, written and executed nothing.** That is what lets a lease with a fork intent but no valid child entry be settled honestly (below).
- **c. Containment, after the gate:**
  - `/dev/null` onto fd 0;
  - `RLIMIT_CORE` 0 (`landlock-launch.py:99`);
  - **Landlock:** an ABI of at least 4 (:96-98), with every filesystem right that ABI defines handled. Read and write beneath the home. Read and execute on the runtime directory, the pinned Node, and the system libraries and certificates (`/usr/lib`, `/lib*`, `/etc/ld.so.cache`, `/etc/ssl`, `/etc/resolv.conf`, `/etc/hosts`, `/etc/nsswitch.conf`), plus `/proc/self`, `/dev/null` and `/dev/urandom`. Nothing else; P7's trace fixes the exact read list. Then `no_new_privs` (:139) and `restrict_self` (:141);
  - **the self-test:** creating a file in `<root>`, outside the home, must fail;
  - **the seccomp filter** (below), built with the child's own pid, which the `exec` doesn't change.

  A stall here falls in the launcher's exec-status wait, where the `pidfd` is already held.
- **d. The `exec`.** Close everything but 0–3 and the close-on-exec status pipe. `chdir(work/)`. Then `alarm(0)`, since an alarm survives `execve`. Then `execve(--node, [node, entry, '--profile', name], env)`. `env` is built here from nothing:
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

**If the launcher itself dies between the fork and step 4** (a crash, or its own `alarm`), the gate's write end closes with it. The child exits 118 at the gate, or by its `PDEATHSIG`, never having opened, written or executed anything. The lease then shows the fork intent with no valid child entry (§7).

**Exit codes, and which of them prove anything.** A **settled** exit is one the launcher makes only after it reaped its child, or before any fork. A settled exit counts as proof that the reply's processes are gone only when **the live bridge that spawned the launcher sees it**. Anything else is **unsettled** and proves nothing; §7 then needs `check`.

| Exit | Meaning | Settled |
|---|---|---|
| 0 | dsh exited 0 | yes |
| 64 | usage: a bad argv, or fd 0 or fd 3 not an `AF_UNIX` stream | yes (no fork) |
| 69 | `containment_unavailable`, a failed or early-ended `exec`, or no `pidfd` (the child reaped at the gate) | yes |
| 70 | `profile_mismatch` | yes (no fork) |
| 71 | `home_exists` | yes (no fork) |
| 72 | `cancelled` before the runtime started | yes (no fork, or the child reaped) |
| 73 | `exec_timeout` | yes (the child reaped) |
| 74 | `child_unsettled`: the child not reaped within `childSettleMs` | **no** |
| 75 | dsh exited non-zero | yes |
| 76 | a signal ended dsh | yes |
| 77 | `lease_failed` | yes (no fork, or the child reaped at the gate) |
| 78 | `root_sealed`: a newer generation sealed this root | yes (no fork) |
| 119 | wrong parent | yes (no fork) |
| ended by a signal (`SIGALRM`, its own `PDEATHSIG`, …) | `setup_timeout` or killed | **no** |

**Bounded before the runtime starts, and what that doesn't promise.**
- **Normally,** a cancellation is seen at the next poll point: between setup steps and between copied files, and at once during the exec-status wait.
- **A single blocking call delays it until that call returns.** That could be the copy of a large file, or an `fsync` on a slow disk. 50 ms is the poll interval, not a bound on such a call.
- **If a call never returns:**
  - the launcher's `alarm` (`setupSeconds`) ends the launcher, and that exit is unsettled;
  - a child before its gate has only trivial steps, with its own `alarm` behind them.
- **Nothing is ever signalled by number.**

The L0 cases are in §9.

**The generation seal (revision 5; CX-0145).** Before each launch, `sweepReplies` (§6) **renames** every older `gen-*` root under `<projectRoot>/replies` to `sealed-<generation>`. A rename is atomic. It then creates the new generation's root fresh.
- **What the seal guarantees.** After it, any launcher of an older generation, whether running, paused or not yet started, fails its next by-name step (exit 78), since it resolves every path from its own root by name and holds no descriptor into a home before its lease.
  - **It can create no home.**
  - **It can add nothing to an empty home.**
  - **It can write only into a home whose lease it already holds,** and that home is found in its sealed root and verified through its lease (below).
- **What the seal doesn't claim:** that any process is dead. CX-0145 ran the unchanged supervisor locally, with owned stand-ins: an old dsh can outlive its supervisor, and its replacement takes the same project lease. So neither a new hello, a sweep nor an absent file is used as proof of death.
- **If the seal fails,** that generation starts with replies off (§6), and homes in any unsealed older root stay `unresolved`.

**`reply-launch.py sweep --replies <projectRoot>/replies`** (the supervisor's) and **`check --replies … --attempt …`** (the bridge's, for `retire` when it holds no handle). Both look for the attempt's home in every root, current and sealed. For each recorded lease entry:
1. `pidfd_open(pid)`. `ESRCH` means `gone`.
2. Verify the five fields from `/proc/<pid>`.
3. Signal 0 through the `pidfd`.
4. Only then, for `sweep`, `pidfd_send_signal(SIGKILL)`, the child before the launcher, and wait until each `pidfd` is readable.

**A mismatch signals nothing, and the home is `unresolved`.**

**What `check` reports for each kind of home:**

| The home | What is known | Report |
|---|---|---|
| no lease, nothing else, in a **sealed** root | there was never a child (step 4), and no older launcher can add to it by name | `empty` |
| no lease, nothing else, in the **current** root | the same, but only this bridge can know its own launcher has exited: `check` can't. It is the live path's case (§7) | `unresolved` |
| no lease, but other files | impossible by the order | `unresolved` |
| the launcher's entry, no fork intent | no fork happened | `gone` once that entry is verified |
| a fork intent but no valid child entry (none, or a torn last line) | a child may have been forked, but it never passed the gate: the byte is written only after the child's entry is durable and its `pidfd` held. Once the launcher's entry is verified `gone`, the gate's only writer is gone, so that child can open, write and execute nothing, ever | `child_unrecorded`, once the launcher's entry is verified. That is not a claim that the child is gone |
| both entries | — | `gone` once both are verified |
| a host without `pidfd` | nothing is verifiable | `unresolved` for every home with a lease |

The report is content-free JSON lines: `{attemptId, root, state: gone|stopped|unresolved|empty|child_unrecorded}`. `check` exits 0 only for `gone`, `empty` or `child_unrecorded`. **`sweep` and `check` never delete:** only `retire` does (§7).

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

The seccomp filter is installed in the child after Landlock, before the gate. It is x86_64 only, and refuses x32 and every other architecture (the renderer's prologue, `landlock-launch.py:179-186`).

| What | Rule | Why |
|---|---|---|
| `fork`, `vfork`; `clone` without `CLONE_THREAD` | `EPERM` | No process, so no descendant to settle |
| `clone3` | `ENOSYS` | The C library falls back to `clone`, whose flags a filter can read |
| `kill`, `tgkill`, `rt_sigqueueinfo`, `rt_tgsigqueueinfo` | allowed only when the target is the process's own pid (a constant in the filter); else `EPERM` | Signals reach only itself (CX-0142's containment detail) |
| `tkill`, `pidfd_open`, `pidfd_send_signal`, `pidfd_getfd` | `EPERM` | No other way to signal or reach another process |
| `socket`, `socketpair` with `AF_UNIX` | `EPERM` | No new local socket, abstract or by path; the inherited fd 3 is unaffected |

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
  - `SOPHIA_REPLY_ROOT` = `<projectRoot>/replies/gen-<generation>`, this launch's own root (revision 5). `<generation>` is a fresh random id per launch, and the root is created 0700 by `sweepReplies` just before the launch. Also `SOPHIA_REPLY_DIR` = `<projectRoot>/replies`, for `check`;
  - `SOPHIA_REPLY_LAUNCHER`, `SOPHIA_REPLY_PYTHON`, `SOPHIA_REPLY_NODE` = `process.execPath`;
  - `SOPHIA_REPLY_ENTRY` = `join(unit.runtimeDir, unit.launcherEntry)`, and `SOPHIA_REPLY_RUNTIME_DIR`;
  - `SOPHIA_REPLY_TEMPLATE`, `SOPHIA_REPLY_PROFILE`, `SOPHIA_REPLY_TEMPLATE_DIGEST`.

  These are paths and a digest: no secret and no content.
- **`sweepReplies()`** is new and private. It runs `spawnSync(python, ['-I', launcher, 'probe'])`, then `sweep`, each bounded.
  - **Before each launch, it seals every older generation (revision 5, §5):** it renames each `gen-*` root to `sealed-*`, then creates the new generation's root. This is the generation fence that CX-0145's supervisor-loss crossing calls for. It needs no broader supervisor change, and the goal path is untouched.
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
  | `settleWaitMs` | each pending settle's resends |
  | `receiptWaitMs` | `retire`'s wait for the bridge's own queued receipts |
  | `deadlineMs` (120,000) | the reply, from its spawn |
- **`dispatch`** (bridge:651-672) is unchanged. Its `parseCommand` accepts a reply binding and `retire` once the wire does (`KINDS`, `protocol.ts:28`; the wire and contracts are held).
- **`execute`** (bridge:694) gains one branch, after the unit and id checks (:697-700) and before the duplicate, epoch and `switch` (:702-727): a binding with `conversationReplyId` goes to `this.replies.execute(command)`. Reply attempts never enter `attempts` or `bySession` (bridge:144-150), so the goal path's hooks, guard and `metered` never see them.

  | Kind | `ReplyChildren` method | What it does |
  |---|---|---|
  | `create` | `createReply` | **1. Redelivery:** a command this instance already holds is answered from its recorded receipts (as bridge:703-704), with no claim call. **2. Before the claim, `rejected`:** validation fails, `replies` is `null` (`containment_unavailable`), or 2 children are live (`runtime_busy`). **3. The claim:** `conversationClaim({attemptId, commandId, authorityEpoch, leaseId: instanceId})`, resent until answered within a bound. Only `first` goes on. `refused` (any code), or no answer, is answered **`outcome_unknown`** and spawns nothing. **4. Spawn** (§3), and the `start` line written. **5. The run gate,** on `ready`: `conversationGo({attemptId, commandId, authorityEpoch, leaseId})`, resent with the same body until answered within `goWaitMs`. **`go`:** write the one `go` line, queue the `delivered` receipt, and resolve; the command, and with it the prompt, is released. **`refused`** (`not_pending`, `stale_epoch`, `lease_mismatch`), **or no answer:** no `go` is written. The child's stop sequence is started (the `stop` line, then `ReplyChild` runs it on §6's one clock), and the create is answered `rejected` at once, with that code or `go_unconfirmed`. **Cleanup is decoupled from the create handler (revision 5):** a later `stop` or `retire` joins the same sequence and its clock, and never restarts it |
  | `stop` | `stopReply` | **Fence the relay,** then the `stop` line at `t0`; or join a sequence already started, keeping its `t0`. A `TERM` line at `t0 + graceMs`, a `KILL` line at `t0 + killMs`. Then wait for the launcher's exit until `t0 + killMs + exitWaitMs`, and for every settle the child sent, answered or out of `settleWaitMs`. **The answer follows the proof classifier (§5, revision 5):** `checked` only when this bridge saw the launcher's **settled** exit, or, for an attempt it never ran, when `check` exits 0. An unsettled exit (74, or a signal), or no exit by the bound, is answered `outcome_unknown`, and the home goes to verification (§7). **No signal is sent by the bridge** |
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
    - **A `stop` command** waits behind it in the attempt's queue (bridge:668-671), so it starts at most that late. It then joins, or starts, the one stop sequence. Its process settlement ends by `t0 + killMs + exitWaitMs`, and its settles within a further `settleWaitMs`. Its receipt follows the classifier.
  - **When a bound runs out:**
    - no `ready` within `readyWaitMs`: the stop sequence starts, and the create is answered `rejected` (`timeout`), since no `go` means no call;
    - no settled launcher exit by `t0 + killMs + exitWaitMs`: the `stop` is answered `outcome_unknown`, and the home waits for verification (§7). No false `checked`.
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
  - **`outcome_unknown`** for any claim refusal or lost claim answer, and for `home_exists`. These never release anything (§7).
  - **`failed` after `delivered`,** with a fixed reason: `timeout`, `relay_invalid`, or `child_exited` (an end-of-file without a completed `turn/end`). A completed turn ends through capture, not through a receipt.
- **Settles before terminal receipts (CX-0142 P1-C, the live path).** Any terminal receipt for a reply waits until every `settle` the child sent has been answered or has run out its bound. That covers `create` `failed` or `rejected` after `start`, and `stop` `checked` or `outcome_unknown`. So `conversation_mark_uncertain` (S2:377-397), which that receipt runs, never races an answered settle. **A settle still unanswered then is never sent after the receipt.** Its reservation becomes `uncertain` and follows §7's table.
- **`connect`** (bridge:319-350) hands each reply binding in the hello to `reconcileReply`, not `reconcile` (bridge:1251).
- **`start()`'s disposer** (bridge:309-316) also calls `replies.dispose()`: it fences every relay, and writes `stop` on fd 3 and `TERM` on each control pipe. Nothing is receipted from there, and nothing there is taken as proof. When the bridge's process ends, every control pipe closes, and each launcher sends `SIGKILL` through its `pidfd`. If the bridge dies abruptly, `PDEATHSIG` ends the launcher and then its child; the next hello does the rest.

**`reply-child.ts`** (new):
- **`ReplyChildren`:** a map by `attemptId`, the cap, `execute`, `reconcileReply`, `dispose`.
- **`ReplyChild`:**
  - the launcher's `ChildProcess`, kept only for its control pipe and its exit. **No `.kill(` is ever called on it; a test fails if one is**;
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
- **`conversationAcknowledged(body, signal)`:** `/acknowledged`. It takes keys and states only, and answers §8.5's seven conditions, with each ordinal's ledger state.
- **`observations(batch, signal?)`:** the signal is new and optional. The goal path passes none, so it is unchanged.

**The API and 0049** (held; the core and ledger owners' part):
- **The claim's `lease_id` is the bridge's `instanceId`,** the same string `runtime_hello` stores as the instance's `bridge_instance_id` (0012:412; 0028:91).
- **Every new runtime route goes through `runtime_lease`,** exactly as receipts and observations already do: claim, go, reserve, settle and acknowledged. A bridge superseded by a newer hello is therefore refused (`40001`), with the same lock order: the project, then the instance, then the request's row. A bridge that receives `40001` stops its reply children through their control channels and stops polling. That case arises when an older bridge outlives its replacement. CX-0145 reproduced it locally with the unchanged supervisor and owned stand-ins: the supervisor's lease names its own pid (supervisor:101-120), so an orphaned dsh survives the supervisor's death. These database fences stop its later calls. The generation seal (§5) stops its later home writes.
- **`conversation_execution_go(attempt, command, lease, epoch)`, new** (behind `/go`). Under the request's row lock, for the claim's own command and lease, at the current epoch, with the request `pending`, it does exactly the transitions §8.2.1 assigns to `create` `delivered`: the binding and the attempt to `running`, and the request `pending` → `running`. It records the claim's outcome as `running` and answers `go`.
  - For the same lease and command, already `running`, it answers `go` again, without a second transition (the replay of a lost answer).
  - Anything else is refused.
  - The later `delivered` receipt is recorded and applies nothing twice. This replaces "only the committed delivered receipt moves pending→running" with one atomic transition that the receipt then records.
- **`runtime_hello`'s reply branch (CX-0144 P1-E): one atomic table.**
  - **Where it runs:** in the hello's own transaction, after its project lock and instance update (0028:90-94), so after `runtime_lease`'s order.
  - **How:** for each reply request of this runtime unit that is not yet retired, its row is locked `FOR UPDATE`, in attempt-id order, and the request, its claim, and the claim's lease against this hello's `bridgeInstanceId` decide the row. The table is written as 0049's reply branch, the core owner's.
  - **What the table does not assume (revision 5; CX-0145).** It doesn't take a new instance id as proof that the old bridge, its launchers or its children are dead. An older bridge can outlive its replacement.
    - **The table only settles database state.** The old bridge's later calls are refused (`runtime_lease`), and its later home writes are fenced by the generation seal (§5).
    - **No-writer proof comes from the seal and the lease checks** (§7), never from the hello.

  | Request | Claim | Claim's lease | Transition (once, under the lock) | Hello lists | `retire` |
  |---|---|---|---|---|---|
  | `pending` | none | — | **none: unclaimed pending is untouched.** If its `create` command exists, the cursor replays it (`runtime_cursor`, 0012:398-401), and it may still claim `first`. That is its first execution, since no claim means no spawn. If no command exists, §2.4's reconcile path applies | `active` | — |
  | `pending` | `claimed` | this instance (a reconnect) | none | `active` | — |
  | `pending` | `claimed` | another instance | **lease lost before `go`:** the request goes to `outcome_unknown` (terminal, `settled_at` set), the attempt to `outcome_unknown`, the binding to `lost`, and the claim's outcome to `lost`. `conversation_mark_uncertain` runs and moves 0, since no reservation can exist before `running` (S2:311). The `create` payload is scrubbed in `runtime_commands.body` | `stopped` | written |
  | `running` | `running` | this instance | none | `active` | — |
  | `running` | `running` | another instance | **lease lost after `go`:** as the row above, and every open reservation becomes `uncertain` | `stopped` | written |
  | `cancelled` (withdrawn) | `claimed` or `running` | another instance | the request stays `cancelled`; the claim's outcome becomes `lost`. Its unanswered `stop` is replayed by the cursor | `stopped` | written by that `stop`'s `checked` (§8.2.1) |
  | any other terminal state | any | any | none | `stopped` until retired | already written |

  - **Why a table at all, now that the replay is known to reach a writer (CX-0144).** Without it, a claim lost before `go` still ends: the replayed `create`'s claim is refused, and the `outcome_unknown` receipt ends the request. The table is therefore **an engineering choice for the core and ledger owners to accept or drop, not a missing writer.** Its reasons:
    - **It ends the request at the hello,** not whenever the replay is processed.
    - **It makes the outcome independent of how the new bridge answers the replay.** A bridge whose replies are off, or that is busy, answers `rejected` before any claim. For a request still `running`, §8.2.1's `rejected` row would release a reservation the old execution may have used. The `running` row prevents that; the `pending` row is its consistent counterpart.
    - **If the owners drop the table,** the bridge must ask the claim before ever answering a replayed `create` `rejected`.
  - **The hello writes no runtime receipt.** Its transition is the terminal writer. The `create` command stays unanswered, so the cursor replays it to the new bridge, whose claim answers `not_pending`. That bridge answers it `outcome_unknown` (`claim_refused:not_pending`), a true answer that is recorded and moves nothing (§8.2.1, "No receipt revives a reply"). The command is then answered, the cursor moves past it, and its outbox row maps to `outcome_unknown`, which Q12's correction keeps out of the reconcile window.
  - **Whatever the new bridge answers a replayed `create` with** (`outcome_unknown` after the claim's refusal, or `rejected` before any claim, when its replies are off or it is busy), a receipt after a terminal state moves nothing (§8.2.1). The `rejected` row releases only a reservation still `reserved`, and the hello left none: it moved them to `uncertain`, or there were none.
  - **No new logical request, model call or allowance reset.** The transition creates no outbox row or command and no reservation, and only `uncertain` changes any count.
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
| Spawn | `<root>/replies/<attemptId>/`, and its two-entry lease | `attemptId`, `nonce` |
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
2. **Stop and reap.** A `stop` line, then `TERM` and `KILL` lines, all through the launcher's `pidfd` (or the child's own exit). The launcher reaps, then exits; the bridge observes that exit. The relay reads fd 3 to end-of-file, under its bound, schema, admission and backpressure. Nothing is cleaned while the child lives.
3. **Settles, then the terminal receipt.** Every settle the child sent is answered or has run out its bound. Then the terminal receipt goes (§6).
4. **Delivery.** A `draining` relay sends its items with their text. A `fenced` one sends them reduced. Every item is acknowledged.
   - **The relay is `closed`** at end-of-file, with no item held, every item acknowledged, and fd 3's parent end destroyed.
5. **`retireReply`, in this order:**
   1. proof that no reply process remains: this bridge saw its launcher's **settled** exit, or `check` exits 0 (§5; the table below);
   2. the relay is `closed`;
   3. the journal's keys and ordinals are read from the home, under the same bound and schema;
   4. `conversationAcknowledged` confirms all seven conditions, and every ordinal is `settled`, `released`, or `uncertain` with its usage recorded;
   5. `<root>/replies/<attemptId>` is not a link;
   6. delete it without following links, and verify it is gone (`lstat` `ENOENT`);
   7. drop the `ReplyChildren` entry;
   8. answer `checked`.

   Anything missing is `failed` with a fixed code (`child_live`, `relay_open`, `barrier:<condition>`, `lease_mismatch`, `delete_failed`). The home stays, said pending, and is retried at the next hello (§8.5, step 5).

   **Before step 4,** `retireReply` waits, within a bound, until every receipt this bridge itself queued for the attempt has been acknowledged. So the barrier never runs ahead of the bridge's own receipts.

**`retire` by the state of the home, and by what is proven (revision 5),** including a new bridge with no `ReplyChild` for the attempt.
- **`retire` needs two things before `checked`:**
  - **no live writer:** the reply's processes are gone, or provably can't write;
  - **no future writer:** nothing can create or add to the home later.

  Neither comes from a hello, a sweep, an absent file or `PDEATHSIG` alone.
- **What is proof:**
  - **The live bridge saw its own launcher's settled exit** (§5): the launcher reaped its child, and the bridge reaped the launcher.
  - **Each recorded lease entry verified `gone` through a `pidfd`** (`check`).
  - **For a home in a sealed root, the seal itself** (§5) proves there is no future writer. It doesn't prove any process is dead.
  - **A fork intent with no valid child entry, and the launcher verified `gone`:** the gate's only writer is gone, so the unrecorded child (if any) never passed the gate. It opened, wrote and executed nothing, and never can.

  An unsettled exit (74, or a signal such as `SIGALRM`) is not proof.
- **`checked` says only what is true, and never comes before the barrier.** Its reason distinguishes `home_absent`, `home_empty`, `home_deleted` and `home_deleted_child_unrecorded`. It never claims a deletion that didn't happen, or a process gone without proof.

| The home | What is proven | `retire` |
|---|---|---|
| absent from every root, **and every older generation sealed** | no older launcher can create it (the seal), and this generation never spawned it (no `ReplyChild`, and its claim is refused) | the barrier, then `checked`, `home_absent`. It claims no process verified |
| absent, but an older `gen-*` root not sealed | nothing: an older launcher could still create it | `failed`, `unsealed`; said pending |
| no lease, nothing else, in a **sealed** root | there was never a child, and no older launcher can add to it by name | delete, verify, `checked`, `home_empty`. It claims no process verified |
| no lease, nothing else, in **this** bridge's root | this bridge saw its own launcher exit (any exit: the bridge reaped it), so no writer remains | delete, verify, `checked`, `home_empty` |
| the launcher's entry and no fork intent | no fork; the launcher proven gone | delete, verify, `checked`, `home_deleted` |
| a fork intent, no valid child entry (none, or a torn line) | the launcher proven gone; the unrecorded child never passed the gate | delete, verify, `checked`, `home_deleted_child_unrecorded`. That is not a claim that the child is gone |
| both entries proven gone, no journal or a journal with no observation | the run ended before `go`: the journal holds at most its command record | the journal read under its bound and schema; the barrier; delete, verify; `checked`, `home_deleted` |
| the same, with a journal holding observations | the run passed `go` | the recovery relay first (`fromJournal`, below), then as above |
| any recorded entry not yet proven gone (after an unsettled exit, or on a host without `pidfd`) | nothing | `failed`, `unsettled`. The home stays, said pending, and `check` is retried at the next hello |
| no lease, but other files in it | the order makes this impossible | `failed`, `unresolved` |
| a journal torn or unreadable beyond its last whole entry | — | `failed`, `barrier:journal`; the home stays, said pending |
| a lease entry live and matching | can happen only before the next sweep | `failed`, `child_live`; the next sweep stops it through its `pidfd` |
| a lease entry live, not matching | — | `failed`, `lease_mismatch`; the home is unresolved |

**The acknowledgement, as named predicates (revision 5, for the core and ledger owners to bind).** §8.5's seven conditions stay; none is skipped, and none is ever answered by asserting a record that doesn't exist. `/v1/runtime/conversation/acknowledged` answers each condition as a named predicate with its key, and `retireReply` requires every one:

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

**After a restart** (`reconcileReply`):
- **What the supervisor established before this dsh started:** it sealed every older generation and swept their leases. That proves no older launcher can create or fill a home by name. It doesn't prove the old bridge, or any process, is dead. `check` verifies each recorded entry.
- **What hello lists, by §6's table:**
  - each lease-lost or terminal binding, `stopped`;
  - an unclaimed `pending` one, `active`: its replayed `create` may still claim `first`;
  - this instance's own, unchanged.
- For a home that exists, `ReplyRelay.fromJournal`:
  - asks `/acknowledged` which keys are recorded, and each ordinal's ledger state;
  - sends the missing items reduced, with their usage and `ordinal`;
  - resends a journaled settle only for an ordinal still `reserved` (the table);
  - closes.
- Nothing is re-run, and a recovered observation never publishes (§8.2.2).

**Every crash point and crossing (CX-0144, CX-0145).** L1 is the bridge that claimed; L2 is the next instance. The `create` replay is the cursor's (0012:398-401). "L1 dies" includes the case CX-0145 showed, where L1 is **not** dead but has outlived its supervisor: every row holds for a live L1 too, because its calls get `40001` and its root is sealed.

| Where L1 stops, or what crosses | Outcome |
|---|---|
| after its claim call, with the claim not committed | no claim. L2's hello leaves the request `pending`; the replayed `create` claims `first` under L2 and runs once |
| after the claim committed, before the spawn | the hello's "lease lost before `go`" row: `outcome_unknown`. The replayed `create` is answered `outcome_unknown` by L2. `retire`: `home_absent`, since L2's launch sealed L1's root |
| **L1 alive, paused after `first` and before its launcher's `mkdir`; L2 seals, says hello and retires; then L1 resumes** (CX-0145's crossing) | `retire`: `home_absent`, as above. L1's launcher then resolves its sealed root by name and exits 78 with no home. If L1 reaches its go call instead, that gets `40001`. **No late home and no call** |
| **L1 alive, its launcher paused after `mkdir` and before the lease; L2 seals and retires; then it resumes** | `retire`: `home_empty` in the sealed root (deleted). The resumed launcher's by-name lease write fails: exit 78, no fork, nothing written |
| after the spawn, before the `mkdir` or before the lease (L1 dead) | the same row. `retire`: `home_absent`, or `home_empty` |
| **L1's launcher dies after the fork, before the child's entry is durable, or after a partial entry** | the lease shows the fork intent with no valid child entry. The child exits 118 at the gate's end-of-file, or by `PDEATHSIG`, never having passed it. `retire`: `home_deleted_child_unrecorded` once `check` verifies the launcher `gone`; until then `failed`, `unsettled` |
| after the `start` line, before `ready` or before the go call | the same row. The child was sent `SIGKILL` by `PDEATHSIG`, which isn't proof. `retire` deletes the pre-`go` home only once `check` verifies both lease entries `gone` through `pidfd`s; until then it answers `failed`, `unsettled` |
| a lost claim answer, L1 alive | the resend finds `already_claimed`: `outcome_unknown`, no spawn (§6) |
| a lost claim answer, then L1 dies | the "lease lost before `go`" row |
| `go` committed, its answer lost, L1 alive | the resend is answered `go` again (same lease and command); one `go` line |
| `go` committed, L1 dies before or after writing `go` | the "lease lost after `go`" row: `outcome_unknown`, open reservations `uncertain`. Recovery follows §7's ledger table |
| L1's `delivered` receipt, or any write, sent after L2's hello | refused by `runtime_lease` (`40001`), so nothing is recorded. One that committed before the hello is the `running` row's input |
| a reconnect by the same instance | its own rows untouched. Replayed commands are answered from memory (§6, step 1) |
| withdrawn while `pending` and unclaimed | `conversation_cancel` ends it. The replayed `create`'s claim is refused: `outcome_unknown`, which moves nothing |
| withdrawn while claimed, before `go`, L1 alive | the go call is refused, the child is stopped with no step, and the create is answered `rejected` |
| withdrawn while claimed, before `go`, L1 dead or outlived | the `cancelled` row. The replayed `stop` is answered by L2 by the classifier: `checked` only if `check` exits 0, else `outcome_unknown` (§6). That writes `retire` |
| withdrawn after `go` | the ordinary `stop` (below), or the `cancelled` row if L1 died |

**Withdrawal:**
- **Before `go`:** the go call is refused, the child takes no step, and the create is answered `rejected` (§6).
- **After `go`:**
  1. `conversation_cancel` raises the epoch to 2 and writes `stop`.
  2. `stopReply` fences the relay first. Queued items are reduced in place, and later lines are reduced at parse.
  3. Then the `stop` line, `TERM` and `KILL` through the launcher, and the exit.
  4. Settles are answered, or run out their bound.
  5. `stop` is answered `checked`; any reservation still open becomes `uncertain`.
  6. `retire` runs behind the barrier.

A late line, live or recovered, is stored scrubbed with its usage. A later `create` for the attempt meets the claim's refusal and spawns nothing.

## 8. What is preserved

- **Option C:** one native attempt per request, and the reply binding as A04's `oneOf`, as the plan's §2.2 has it.
- **B-1's isolated home per reply:** every writable path is under `<root>/replies/<attemptId>/`, enforced by Landlock with a self-test. The environment is set once, at `exec`, and no process-global home changes. The parent's and the supervisor's environments never change.
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
- **Versions:** Node 24.21.0, which is the pinned version; Python 3.13.16; glibc 2.39; Linux 6.18 in this session's container, not the deploy host.
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
| `l0-seal.out` | `bea921b654dc1070` | **Old launcher paused before `mkdir`, root sealed, resumed:** exit 78, and no home anywhere. **Paused after `mkdir` and before its lease, sealed, resumed:** exit 78; the sealed home stays empty, with nothing written after the seal. **The launcher dying after the fork, before the child's entry:** a lease of `[launcher, fork]`, and the child never passed the gate (no marker). **After a partial entry:** `[launcher, fork, torn]`, the same. **No `pidfd`:** exit 69, the gate never opened. **A normal run:** passed the gate and ran |
| `l0-cancel.out` | `028d1c07a7556686` | **Setup cancelled by a `TERM` line:** exit 72 in 366 ms, with no child forked. **Child stalled before the gate, control end-of-file:** exit 72 in 357 ms, the child killed through the `pidfd` and reaped (`/proc/<pid>` gone). **Child stalled after the gate:** the exec wait timed out at 1 s, exit 73, the child reaped. **Runtime started, `TERM`:** exit 0. None of the cancelled cases reached the runtime (no fd 3 line) |
| `fd3-parent.mjs`, `fd3-child.py`, `fd3-run.out` | `cf26d1433d93cdd0`, `96be0ff2ad75be66`, `26314673f260b457` | From revision 1: Node's `'pipe'` at fd 3 is a duplex `AF_UNIX`/`SOCK_STREAM` socket |
| `fd3-node-parent.mjs`, `fd3-node-child.mjs`, `fd3-node-run.out` | `3907ed69697cf325`, `9b7281407b8c8e6c`, `80bc52444c13cd5a` | From revision 1: a Node child opens fd 3 as `net.Socket({fd: 3})` and exits on end-of-file. **Its "`kill()` after the exit returns `false`" is withdrawn as evidence of identity** (§2) |
| `noproc-exec.py`, `noproc-node.mjs`, `noproc-run.mjs`, `noproc-run.out` | `978d111723c7e06c`, `c7169f3709a5186c`, `3aad16b9b666a48c`, `397e7cf2161e820c` | From revision 1: the process-creation part of the filter alone |

**Runs not kept:**
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
  - the image has `python3` ≥ 3.9.

  The image doesn't exist yet: `imageDigest` is null (`docs/pack/ops/deployment-units.json`, unit `execution_host`).
- **Still open after the filter, named for the owner (a containment gap, not an authority):**
  - **A reply child can open outbound TCP and UDP.** That is how it reaches its provider route, so other local listeners are reachable too, unless the host's egress policy restricts execution jobs, as the deployment bindings already require ("Restrict egress for execution jobs separately").
  - **Landlock's network rights (ABI 4) could confine it to the route's port,** once D-4 names one.

## 10. Tests, by file (held, written with the code; each states its expected result first)

Every process these tests signal is one they started themselves. None attempts pid reuse or touches a hosted or unrelated process.

- **`apps/execution-host/reply/test_reply_launch.py`** (new, `unittest`, like `test_owned_exec.py`). With a stand-in for `--node`:
  - exactly fds 0–3 survive the `exec`, with the right types;
  - a wrong parent, for the launcher and for the child, gives 119;
  - a leftover home gives 71, with nothing written;
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
    - **the launcher dying after the fork, before the child's entry, and after a partial entry:** the child exits 118 at the gate and never passes it, and the lease shows the intent alone. `check` gives `child_unrecorded` only once the launcher's entry is verified;
    - **the generation seal:** a launcher paused before `mkdir`, and one paused before its lease, each resumed after a `rename` of its root, exit 78, writing nothing after the seal;
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
  - an unrelated owned process of the same uid, named by a rewritten lease, survives: `unresolved`;
  - a matching one is killed through its `pidfd`;
  - one that exits between the check and the signal gives `ESRCH`, and nothing else is signalled;
  - neither ever deletes.
- **`tests/integration/supervisor.test.mjs`** (extended):
  - `sweepReplies` runs before each launch and after the stop;
  - **the seal (revision 5):** before each launch, every older `gen-*` root is renamed to `sealed-*`, and a fresh root created, while the run after `stop()` doesn't seal. A seal failure (a stubbed `rename` error) leaves the new generation's replies off, its older homes `unresolved`, and a goal still starting;
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
    - a settle never answered: after its bound, the receipt goes and that settle is never sent again.
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
    - `retire` by each row of §7's home table: absent (`home_absent`), empty (`home_empty`), the launcher's entry alone, both entries proven gone with a pre-`go` journal (`home_deleted`), an entry not yet proven after an unsettled exit (`failed`, `unsettled`, and **never `checked`**), other files with no lease (`unresolved`), a torn journal, a live matching lease (`child_live`), and a mismatched lease (`lease_mismatch`);
    - **a `stop` in each phase (revisions 4 and 5):** during the claim's resends, during the launcher's setup (before `ready`), during the go wait, after a refused or unconfirmed go (it joins that sequence and its `t0`), after `go`, and during the settles.
      - Each starts within `claimWaitMs + readyWaitMs + goWaitMs`.
      - `TERM` comes at `t0 + graceMs` and `KILL` at `t0 + killMs` (fake clocks).
      - Each ends by `t0 + killMs + exitWaitMs`, plus `settleWaitMs`.
      - **The answer by the classifier:** `checked` for a settled exit; `outcome_unknown` for exit 74, a signal exit, or an overrun;
    - `retire` waits for the bridge's own queued receipts for the attempt before the barrier;
    - `retire` with each condition withheld in turn;
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
    - `retire` gives `home_absent` or `home_empty`, or `home_deleted` once `check` proves the entries gone.
    - The stub provider's call log is unchanged.
  - **a replies-off or busy new bridge** answering a replayed `create` of a `running` request with `rejected`. With the table, nothing is released. In the control without it, the release the table prevents is observed on the stub API;
  - **CX-0145's crossing, carried through Q7 (revision 5).** Supervisor A's wrapper exits without `stop`, and its dsh (L1) stays alive, as CX-0145 observed. L1 is held by a test hook after the claim's `first` and before its launcher's `mkdir`. Supervisor B starts, seals A's root, and its bridge (L2) says hello and retires the attempt `home_absent`. Then L1 resumes:
    - its launcher exits 78, and no home appears in any root;
    - its go, or any receipt, gets `40001`;
    - the stub provider's log is unchanged;
    - no process outside the test's own is touched;
    - the old dsh is then stopped through the test's own control.
  - **The same crossing with L1's launcher held after `mkdir` and before its lease:** `retire` gives `home_empty` in the sealed root, and the resumed launcher exits 78 having written nothing;
  - **the classifier at every caller:** `stop` and `retire` after a launcher exit of 0, 69, 72, 73, 75, 76 or 77 (settled), and after 74 or a signal (unsettled). Only settled exits, or a `check` that exits 0, ever give `checked`;
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
    - no outbox row, command or reservation is created by any row;
    - the replayed `create`'s `outcome_unknown` receipt moves nothing;
    - **races:**
      - a claim, go, reserve, settle or receipt from the superseded instance after the hello gets `40001`;
      - one committed before the hello is the table's input;
      - `conversation_cancel` either before or after the hello leaves one terminal state;
  - **the acknowledgement's predicates (revision 5):**
    - each of §7's predicates withheld in turn;
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
7. **The claim's lease** as `bridgeInstanceId`, every new runtime route behind `runtime_lease`, and **hello's reply table as a chosen design** (§6, with its reasons; the core and ledger owners may keep or drop it). Also `retire` by home state and proof, the crossing table (§7), and **the acknowledgement's named predicates** (§7), for the core and ledger owners to bind.
7a. **The generation seal** (§5, §6), as the no-future-writer fence across bridge generations. It works without assuming any process is dead, and leaves the goal path and the rest of the supervisor unchanged.
8. **The launcher's bounded, cancellable waits** before the runtime starts, its one gate and fork intent, and its settlement rules (§5), applied by every caller (`stop`, `retire`, dispose, recovery):
   - the lease first;
   - the child's own `alarm`;
   - the no-`pidfd` settlement with no signal;
   - settled versus unsettled exits: 72, 73, 74 and 77, and the `alarm` as the last resort.

   Plus the bridge's named bounds (§6).
9. **The receipt mapping and order** (§6): `rejected` only where no call can have left; every claim refusal is `outcome_unknown`; settles before terminal receipts.
10. **§7's recovery table,** and `conversation_reconcile`'s proof source as the operator's separately authorized path, with no automatic release, retry or reset.

Once agreed, the plan's §5 order stands. Each step is its own pin, with a fail-before and the full gates, on the accepted base, after Q12's correction.
