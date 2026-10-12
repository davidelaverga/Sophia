# CON-01 Q7 revision 6: the owned admission and life-lock L0 (CC-0174)

**What this is.** The exact files behind Q7 revision 6's §9 rows for `l0-admit.py` and `l0-admit.out`, and its void run. They are published byte for byte at Codex's CX-0151 request, as immutable review artifacts.
- **Nothing was re-run for this publication.** The files were copied unchanged from CON's session scratch.
- **The pin they support:** `09892924d7e743f8b8c96da4f6507f2457e4bdff`, `G2_Q7_RELAY_OWNERSHIP.md` revision 6 (SHA-256 `ff172950fc919ad88484d19ee6eca2c18f45fc8dc40838fea3b2200dde932531`).
- **This ref adds only this directory.** The Q7 document here is byte-identical to the pin, and the Q7 branch stays at the pin.

| File | Bytes | SHA-256 | What it is |
|---|---:|---|---|
| `l0-admit.py` | 20,069 | `14df746c7ee179f544cbb3c3d785fc7b49b59c5070aab98a133e12ac0071072e` | The probe, exactly as it was for the terminal run |
| `l0-admit.out` | 4,573 | `6785e9f643fc18a4ed3616d271dc23ad558425d9093b740cdb9ca88b89a0c475` | The terminal run's standard output |
| `l0-admit.void.out` | 4,079 | `2a829390bbcedcbded24613f825f00d2f0852776a175381149301bf9dd478dd9` | The first run's standard output. **Void**: see below |

Q7 revision 6 §9 cites the first 16 hex digits of each.

## How it was run

- **Where:** CON's own session scratch directory, in this session's cloud container. It is not the deploy host, the execution VM or any runtime.
- **The command,** from that directory: `timeout 150 python3 -I l0-admit.py > l0-admit.out`. It exited with status 0, and nothing appeared on standard error.
- **The environment:**
  - Python 3.13.16, isolated (`-I`);
  - glibc 2.39;
  - this container's Linux 6.18.44 kernel;
  - the scratch directory on ext4.

  No Node, dsh, network or credential was involved.
- **When, by file modification time (UTC, 2026-10-12):**
  - the void run's output: 04:28:21;
  - the probe's last edit: 04:29:01;
  - the terminal run's output: 04:29:06.

## What the probe is, and isn't

- **Its processes, all owned:**
  - **P** is the probe itself;
  - **L**, each launcher stand-in, is P's own fork;
  - **C**, each child stand-in, is L's fork.

  P makes itself a child subreaper (`PR_SET_CHILD_SUBREAPER`). So a C orphaned by L's death is reparented to P and reaped there.
- **What it tests:** synthetic mechanics only. That covers:
  - the admission lock (a shared `flock` on `.admit`, verified by name while held);
  - the seal as a `rename`, and the drain (a non-blocking exclusive `flock`);
  - the life lock (an exclusive `flock` on the lease, close-on-exec, inherited by the fork);
  - the unused pipe ends.

  P's `check` function implements revision 6's verdict rules for this probe only.
