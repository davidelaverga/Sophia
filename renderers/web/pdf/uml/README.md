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
Docker candidate uses the normal 30 seconds. At `b44651c`, both the complete local
Docker build and the native Render build/deploy passed. On Render, Chromium
launched in 7.509 seconds, produced two hash-verified PNGs and a PDF, and retained
the original active sandbox before and after. No source handover to Claude has
occurred.

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
clean Linux build passed. Native Render's unchanged PDF kernel passed every
check, and capture produced 10 verified images. The `widths_visible` check failed
within a 45.178-second total fixture, so the detailed native cause is still
unknown. The full fixture correctly reports failure; no production acceptance
is claimed. Host adverse controls passed with Landlock ABI4, UID10001 and
seccomp2, including permission denial of excluded host files and inheritance by
a descendant. The worker was suspended after collecting its complete log.

If the original suite reports a failed capture check, the diagnostic now runs
one additional capture of its exact fixture through the unchanged kernel and
prints each receipt check's detail. The original suite still determines failure;
this diagnostic receipt never promotes it to success. The launch, width sweep,
host wall time and output limits stay unchanged. This logging extension has not
been run on Render and needs a fresh bounded test authorization.

The namespace supervisor's cancellation path was exercised separately in the
private Linux lab with an owned init and descendant. Both `SIGTERM` and
`SIGKILL` stopped that tree; 20 immediate startup cancellations also completed.
This verifies the supervisor's parent-death handling locally. Cancellation of
the actual UML/browser tree still needs a native Render check. A clean source
copy with no workspace `node_modules` also deployed the renderer dependencies
successfully through the pinned pnpm command.

## Current RAM-backing candidate

The later `77597f30` native Render fixture still failed the original width pace
gate, despite passing PDF, ten captures, sandbox and host adverse controls. Its
batch is closed and the worker is suspended. The complete failed receipt is
retained; see `docs/handoffs/SDD-01-CX-uml-width-profile.md`. The width diagnostic
now traces the actual original sweep and labels its separate prewarmed samples
accurately. It does not alter any acceptance check.

The native boot log shows guest physical memory backed by a disk file rather
than tmpfs. The pinned UML source explicitly prefers tmpfs to avoid host dirty
page throttling. `kernel-memory.patch` changes only physical RAM backing to an
anonymous memfd: the same declared length, close-on-exec, shared writable pages,
and seals preventing size changes. It checks executable mapping and exits if
creation, sizing, sealing or mapping is denied. There is no disk fallback, host
mount, policy change, new file grant, huge page request or memory tier increase.

At build time, `check-memory-backing.py` extracts the actual patched upstream
function and compiles native controls against it. The controls verify anonymous
tmpfs backing, fixed length, fork sharing, close-on-exec, and denial of each
required primitive without fallback. Those controls and the modified UML kernel
cross-compilation passed in the private offline ARM Linux lab. That is neither
native Render performance nor host confinement acceptance. The original full
Linux fixture and ordinary CI must pass on this source before any amended paid
Render request. Kernel and host-isolation review remain independent obligations.

## Current performance investigation

The `4055ff13` RAM-backing candidate built and deployed on Render. Its original
full fixture failed the first 32-width pace check: 961 ms projected beyond the
unchanged 60-second deadline. A separate later failure-detail diagnostic covered
all 2,241 widths in 37.787 seconds; that diagnostic does not replace the failed
original result. The paid batch is closed, its complete receipt is retained, and
the worker is suspended. There has been no Claude handover or production release.

The preceding kernel configuration selected `CC_OPTIMIZE_FOR_SIZE` (`-Os`). The
candidate now selects Linux's default `CC_OPTIMIZE_FOR_PERFORMANCE` (`-O2`). An
offline cross-compile passed, and the normalized configurations differ only in
that compiler choice. That compiler choice does not change a kernel security option, guest memory,
viewport count, batch size, pace gate or deadline.

The Docker build accepts `UML_KERNEL_OPTIMIZATION=size` as a compiler comparison
control; the default is `performance`. It rejects other values and logs the
checked normalized configuration. The earlier compiler ABBA comparison belongs
to source `4eb223e6`, and its results must not be assigned to a later candidate.

The reader amendment decodes all requested snapshot styles with a simple loop
and retains one text-baseline canvas for the width reader. It resets the font at
each block and reads each current text and computed font again. DOM, layout,
viewport, order and snapshot answers remain fresh; there is no page-answer cache.
Ordinary target measurements retain their preceding canvas allocation behavior.

CI now builds a reader control by restoring only `capture-page.mjs`,
`capture-html.mjs` and `placement.mjs` from pinned source
`4eb223e67d428c2473d07ccc2ad1912142c87b45` into an otherwise exact candidate
context. Both images use the same candidate kernel, driver, guest libraries and
security controls. Four fresh full original fixtures run baseline/optimized/
optimized/baseline on one host, each at one CPU and 2 GiB with network disabled.
Every run retains its separate original verdict and complete log; any failure
fails the job. CI proves behavior on that host, not native Render success. A new
source still needs an amended bounded paid request before a native build/test.

The independent review also found that killing the root fixture driver could
leave its namespace supervisor alive without the 240-second watchdog. A small
exec wrapper now binds every direct fixture child to the driver's lifetime with
Linux parent-death signaling and a pre-exec parent-identity check. The existing
namespace chain protects its descendants. Linux regression controls exercise
driver `SIGTERM`, driver `SIGKILL` and refusal of an already-mismatched parent;
this does not by itself prove native cancellation of the actual UML/browser tree.
