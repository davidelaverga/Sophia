# CON-01 G2 Q7: who owns a reply child's relay (a proposal for the runtime owner's agreement)

**What this is.** CON-01's answer to the open Q7 in [G2_RUNTIME_PLAN](G2_RUNTIME_PLAN.md) §0 ("Which process owns a reply child's relay"), and to §2.1's "Required" descendant-settlement mechanism. Codex asked for it in CX-0139 and mission request 6116456625. It is **one recommended design for the runtime owner (WBC-02/SDD-01) to agree or correct, as an engineering matter, before any Phase B write.**

**What it is not:**
- Nothing here is written to any held file.
- No runtime, dsh, provider, credential or live effect was used. The only things run were L0 checks of Node and the kernel in CON's scratch (§9).
- It consumes Codex's CX-0140 copied-profile probe (Darwin only), as Codex asked, in §5, §6 and §9.
- It doesn't change option C, B-1's isolated home per reply, the one pinned harness, or the request's cumulative allowance (§8). It doesn't ask Davide anything.
- The source freeze, the Luis, core and ledger ACKs, and the exact accepted-A base still apply. So do Q6, Q8–Q12 and D-4.

**Read at** `7d8f415f`. For `apps/execution-host`, `packages/dsh-bundle`, `scripts`, `config`, `renderers`, `tests/integration` and `tests/support`:
- `7d8f415f` is byte-identical to the plan's `f36a8fa0`, so the plan's line numbers hold.
- `main` `e0200f1a` differs only in `scripts/paperclip-*.mjs`.

Abbreviations:
- `supervisor:` is `apps/execution-host/src/runtime-supervisor.ts`;
- `bridge:` is `packages/dsh-bundle/src/control-bridge.ts`;
- `index:` is `packages/dsh-bundle/src/index.ts`;
- `transport:` is `packages/dsh-bundle/src/transport.ts`.

Pinned-package references are to the runtime artifact that `7d8f415f`'s build reproduces, `.artifacts/runtime/node_modules/.pnpm/…` (dsh `0.2.0-rc.2`).

## 1. The choice: (c), the bridge spawns through a launcher the supervisor owns

**The facts that decide it, at `7d8f415f`:**
- **The supervisor** builds one environment for the project's dsh process: supervisor:131-155. It holds the bridge URL and token (:151-152), with `extraEnv` spread last (:153). It spawns that one process with `stdio: ['ignore','pipe','pipe']` (:183), and keeps no channel to it beyond those two output pipes.
- **The bridge runs inside that dsh process.** `apply` builds it with the service binding and the journal directory (index:240-262, the service at :253, the journal at :255).
  - It owns the one `ServiceTransport`, whose `bridgeInstanceId` is the bridge's random `instanceId` (bridge:154, :170-172).
  - It is the only poller of runtime commands (bridge:358-376).
  - It serializes each attempt's commands (bridge:651-672) and answers them (bridge:694-732).
  - Its model-call accounting is an in-process `llm/stream` hook (bridge:295-306; `metered` :467-533, `meteredDesign` :543-586).
- **So a reply `create` arrives in the bridge, in the project's dsh process.** And a child's fd 3 is held by whichever process spawned the child: the other end of the socket is in that process.

**(c) is chosen: the bridge spawns the reply child itself, through a launcher the supervisor owns and names.** The bridge then holds all of these in one process, the same one that already holds the transport and the receipts:
- the claim;
- the child's process handle;
- fd 3's other end;
- the relay;
- every transport call: claim, reserve, settle, observations, acknowledged;
- the epoch.

The supervisor owns the code and the paths it hands the bridge at launch: the launcher, the reply root, the reply profile and its digest. It also runs the restart sweep. The child's relay belongs to the bridge **because the bridge is the spawning process**.

**(a), the supervisor relays, is not chosen.**
- The `create`, and its prompt, arrive in the bridge. The supervisor would need a new bridge-to-supervisor channel carrying the prompt. That is a second copy of the prompt in a second parent, where the binding allows one pipe (§8.5, "The parent retains no content").
- It would need its own transport with the same token: two `bridgeInstanceId`s for one unit. The claim's lease would name the supervisor while the receipts come from the bridge.
- The eighth barrier condition (the relay `closed`) would sit in the supervisor while `retire` is answered by the bridge. The barrier would then span two processes.
- The supervisor has no transport, poll, journal or accounting today. (a) builds a second control plane.

**(b), the descriptor passed to the bridge, is not chosen.**
- The supervisor and the dsh process share no Unix socket today (supervisor:183). Node's only public API for passing a socket to another running process is a child-process IPC channel (`subprocess.send(message, socket)`). That would mean adding an `'ipc'` slot to the project's dsh process, and `process.send`/`'message'` are visible to every plugin in it.
- The supervisor would still have spawned the child, so its exit and its signals would sit in one process and its fd 3 in another.
- The bridge would still need a channel to ask for each child.

## 2. Who owns what

```
execution-host supervisor (Node)        the launcher path, the reply root, the reply profile and digest, the sweep
└─ the project's dsh (Node; the bridge)    the claim, the ReplyChild handle, fd 3's parent end, the relay, the transport
   └─ the reply child: reply-launch.py run ──execve──▶ dsh --profile sophia-reply (Node), the same pid
```