- **What it is not:**
  - the launcher (`reply-launch.py` doesn't exist);
  - dsh, Landlock or seccomp;
  - a real `check` or `retire`;
  - a host, P7 or P8.
- **No signal is sent by P.** The only signals are the stand-ins' own, delivered by the kernel:
  - C's `alarm`, which is `SIGALRM`, in B4;
  - C's `PDEATHSIG`, which is `SIGKILL`, in B1p and B6p.

  No pid is signalled by number, and no pid reuse is attempted.
- **Its files:** each case has its own fresh directory, under one temporary directory that P creates beside itself and removes at the end.

## The terminal run (`l0-admit.out`)

| Case | What it does | What it shows |
|---|---|---|
| A1 | The lease is opened (zero bytes, the life lock held), then the root is renamed; `check` runs, then L resumes | A fresh by-name open gets `ENOENT`; the drain fails (`admission_open`). Resumed, L's writes and `fsync` through its open descriptor land in the renamed root. Its directory `fsync` by name fails, and it exits 78. Then: drained, the lease whole, the life lock free, no child entry, so `gone`, deleted and verified |
| A2 | A torn launcher record, then the rename, then L crashes | `admission_open`, then `unresolved` (`torn_lease`); the home is kept |
| A3 | `.admit` is open but not yet locked when the root is renamed | The drain succeeds at once: `absent`. Resumed, the verification by name fails, exit 78; still `absent` |
| A4 | L starts after the rename | Exit 78; `absent` |
| A5 | L is admitted, before its `mkdir`, when the root is renamed | `admission_open`; resumed, exit 78; then `absent` |
| B1 | L crashes after the fork, before the child's entry (no `PDEATHSIG`) | C exits 118 at the gate's end-of-file, within 5 ms of L's reap. Then the life lock is free: `gone` |
| B2 | L writes a torn child entry, then crashes | The same as B1 |
| B4 | **The control:** C keeps its inherited gate write end | No end-of-file. C ends only by its own `alarm` (`SIGALRM`), 1.8 s after L's reap |
| B1p | B1 with `PDEATHSIG` armed | C ends by `SIGKILL`, within 5 ms of L's reap; then `gone` |
| B3 | L crashes before the child's entry, and C is deliberately held alive for 1.5 s | The life lock stays held (`unsettled`), the home is kept, and fd 3 has no end-of-file. Once C exits (117), fd 3 reaches end-of-file and the home is `gone` |
| B5 | A normal run | The life lock is held during the run. The executed image lists fds 0–4, where 4 is its own directory listing's descriptor (the same listing in a bare process shows 0–3), so not the lease. L exits 0; then `gone` |
| B6 | C executes its image, then L crashes (no `PDEATHSIG`) | The life lock is free, but the valid child entry reads `child_live` until the image exits (0); then `gone` |
| B6p | B6 with `PDEATHSIG` armed, which survives `execve` | The image is killed (`SIGKILL`), and it reads `child_live` until it is reaped; then `gone` |

## Cleanup

- **The terminal output's own `cleanup` block:** `scratch_removed: true` and `children_remaining: "none"`. P reaps until `ECHILD` before it removes its temporary directory.
- **P itself exited 0.** A process listing taken right afterwards matched only the listing command itself.
- **Nothing outside the scratch directory was written.**

The void run's `cleanup` block reads the same.

## The void run (`l0-admit.void.out`)

**It is counted as nothing.** It had two faults, both in the harness rather than the mechanism:
1. **L crashed right after the fork, before C reached its gate.** C then saw a changed parent and exited 119 at its parent check. So B1, B1p and B4 tested the parent check, not the gate, and B3's C was never held.
2. **C's descriptors collided.** The executed image found fd 3 closed (`EBADF`): in B5, L exited 75 and the image printed nothing. The cause, read from the code and not confirmed by a trace: the diagnostic file's descriptor was fd 3. So `dup2(fd3_child, 3)` replaced it, and the later `os.close(dg)` closed fd 3.

Also in the void run, B6 had `PDEATHSIG` armed, so its image was killed when L crashed. The terminal run keeps that case as B6p and adds B6 without it.

Its A cases, and B2, happen to match the terminal run's, but none of them is counted from it.

**The changes between the two runs, and nothing else.** The void run's script was not kept as a separate file, and its hash was not recorded. These are the exact edits that were applied to it:

1. **In C, before the `exec`.** Before:
   ```python
           os.dup2(fd3_child, 3)
           os.set_inheritable(3, True)
           os.dup2(dg, 1)
           os.set_inheritable(1, True)
           os.close(dg)
   ```
   After:
   ```python
           hi3 = fcntl.fcntl(fd3_child, fcntl.F_DUPFD_CLOEXEC, 20)  # avoid number collisions
           hi1 = fcntl.fcntl(dg, fcntl.F_DUPFD_CLOEXEC, 20)
           os.dup2(hi3, 3)
           os.dup2(hi1, 1)
           os.set_inheritable(3, True)
           os.set_inheritable(1, True)
           os.close(hi3)
           os.close(hi1)
   ```
2. **In L, after the fork.** One line was inserted between `os.close(dg)` and `crash('before_child_entry')`:
   ```python
       time.sleep(hooks.get('crash_delay', 0))  # test hook: let the child reach its gate first
   ```
3. **The hooks.** The hooks of B1, B2, B4, B1p and B3 each gained `'crash_delay': 0.2`.
4. **B6.** The void run's B6 had `PDEATHSIG` armed. Two things changed:
   - That case was renamed B6p, with its directory `b6p` and its keys `check_before_reap` and `check_after_reap`.
   - A new B6 was added: the same steps with `'no_pdeathsig': True`, which also reads fd 3. Its code is in `l0-admit.py`.

## Limits

- **L0, in owned scratch only.** It covers the mechanics of `flock`, `rename`, `fork`, `execve` and pipes, on this container's kernel and ext4.
- **Not tested here:**
  - the deploy host's filesystem and its `flock` (P8);
  - an in-flight `mkdir` across a rename, which this probe didn't force.
- **Not evidence of:** a launcher, a real `check` or `retire`, dsh, Landlock, seccomp, a provider, a runtime, deployment or any owner's acceptance.
- **Codex's CX-0148 filesystem probe** (Darwin) is Codex's own evidence. A1 repeats its premise on Linux, with the drain added.
