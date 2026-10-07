# Experimental Render qualification worker

This is a fixture-only candidate for the existing suspended
`sophia-renderer-qualification` worker (`srv-db3ab3psrm7s73b8gbbg`). It does not
register a runner, start the production supervisor, access production credentials,
or deploy the Sophia application. No production acceptance is claimed.

Build from the repository root with this Dockerfile:

```sh
docker build --platform linux/amd64 -f renderers/web/pdf/uml/Dockerfile .
```

The image builds Linux 6.12.101 from the hash-checked official archive, applies
`kernel-abi.patch`, and builds a minimal read-only ext4 guest from an explicit
runtime file list. The patch fixes UML's seccomp signal ABI: restore the original
syscall number and report the saved userspace instruction pointer. It removes no
seccomp rule or Chromium check. Kernel module loading is disabled at build time;
unused guest `io_uring` is disabled before running the browser.

UML is **not** the host security boundary. Before its kernel starts, the host
launcher drops to real UID/GID 10001, clears supplementary groups, creates fresh
user/network/PID namespaces, sets no-new-privileges, applies Landlock ABI 4 and an
inherited seccomp filter, and closes extra descriptors. Inputs are root-owned and
read-only; only the job scratch is writable. Landlock excludes the host's world
readable hostname, synthetic root marker, sibling control and supervisor environ.
Network socket creation, host mounts, module loading and `io_uring` are denied by
the host filter. Internal AF_UNIX socketpair and ptrace inside the owned namespace
remain available to UML. No host mount or `/dev/kvm` is required.

The guest calls the existing `confine.mjs` and `bin/confine-chromium` unchanged.
Its first diagnostic takes two screenshots and prints a PDF with the normal
30-second launch limit. It then runs the unchanged `probeHost` entry point,
including the actual PDF/capture kernels and normal 60-second width sweep. Its API
positive control and token are explicitly synthetic, inside the guest. Those
controls do **not** prove production API isolation. Actual host/API isolation,
whole-tree cancellation, memory bounds, output protocol validation and independent
review remain necessary before a production adapter can be accepted.

The worker starts idle. The operator invokes `python3 /opt/uml/host-qa.py` once
through the approved Render Shell. The host caps the owned child at 240 seconds and 8 MiB output, requires
all named fixture records, and reports failures as failures even when the VM
powers off with exit 0. It writes a latch before starting so another invocation in the same filesystem does not repeat the test, then
idles on success or failure for operator collection. The container start command
always idles; a Render restart never initiates another test.
All records keep `qualification:false`. Render can replace the filesystem on restart, so the latch is not a durable
provider ledger. Only one explicit test invocation is allowed by the batch; the
operator must suspend the worker at the approved deadline.

On Render, set only the non-secret `SOPHIA_UML_EXPECTED_SOURCE` to the exact approved
commit. The host rejects another Render service or a source mismatch. Keep auto
deploy off, use no environment groups, keys, disks, databases, provider calls or
runner registration, and obtain a fresh bounded paid test approval before resuming
the suspended worker. The previous one-hour allowance expired.

Local evidence on 2026-10-07: the stock UML kernel failed the ABI probe while ordinary
Linux passed. The repaired kernel passed the same probe, produced two verified
PNGs and a PDF, and the original sandbox judge was active before and after. That
Mac experiment used nested x86 CPU emulation and a 120-second diagnostic launch
allowance: its 37.355-second launch **failed** the release timing budget. This
Docker candidate uses the normal 30 seconds. Its Docker build and actual Render
performance are not yet verified. No source handover to Claude has occurred.

Primary references:
[official UML guide](https://www.kernel.org/doc/html/latest/virt/uml/user_mode_linux_howto_v2.html),
[Chromium SIGSYS checks](https://chromium.googlesource.com/chromium/src/+/refs/tags/141.0.7390.37/sandbox/linux/seccomp-bpf/trap.cc).

The source bootstrap was also run against the local Linux guest. The unchanged
production PDF kernel passed every PDF check. The original capture kernel
produced 10 hash-verified images across both targets; its width check failed the
normal 60-second budget. The separate direct cold-launch diagnostic timed out at
30 seconds. The original supervisor-environment probe reported `ENOENT`; that is
not permission-denial evidence and is not counted here as host qualification.
The local donor artifact also warned about a missing optional native canvas
binding. The Docker recipe performs a clean Linux dependency deployment; its
build and runtime still need actual verification.

The namespace supervisor's cancellation path was exercised separately in the
private Linux lab with an owned init and descendant. Both `SIGTERM` and
`SIGKILL` stopped that tree; 20 immediate startup cancellations also completed.
This verifies the supervisor's parent-death handling locally. Cancellation of
the actual UML/browser tree still needs a native Render check. A clean source
copy with no workspace `node_modules` also deployed the renderer dependencies
successfully through the pinned pnpm command.