| Owner | Owns | Never holds |
|---|---|---|
| Supervisor (held) | `SupervisorOptions.replies`; the `SOPHIA_REPLY_*` environment it gives the bridge; `sweepReplies()`; the reply profile's install and digest (`scripts/runtime-host.mjs`, `scripts/lib/profile.mjs`) | A reply's prompt, fd 3, any reply output. Its `this.output` stays the goal path's (supervisor:209-215) |
| The launcher, `apps/execution-host/reply/reply-launch.py` (new, held; supervisor-owned code in the runtime image) | The home's creation, the lease file, the profile copy and check, containment, the `exec`; `sweep` and `check` by `pidfd` | Content. It reads no prompt and writes none |
| The bridge (held) | `ReplyChildren`; each `ReplyChild` (its `ChildProcess`) and `ReplyRelay` (fd 3); the claim, reserve, settle, observation and acknowledged calls; the reply's receipts | The child's service credential: the child has none (§4) |
| The reply child (the same pinned dsh, the reply profile) | One agent, `sophia-<attemptId>`, with no tools; the projection; its journal in its home | `SOPHIA_BRIDGE_URL`, `SOPHIA_BRIDGE_TOKEN`, any path outside its home |

**One process per reply.** The launcher `execve`s dsh in place, with no fork, so the pid the bridge spawned is the reply's dsh. The bridge's `ChildProcess` is the identity-bound handle: Node signals through it only while the child is unreaped. Its exit callback closes the handle when libuv reaps it, after which `kill()` sends nothing and returns `false` (L0, §9).

## 3. Descriptors, and who holds each end

**The bridge spawns:**
```
spawn(SOPHIA_REPLY_PYTHON, ['-I', launcher, 'run', …], { stdio: ['ignore','ignore','ignore','pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, cwd: '/' })
```
Once D-4 binds a route, the launcher's environment also gets that route's credential variable, by name, from the project's dsh environment (supervisor:137-140), and nothing else.

**Exactly four descriptors at the reply dsh's `exec`:**

| fd | What | Opened by | The other end |
|---|---|---|---|
| 0 | `/dev/null`, read | Node's `'ignore'` | — |
| 1 | `diag/stdout`, `O_WRONLY\|O_CREAT\|O_EXCL\|O_NOFOLLOW`, 0600 | the launcher, after it creates the home | — |
| 2 | `diag/stderr`, the same | the launcher | — |
| 3 | an `AF_UNIX` `SOCK_STREAM` socket, duplex (libuv makes `'pipe'` as a socketpair) | Node's `'pipe'` | the bridge: `child.stdio[3]`, owned by the reply's `ReplyRelay` |

- **Until the launcher replaces them,** fds 1 and 2 are `/dev/null`, so nothing it or dsh prints reaches the bridge or the supervisor.
- **The launcher checks fd 3** with `getsockopt` (`SO_DOMAIN` `AF_UNIX`, `SO_TYPE` `SOCK_STREAM`), and closes everything from 4 up before `exec`, as `landlock-launch.py:195` does from 3.
- **fd 3's lifetimes:**
  - **The child's end:** the reply row opens it once, as `net.Socket({ fd: 3 })`. It closes when the child exits.
  - **The parent's end:** the relay keeps it open after the child's exit and reads the tail to end-of-file. It is destroyed only when the relay is `closed` (§7), or when the bridge is disposed.
  - **Each side treats the other's end-of-file as "my peer is gone".** The child exits on it (the binding's "exits when its control pipe closes"). The parent classifies the relay on it.

**An amendment to BINDING_MAP §8.5, for the owner to agree:**
- **What §8.5 says:** the four were "the prompt pipe (read), fd 3, stdout, stderr", with the prompt on stdin.
- **Here:** fd 0 is `/dev/null`, as on the goal path (supervisor:183), and the prompt is the first parent-to-child line on fd 3. The count stays four.
- **Why:**
  - **A parent-to-child channel is needed anyway** for the reply's own accounting (§4). One ordered stream carries the prompt, the answers and the stop.
  - **No process creation at all** (§5) means no extra descriptor and no stdin reader.
  - **Every `--profile` boot loads `dsh-cmdline`** (`provideCmdline`, dsh `lib/profile-boot-BZ2ZjNWi.js:276`), which builds `process.stdin` at import (`dsh-cmdline` `lib/index.js:35`). Only the stdio apps `dsh-acp-app` and `dsh-sdk-app` tie their exit to stdin's end (`exitOnStdinEnd`, :50-72), and neither is in the runtime profile. With fd 0 `/dev/null`, the prompt never sits in a stream that any plugin can reach as `process.stdin`.

## 4. fd 3: the line contract

**Framing.** Both directions carry UTF-8 JSON objects, one per line, each with a type `t`, and `additionalProperties: false` at every level.
- **Child to parent:** each line is bounded at **1 MiB, incrementally, before any parse** (§8.5).
- **Parent to child:** the `start` line is bounded at 2 MiB, which covers a prompt at the wire's 200,000-character `maxLength` at 6 bytes per character. Every other parent-to-child line is bounded at 4 KiB.
- **Either side, on a line that breaks its bound or schema, stops reading.** The parent then fences (`relay_invalid`); the child exits.

| Direction | `t` | Fields | When |
|---|---|---|---|
| parent → child | `start` | `attemptId`, `sessionId` (= `sophia-<attemptId>`), `epoch`, `nonce`, `route` `{provider, model, reasoningEffort}`, `maxTokens`, `prompt` | Exactly once, first |
| parent → child | `reserved` / `refused` | `n`, and `code` when refused | The answer to the child's `reserve` `n` |
| parent → child | `settled` / `settle_unknown` | `n` | The answer to `settle` `n` |
| parent → child | `stop` | — | Withdrawal, the deadline, a fence |
| child → parent | `status` | `s`: `ready`, or `failed` with a fixed `code` | `ready` once the agent exists and before its first step. `failed` (`containment_unavailable`, `profile_mismatch`, `home_exists`) only from the launcher before `exec`, which then exits. `child_exited`, `timeout` and `runtime_busy` are the parent's own codes, never a line |
| child → parent | `obs` | the reply-only projection, exactly §8.5's table (five types), in `RuntimeObservation`'s envelope | After the child has journaled it |
| child → parent | `reserve` | `n` (1, 2, …), `tokens`, `priceMicros` | Before each model call; the call waits for the answer |
| child → parent | `settle` | `n`, `outcome` (`settled` or `uncertain`), `used` `{calls, tokens, priceMicros}`, `usage` | After the call ends, success or not |

**Rules the parent enforces:**
- **`n` must be the next ordinal.** S2's ledger allows ordinals 1 and 2, in order and never reused (`db/candidates/con01-s2-conversation-reply-ledger.sql:272-296`). A third is answered `refused` `invalid_ordinal`, and the call doesn't leave.
- **The parent builds each reserve body itself:** the reply's request id, the ordinal, and the route, credential reference and owner-resource reference from its own claimed `create`. From the child it takes only the amounts. Then it calls `conversationReserve`.
- **Both the reserve and the settle are resent under the same ordinal until answered,** within a bound. This is `boundedAccounts`' existing pattern (`packages/dsh-bundle/src/review-tools.ts:159-173`, used for designs at bridge:551-554).
  - A reserve with no answer refuses the call.
  - A settle with no answer leaves the reservation open. The child's journal holds the settle, and recovery resends it (§7).

**Order is the safety.** Every line rides one stream, in order.
- **A held observation also holds the `reserve` behind it.** While delivery is blocked, no new model call can leave; the reply's deadline still runs.
- **The answer to a `reserve` is written only after the API answered.**

**The child has no service credential.** Its environment never has `SOPHIA_BRIDGE_URL` or `SOPHIA_BRIDGE_TOKEN`. It reaches the service only through these lines, so a reply child can't call any runtime route.

## 5. The launcher, and settling descendants

**`reply-launch.py run`**, its argv: `--root <root>/replies`, `--attempt <id>`, `--parent <bridge pid>`, `--nonce <hex>`, `--node`, `--entry` (`unit.runtimeDir` + `unit.launcherEntry`), `--profile-dir`, `--profile-digest`, `--profile-name`, `--unit <runtimeUnitId>`. Its steps, in order:

1. **The parent binding:** `prctl(PR_SET_PDEATHSIG, SIGKILL)`, then `getppid() == --parent`, or exit 119. This is `owned-exec.py:13-16` exactly. Node spawns from its loop thread, which lives as long as the process.
2. **fd 3:** it must be `AF_UNIX`/`SOCK_STREAM`, or exit 64.
3. **The home:** `<root>` must be a directory owned by the effective uid, mode 0700, and not a link. Then `mkdir(<root>/<attemptId>, 0700)`, which may not already exist: `EEXIST` is the leftover case, `home_exists`, exit 71. Then `home/`, `home/tmp/`, `dsh-home/profiles/`, `work/` and `diag/`, each 0700.
4. **fds 1 and 2** are opened onto `diag/stdout` and `diag/stderr` and `dup2`'d into place.
5. **The lease,** `lease.json`, created with `O_EXCL`, with the file and its directory fsynced. It records §8.5's five fields: the pid (its own, which is dsh's after the `exec`); `/proc/self/stat` field 22; the boot id; the executable (the realpath of `--node`, what `/proc/<pid>/exe` names after the `exec`); and the nonce.
6. **The profile:** it is copied from `--profile-dir` (read-only) into `dsh-home/profiles/<name>`. A symlink or special file is refused. The copy's `sophia-tree-v2` digest must equal `--profile-digest` (the scheme is `config/runtime-unit.json:32`), else `profile_mismatch`, exit 70. CX-0140 saw a copy of a pristine offline install show no drift and boot offline, on Darwin only (§9). Linux, and the reply profile, are P1 and P7.
7. **Containment:**
   - `RLIMIT_CORE` 0 (`landlock-launch.py:99`).
   - **Landlock:** ABI ≥ 4 (:96-98), and every filesystem right that ABI defines is handled. Read and write beneath `<root>/<attemptId>`. Read and execute on the runtime directory, the pinned Node, and the system libraries and certificates (`/usr/lib`, `/lib*`, `/etc/ld.so.cache`, `/etc/ssl`, `/etc/resolv.conf`, `/etc/hosts`, `/etc/nsswitch.conf`), plus `/proc/self`, `/dev/null` and `/dev/urandom`. Nothing else; P7's trace fixes the exact read list. Then `no_new_privs` (:139) and `restrict_self` (:141).
   - **The self-test:** creating a file in `<root>`, outside the home, must fail.
   - **The seccomp filter** described below.
   - **Any failure is `containment_unavailable`, exit 69.**
8. **`closerange(4, …)`,** `chdir(work/)`, and `execve(--node, [node, entry, '--profile', name], env)`. `env` is built here from nothing:
   - `HOME`, `TMPDIR` and `DSH_HOME` under the home, and `SOPHIA_WORKSPACE` its `work/`;
   - `DSH_TELEMETRY_DISABLED=1`, `LANG=C.UTF-8`, `PATH=/usr/bin:/bin`;
   - `SOPHIA_RUNTIME_UNIT`, `SOPHIA_REPLY_FD=3`, `SOPHIA_REPLY_NONCE`;
   - the reply route's credential, copied by its one name from the launcher's own environment, once D-4 binds one (none today).

   No other name passes, so `extraEnv` can't reach a reply child's `HOME`, `TMPDIR` or `DSH_HOME` (the plan's §2.1, item 3).

**Before `exec`, each failure writes one `status` `failed` line, if fd 3 is writable, and exits with its code. After `exec`, the exit status is dsh's.**

**`reply-launch.py sweep --root <root>/replies`** (the supervisor's) and **`check --root … --attempt …`** (the bridge's, for `retire` when it holds no handle). For each home with a lease:
1. `pidfd_open(pid)`. `ESRCH` means `gone`.
2. Verify the five fields from `/proc/<pid>`.
3. Signal 0 through the `pidfd`.
4. Only then, for `sweep`, `pidfd_send_signal(SIGKILL)`, and wait until the `pidfd` is readable.

**A mismatch signals nothing, and the home is `unresolved`.** A home with no lease means the launcher died before step 5, so no dsh ran. Its report is `no_lease`.

The report is content-free JSON lines: `{attemptId, state: gone|stopped|unresolved|no_lease}`. `check` exits 0 only for `gone` or `no_lease`. The sweep and the check **never delete**: only `retire` does (§7).

**`reply-launch.py probe`** checks whether containment can work at all, once at host start: the ABI, `seccomp`, the architecture, `pidfd_open`, and the self-test, in a short-lived child. Its exit status is the verdict.

### Descendants: none can exist, so there are none to settle

**The chosen mechanism.** The launcher's seccomp filter, installed before `exec`, **denies process creation:**
- `fork` and `vfork`: `EPERM`;
- `clone` without `CLONE_THREAD`: `EPERM`;
- `clone3`: `ENOSYS`, so the C library falls back to `clone`, whose flags a filter can read.

It is x86_64 only, and refuses x32 and every other architecture (the renderer's arch prologue, `landlock-launch.py:179-186`). An arm64 host, which the runtime unit also pins a Node for (`config/runtime-unit.json:49`), is therefore `containment_unavailable` until the owner names its filter. So is Darwin, where CX-0140 ran: it has neither Landlock nor this filter. The deploy host is the Linux execution VM.

**The reply's dsh can start no process, so "every descendant a reply child started" is the empty set by construction.** Settling the reply is settling one process, through the handle its own parent holds:
- `SIGTERM` and then `SIGKILL` through the bridge's handle;
- `PDEATHSIG` when the bridge's process dies;
- the end-of-file on fd 3.

No PID namespace, numeric signal, process group or uid-wide selection is involved. This answers §2.1's "Required" item and CX-0116.

**What it rests on:**
- **L0 (§9):** on Node 24.21.0, the pinned Node (`config/runtime-unit.json:45-46`), with glibc 2.39, under exactly this filter, threads, a `worker_threads` worker, DNS, file I/O and an HTTP `fetch` all work. `spawnSync` and `execFile` fail `EPERM`.
- **The static scan:** in the pinned set, the packages that import `child_process` are:
  - `dsh-subprocess-local` and `dsh-sandbox-local`, which the runtime profile loads for tools (`config/dsh/base-rows.reviewed.json:147-154`);
  - `node-addon-system`'s `landlock-run` entry (`lib/index.js:16`, :90). Session persistence imports only its `flock` entry, which has no `child_process`;
  - `dsh-native-command`, `dsh-host-open-in-app`, `dsh-host-directory-picker-native`, `dsh-web-app` and `libreoffice-kit`.

  A no-tools reply profile needs none of them. Whether dsh boots and answers without them is probe **P7** (§9).
- **If P7 shows the pinned dsh must create a process for a reply,** that is a demonstrated incompatibility. It is reported with its exact call site, and the choice of another mechanism goes back to the owner. Nothing falls back silently.

**Not chosen:**
- **A PID namespace whose init is held by a `pidfd`.** It needs user and PID namespaces that an unprivileged process can create. The renderer's pattern requires root (`namespace-launch.py:7-8`, `unshare` at :60). The execution host runs on a Docker VM (`docs/pack/ops/DEPLOYMENT_BINDINGS.md:7`), whose policy on namespaces is not established. It would also need a resident launcher process.
- **A subreaper launcher** (`PR_SET_CHILD_SUBREAPER`). It also needs a resident process, and its kill-and-reap loop has no stated bound against a process that keeps forking.

## 6. The bridge, the supervisor and the transport: exact changes (all held)

**Supervisor** (`runtime-supervisor.ts`):
- **`SupervisorOptions.replies?`:**
  ```
  { launcher, python, profileDir, profileName, profileDigest, maxChildren = 2, deadlineMs = 120_000 }
  ```
  When it is absent, nothing below runs and no `SOPHIA_REPLY_*` name is set.
- **`environment()`** adds, **after** `...extraEnv`, so a test's `extraEnv` can't redirect them:
  - `SOPHIA_REPLY_ROOT` = `<projectRoot>/replies`, created 0700 there as `home` and `work` are (supervisor:135);
  - `SOPHIA_REPLY_LAUNCHER`, `SOPHIA_REPLY_PYTHON`, `SOPHIA_REPLY_NODE` = `process.execPath`;
  - `SOPHIA_REPLY_ENTRY` = `join(unit.runtimeDir, unit.launcherEntry)`;
  - `SOPHIA_REPLY_PROFILE_DIR`, `SOPHIA_REPLY_PROFILE`, `SOPHIA_REPLY_PROFILE_DIGEST`.

  These are paths and a digest: no secret and no content.
- **`sweepReplies()`** is new and private. It runs `spawnSync(python, ['-I', launcher, 'probe'])`, then `sweep`, each bounded.
  - It runs before `launch('starting')` in `start()`, before `launch('restarting')` in `recover()`, and after the exit in `stop()`.
  - A failed probe or sweep is logged as a fixed token. That generation's environment then omits the `SOPHIA_REPLY_*` names, so the bridge answers reply creates `rejected` (`containment_unavailable`) before any claim. **Goals are unaffected.**
- **`launch()`, `recover()` and `stop()`** are otherwise unchanged. The goal path's spawn, collector, restart budget and lease are byte-identical.
- **`scripts/runtime-host.mjs` and `scripts/lib/profile.mjs`:** at host start, the reply profile (`config/dsh/reply-rows.reviewed.json`, new, Q8) is installed once, offline and frozen, into a read-only `profileDir`, and its tree digest is recorded. Whether a copy of it boots is P1 (the plan's §4.1).

**Bridge** (`index.ts`, `control-bridge.ts`; new `reply-child.ts`):
- **`BridgeSettings.replies: ReplySettings | null`,** read in `apply` (index:240-262) from the `SOPHIA_REPLY_*` names, plus `graceMs` 2,000 and `killMs` 5,000 (§8.5, step 2). It is `null` when any name is missing.
- **`dispatch`** (bridge:651-672) is unchanged. Its `parseCommand` accepts a reply binding and `retire` once the wire does (`KINDS`, `protocol.ts:28`; the wire and contracts are held).
- **`execute`** (bridge:694) gains one branch, after the unit and id checks (:697-700) and before the duplicate, epoch and `switch` (:702-727): a binding with `conversationReplyId` goes to `this.replies.execute(command)`. Reply attempts never enter `attempts` or `bySession` (bridge:144-150), so the goal path's hooks, guard and `metered` never see them.

  | Kind | `ReplyChildren` method | What it does |
  |---|---|---|
  | `create` | `createReply` | **1. Redelivery:** a command this instance already holds is answered from its recorded receipts (as bridge:703-704), with no claim call. **2. Before the claim, `rejected`:** validation fails, `replies` is `null` (`containment_unavailable`), or 2 children are live (`runtime_busy`). **3. The claim:** `conversationClaim({attemptId, commandId, authorityEpoch, leaseId: instanceId})`, resent until answered within a bound. Only `first` goes on. `refused` (any code), or no answer, is answered **`outcome_unknown`** and spawns nothing. **4. Spawn** (§3), and the `start` line written. **5. `ready`:** answered `delivered`; the command, and with it the prompt, is released |
  | `stop` | `stopReply` | Fence the relay, then the `stop` line; `SIGTERM` at `graceMs`, `SIGKILL` at `killMs`, through its own handle; wait for the exit. `checked` once it has exited, or when there is no live child (as bridge:1175-1177). `outcome_unknown` if it hasn't exited within a bound |
  | `retire` | `retireReply` | §7's order; `checked`, or `failed` with a fixed code |
  | `inspect` | `inspectReply` | A content-free state: the child, the relay, counts and bytes, the ordinals |
  | `resume`, `input`, `steer`, `hold` | — | `rejected`: a reply takes only these four |

- **The receipt stages for a reply `create`,** matching §8.2.1's table:
  - **`rejected`** only where no model call can have left: before the claim (step 2); after `first`, for a launcher failure before `exec` (exit 64, 69 or 70); or for a child that ended before `ready` with no ordinal reserved.
  - **`outcome_unknown`** for any claim refusal or lost answer, and for `home_exists`. These never release anything (§7).
  - **`failed` after `delivered`,** with a fixed reason: `timeout`, `relay_invalid`, or `child_exited` (an end-of-file without a completed `turn/end`). A completed turn ends through capture, not through a receipt.
- **`connect`** (bridge:319-350) hands each reply binding in the hello to `reconcileReply`, not `reconcile` (bridge:1251).
- **`start()`'s disposer** (bridge:309-316) also calls `replies.dispose()`: it fences every relay, sends `stop`, and `SIGTERM`s each child. Nothing is receipted from there. `PDEATHSIG` covers the bridge's abrupt death, and the next hello the rest.

**`reply-child.ts`** (new):
- **`ReplyChildren`:** a map by `attemptId`, the cap, `execute`, `reconcileReply`, `dispose`.
- **`ReplyChild`:**
  - the `ChildProcess`;
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
- **`ReplyRelay.fromJournal`:** the recovery relay. It is `fenced` from the start and fed from the home's journal instead of fd 3.

**The child** (new `packages/dsh-bundle/src/reply-plugin.ts`; row `sophia-reply-child` in the reply profile; the same bundle, so its archive and digest change, Q8):
1. Open fd 3 and wait for `start`. Check that its `attemptId` and `nonce` match `SOPHIA_REPLY_NONCE`.
2. Journal the command (contained). Create the one agent `sophia-<attemptId>` with no tools, on the route `start` names, which must be the profile's single allowed route. Write `ready` and submit the prompt.
3. **An `llm/stream` hook** (global, prepended, as bridge:295-306) sends `reserve` and awaits the answer. It refuses the call on `refused`, or when no answer comes before the deadline. It sends `settle` in a `finally`. Each reserve answer and settle body is journaled before the line is written.
4. **A `session/event` observer** projects each event (§8.5's five types) and journals it: the file fsynced, and the directory fsynced at creation. It then writes the `obs` line, awaiting `drain` before the next.
5. **Exit:**
   - **After a `turn/end`,** once its last line is written, it exits 0.
   - **On `stop` or end-of-file,** it cancels the agent and exits. dsh's own `SIGTERM` path also exits 0 (`interrupt(0)`, dsh `lib/profile-boot-BZ2ZjNWi.js:249-250`). CX-0140 saw status 0 after its bounded stop, on Darwin. That is why `draining` requires the completed `turn/end` read, not exit 0 alone (§8.5).

**Transport** (`transport.ts`, and their routes, held):
- **`conversationClaim(body, signal)`:** `POST /v1/runtime/conversation/claim`. It answers `{result: 'first'}` or `{result: 'refused', code: 'already_claimed' | 'not_pending' | 'stale_epoch'}`.
- **`conversationReserve(body, signal)`** and **`conversationSettle(body, signal)`:** `/reserve` and `/settle`, the S2 ledger's `conversation_reserve` and `conversation_settle` (`db/candidates/con01-s2-conversation-reply-ledger.sql:275`, `:349`).
- **`conversationAcknowledged(body, signal)`:** `/acknowledged`. It takes keys and states only, and answers §8.5's seven conditions.
- **`observations(batch, signal?)`:** the signal is new and optional. The goal path passes none, so it is unchanged.

**The API and 0049** (held; the core and ledger owners' part):
- **The claim's `lease_id` is the bridge's `instanceId`.**
- **`runtime_hello`'s reply branch** ends a `running` reply request `outcome_unknown` when its claim's lease isn't the hello's `bridgeInstanceId`, with its open reservations `uncertain` (`conversation_mark_uncertain`, the S2 candidate's :379), and lists its binding `stopped`. **This is new in this proposal.** It is how a restart's "a request that was `running` ends `outcome_unknown`" (§8.5) gets its writer: the bridge that ran it is gone, and with it the child, through `PDEATHSIG`.

## 7. Correlation, the uncertain dispatch, and settlement before cleanup

**The durable chain, one key per hop.** Nothing in it is content except the prompt, and that only in `runtime_commands.body` until it is scrubbed.

| Hop | Durable record | Key |
|---|---|---|
| Request | `conversation_requests` | `requestId` |
| Native attempt (option C) | `work_attempts`, `conversation_reply_id` = request, `goal_id` NULL | `attemptId` |
| Outbox | one row per request | `outbox.id` |
| Runtime command | `UNIQUE(project, outbox_id)`, 0012:77 | `commandId`, `authorityEpoch` |
| **The claim** | `conversation_executions(attempt_id PK, command_id, lease_id, claimed_at, outcome)` | `attemptId`; lease = `bridgeInstanceId` |
| Spawn | `<root>/replies/<attemptId>/`, and its lease file | `attemptId`, `nonce` |
| Session | the child's agent | `sophia-<attemptId>`, as bridge:829-833 |
| Observation | `UNIQUE(project, binding, upstream_key)`, 0001:125 | `unit:sophia-<attemptId>:seq` (0023:33) |
| Usage | `UNIQUE(project, attempt, provider_call_id)`, 0012:19-20 | `sophia-<attemptId>#seq` (0023:42) |
| Reservation | `conversation_reservations` | `(reply, ordinal 1–2)` |
| Receipt | `(project, command, stage)`, 0012:93 | `commandId`, `stage` |

**The uncertain dispatch** (the plan's §2.4, unchanged by Q7):
- **Only an outbox row with no runtime command is re-dispatched** (`reconcile_runtime_outbox`, 0012:782-797, with Q12's owner correction: Phase A, #256, not merged). Its `create` is the first to reach the claim.
- **A row with a command is never re-dispatched.**
- **A `create` that may have run** (any claim refusal, a lost claim answer, `home_exists`, or a restart) is `outcome_unknown`: nothing is spawned, and an open reservation becomes `uncertain`, still counted.
- **Why claim refusals are never `rejected`:** `rejected` would release a reservation an earlier, claimed execution might have used (§8.2.1).
- **No request is ever run twice, and asking again is a new request.** The cumulative allowance is the request's own, through `(reply, ordinal)`.

**Settled before cleanup, in this order:**
1. **The reply ends:** a completed `turn/end`; `stop`; the deadline; or the child's exit or death.
2. **Stop and reap** (`stopReply`, or the child's own exit). The relay reads fd 3 to end-of-file, under its bound, schema, admission and backpressure. Nothing is cleaned while the child lives.
3. **Delivery.** A `draining` relay sends its items with their text. A `fenced` one sends them reduced. Every item is acknowledged. Pending settles are resent, within their bound, under the same ordinal. One still unanswered leaves its reservation open, so the barrier stays shut and the home stays, said pending.
   - **The relay is `closed`** at end-of-file, with no item held, every item acknowledged, and fd 3's parent end destroyed.
4. **`retireReply`, in this order:**
   1. no live `ReplyChild`, or, with no handle, `check` exits 0;
   2. the relay is `closed`;
   3. the journal's keys and ordinals are read from the home, under the same bound and schema;
   4. `conversationAcknowledged` confirms all seven conditions;
   5. `<root>/replies/<attemptId>` is not a link;
   6. delete it without following links, and verify it is gone (`lstat` `ENOENT`);
   7. drop the `ReplyChildren` entry;
   8. answer `checked`.

   Anything missing is `failed` with a fixed code (`child_live`, `relay_open`, `barrier:<condition>`, `lease_mismatch`, `delete_failed`). The home stays, said pending, and is retried at the next hello (§8.5, step 5).

**After a restart** (`reconcileReply`):
- The supervisor's sweep ran before this dsh started. With `PDEATHSIG`, no reply child of the old bridge is alive, and `check` confirms it per home.
- Hello lists each reply binding `stopped` (§6's lease rule).
- For a home that exists, `ReplyRelay.fromJournal`:
  - asks `/acknowledged` which keys are recorded;
  - sends the missing ones reduced, with their usage;
  - resends the journaled settles that aren't settled;
  - closes.
- Nothing is re-run, and a recovered observation never publishes (§8.2.2).

**Withdrawal:**
1. `conversation_cancel` raises the epoch to 2 and writes `stop`.
2. `stopReply` fences the relay first. Queued items are reduced in place, and later lines are reduced at parse. Then the `stop` line, `SIGTERM`, `SIGKILL` and the exit.
3. `stop` is answered `checked`. An open reservation becomes `uncertain`.
4. `retire` runs behind the barrier.

A late line, live or recovered, is stored scrubbed with its usage. A later `create` for the attempt meets the claim's refusal and spawns nothing.

## 8. What is preserved

- **Option C:** one native attempt per request, and the reply binding as A04's `oneOf`, as the plan's §2.2 has it.
- **B-1's isolated home per reply:** every writable path is under `<root>/replies/<attemptId>/`, enforced by Landlock with a self-test. The environment is set once, at `exec`, and no process-global home changes. The parent's and the supervisor's environments never change.
- **One pinned harness:**
  - the same dsh `0.2.0-rc.2`, through the same `unit.launcherEntry`;
  - the same Node (`process.execPath`), the same bundle, and a reviewed reply profile.

  The launcher is the binding's own new launcher (§8.5, "part of the shared-file request"). It isn't a runtime: it `exec`s dsh in place.
- **The cumulative allowance:** reservations are keyed by request and ordinal. The claim fences every duplicate, and an uncertain execution stays counted.
- **§8.5's copy table:** every row stands, with two changes. The prompt crosses on fd 3 (the kernel socket buffer and Node's write buffer) rather than on a stdin pipe. And the child's journal also holds its content-free reserve and settle records.

## 9. Evidence, and what is not established

**L0, run in CON's owned scratch** (`…/scratchpad/q7/`, local only). Node 24.21.0, which is the pinned version; Python 3.13.16; glibc 2.39; Linux 6.18 in this session's container, not the deploy host. No dsh, no network beyond loopback, no credential. Static reads of the pinned artifact are cited where used (§3, §5).

| File | SHA-256 (first 16) | What it shows |
|---|---|---|
| `fd3-parent.mjs`, `fd3-child.py` | `cf26d1433d93cdd0`, `96be0ff2ad75be66` | Node's `'pipe'` at fd 3 is `AF_UNIX`/`SOCK_STREAM` in the child; the parent's end is a duplex `Socket` |
| `fd3-run.out` | `26314673f260b457` | Both directions carry lines, and the parent reads end-of-file at the child's exit |
| `fd3-node-parent.mjs`, `fd3-node-child.mjs` | `3907ed69697cf325`, `9b7281407b8c8e6c` | A Node child opens fd 3 as `net.Socket({fd: 3})`, answers a reserve, and exits on the parent's end-of-file |
| `fd3-node-run.out` | `80bc52444c13cd5a` | That run, and `child.kill('SIGKILL')` after the exit returning `false` |
| `noproc-exec.py`, `noproc-node.mjs`, `noproc-run.mjs` | `978d111723c7e06c`, `c7169f3709a5186c`, `3aad16b9b666a48c` | §5's filter, and the probe |
| `noproc-run.out` | `397e7cf2161e820c` | Filtered: `spawnSync` and `execFile` `EPERM`; a worker, DNS, the filesystem and `fetch` work. Unfiltered control: all run |

**One void run, not kept.** The probe's first run had a broken worker check: its eval body called a bare `postMessage`, which failed the same way filtered and unfiltered. The check was corrected to `parentPort.postMessage` and the whole probe re-run; `noproc-run.out` is that re-run.

**Not established**, each a probe on the pinned runtime with a loopback stub route, offline, labelled as such, or on the host. None has run as stated here; only P1 has partial evidence, from Codex:
- **P1–P6:** the plan's §4.1. **P1 has partial evidence, Darwin only:** Codex's CX-0140 ([`ebd87c1d`](https://github.com/davidelaverga/Sophia/blob/ebd87c1dd20212c5447db43eb6e32f211662a4dc/docs/coordination/CON-01/CX-0140.md), `CX-0140.md` SHA-256 `00fc4f0c385cc635`).
  - **The setup:** all network denied by `sandbox-exec`, no credentials, Node 24.21.0, and the existing artifact matching `7d8f`'s recorded Darwin runtime (tree-v2 `e24cb887…`, 28,427 entries) and bundle.
  - **What it saw:** a frozen offline install took 376 ms. A copy of that pristine install into a second empty home gave `profileDrift` `[]`. An 8-second bounded boot loaded the bridge, reported `not_ready` (no service binding), was never ready, printed no startup diagnostic, and ended with status 0 after the bounded stop.
  - **What it doesn't show,** in Codex's words: not "a useful reply, complete file-write/canary accounting, absence of other host copies, pidfd/namespace/Landlock, descendant settlement, crash/orphan recovery, withdrawal or durable delivery", nor Linux. It also used the runtime profile, not a reply profile.
- **P7:** dsh `0.2.0-rc.2` boots the reply profile from a copied profile under the launcher (Landlock, the filter, four fds, fd 3 opened by `sophia-reply-child`), and completes one stub reply. Every model call is reserved over fd 3, the journal is written before each emit, and no process is created. Plus `strace -f` of `fork`/`clone`/`execve` from boot to exit.
- **P8:** the deploy host's execution-host container. Landlock ABI ≥ 4 and `seccomp` are available to an unprivileged process there, under its runtime's own seccomp profile; `pidfd_open` works; it is x86_64; and the image has `python3` ≥ 3.9 (`os.pidfd_open`, `signal.pidfd_send_signal`). The image doesn't exist yet: `imageDigest` is null (`docs/pack/ops/deployment-units.json`, unit `execution_host`).
- **Not covered by Q7, and named so:** a reply child can still signal other processes of the same uid. Landlock's signal scoping is ABI 6; ABI 4 doesn't restrict it. Whether to deny `kill` and its relatives in the filter is the owner's call.

## 10. Tests, by file (held, written with the code; each states its expected result first)

- **`apps/execution-host/reply/test_reply_launch.py`** (new, `unittest`, like `test_owned_exec.py`). With a stand-in for `--node`:
  - exactly fds 0–3 at `exec`, with the right types;
  - a wrong parent gives 119;
  - a leftover home gives 71, with nothing written;
  - an ABI below 4 (the reader stubbed), or the self-test write succeeding, gives 69;
  - a profile digest mismatch gives 70;
  - the lease's five fields match `/proc`;
  - `diag/` receives fds 1 and 2;
  - the environment has exactly §5's names;
  - under the filter, `fork`, `vfork` and `clone` without `CLONE_THREAD` are `EPERM`, `clone3` is `ENOSYS`, and threads run;
  - no `core*` after an abort.

  **`sweep` and `check`:**
  - an unrelated process of the same uid, named by a rewritten lease, survives: `unresolved`;
  - a matching one is killed through its `pidfd`;
  - one that exits between the check and the signal gives `ESRCH`, and nothing else is signalled;
  - neither ever deletes.
- **`tests/integration/supervisor.test.mjs`** (extended):
  - `sweepReplies` runs before each launch and after the stop;
  - the `SOPHIA_REPLY_*` names are present, and `extraEnv` can't override them;
  - a failing probe leaves them out, and a goal still starts;
  - the goal path's spawn, environment and `log` are byte-identical.
- **`packages/dsh-bundle/test/reply-child.test.ts`** (new; a stub child speaking §4):
  - a 2 MiB line with no newline: the buffer never exceeds 1 MiB, nothing is parsed, `relay_invalid`;
  - a schema-invalid line;
  - admission at exactly 64 items and 4 MiB (the crossing item is held);
  - `pause`, then `resume`;
  - `draining` versus `fenced`, and a full queue at the exit (CX-0113);
  - `stop`'s timing, with fake timers;
  - the deadline;
  - a `reserve` held behind an observation;
  - a third ordinal refused;
  - a settle resent under the same ordinal;
  - a third `create` gives `runtime_busy` with no claim call;
  - the claim's `first`, each `refused` code, and a lost answer: spawn counts 1, 0, 0, and the stages `delivered`, `outcome_unknown`, `outcome_unknown`;
  - a redelivered `create` answered from memory, with no claim call;
  - `retire` with each condition withheld in turn;
  - goal attempts' observations and receipts byte-identical.
- **`packages/dsh-bundle/test/reply-plugin.test.ts`** (new):
  - the five projected types at their maxima;
  - 16,000 code points, with `oversize`, `invalidText` and empty;
  - journal-before-emit, with the file and directory fsynced (a spy);
  - a refused or unanswered reserve: no call;
  - exit on end-of-file and on `stop`.
- **`tests/integration/reply-runtime.test.mjs`** (new, L1: the real supervisor, bridge, launcher and pinned dsh; the stub provider; real PostgreSQL). §8.5's qualification table, row by row, plus:
  - the reply child's parent is the project's dsh;
  - its `/proc/<pid>/fd` at `exec`;
  - `SIGKILL` on the project's dsh: the reply child is gone within a bound (`PDEATHSIG`), and the next hello ends the request `outcome_unknown` by the lease rule;
  - no reply text in the supervisor's `log`.
- **`packages/persistence/src/runtime.db.test.ts`** (extended):
  - the claim's three refusals;
  - hello's lease rule: another instance's `running` request ends `outcome_unknown` with its reservations `uncertain`; the same instance's does not;
  - every goal case unchanged.

## 11. What the owner is asked to agree, before any Phase B write

1. **(c), as §1–§2:** the bridge spawns and owns the relay; the supervisor owns the launcher, the paths and the sweep. This amends §8.5's "asks the supervisor for a reply child" and "The supervisor holds each child's process handle": the bridge holds it, and the supervisor's part is the sweep.
2. **fd 3** as one duplex socket carrying the prompt and the accounting (§3–§4), with fd 0 `/dev/null`. This amends §8.5's four descriptors in name, not in count.
3. **No descendants by construction** (§5's filter) as the settlement mechanism, subject to P7 and P8. A failure of either comes back as a stated incompatibility, not a fallback.
4. **The exact names in §6:** the methods, transport calls, settings, launcher subcommands and exit codes.
5. **The claim's lease** as `bridgeInstanceId`, and hello's lease rule (§6, with the core and ledger owners).
6. **The receipt mapping** (§6): `rejected` only where no call can have left; every claim refusal is `outcome_unknown`.

Once agreed, the plan's §5 order stands. Each step is its own pin, with a fail-before and the full gates, on the accepted base, after Q12's correction.
