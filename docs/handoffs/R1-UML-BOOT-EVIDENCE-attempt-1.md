# R1 UML boot evidence: how a guest's launcher ended, and what it printed before it was entered

Goal and attempt: FND-A-R1-BOOT-EVIDENCE-01, attempt 1. Human owner / executor resource: Davide / Claude A. Native
session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting worktree/commit: `foundation/r1-uml-boot-evidence-20261016` (a new isolated worktree) from #389's head
`edfabaec09091f7ff684cbc43b33c2a64a1e59d5`, tree `d033153c5c78b43049a3cb418f721f21f006956d`. The three files changed here
are identical on main `e1cc4b4d4cdde2b2643ea40ebe32232040d0900d`; no current-main merge was needed.  
Changed files: `renderers/web/pdf/supervisor.mjs`, `renderers/web/pdf/uml/supervisor-e2e.mjs`,
`renderers/web/pdf/test/supervisor-uml.test.ts` and this record. The ending commit is recorded with the coordinator.

## Outcome

Observability only; this does not fix or explain #389's failed UML run. In that run (job 117088560207), both the PDF and
the capture job ended at about 241 s with "the kernel wrote no receipt", no guest line and no check. How the launcher
ended and what the console printed were discarded. Now:

- Every UML run logs, as metadata only, how the process the supervisor started ended — `namespace-launch.py`, the OUTER
  launcher — and whether the guest was entered: "the outer launcher (namespace-launch.py) ended: exit code N | signal S
  | no exit seen, its own status, not the guest kernel's; guest entered: yes|no". The launcher maps its child's wait
  status through `sys.exit`, so this is never the guest kernel's raw status, and no inner cause is inferred from it.
  `RunEnd` carries the same as `leader`.
- A synthetic check alone (`UmlConfig.diagnostics`, set only by `uml/supervisor-e2e.mjs` and tests; no environment
  variable or configuration turns it on) is told how each run ended and, only when the guest was never entered (no
  `UML_GUEST_` or `UML_JOB_` line), the last console lines before that: at most 16 lines, each made printable and cut at
  256 characters with " [cut]", at most 4 096 bytes in all, with how many lines there were and whether any were dropped or
  cut (`BOOT_EVIDENCE`, `bootConsole`). Production keeps none of the console, as before. A diagnostic that throws changes
  nothing of the run.
- The synthetic end-to-end check prints `UML_E2E_ARTIFACTS` (the size and SHA-256 of `/opt/uml/linux.uml`, `initrd.gz`,
  `guest.raw`, `abi-probe`, `namespace-launch.py` and `landlock-launch.py` as installed in the image under test) and one
  `UML_E2E_BOOT_EVIDENCE` line per run, in its existing uploaded log, with `qualification: false`.

Unchanged: the workflow, Dockerfile, kernel, launchers, claim, limits (240 s CPU, 270 s production wall, the 150 s
exhaustive sweep), outcomes (abandonment stays abandonment), Stop, receipts, settlement and security controls.

## Evidence

Commands run in the worktree on macOS (Node 24.21.0, pnpm 11.7.0):

- `node --test renderers/web/pdf/test/supervisor-uml.test.ts`: 1 pass, 0 fail. Only the platform-independent test ran
  (bootConsole's bounds). The UML-mode suite is Linux-only (GNU tar, /proc) and SKIPPED here, including the new runtime
  regressions; they run in CI's `pnpm check` job on Linux and are unverified by this author until then.
- `pnpm check`: exit 0 (toolchain, format, lint, build, typecheck, contracts; unit 2 374 pass, 0 fail, 70 skipped;
  artifacts reproduced, native bundle unchanged; integration 95 pass, 0 fail, 2 skipped).

The new Linux regressions run the real `runOnce` with a native stand-in launcher process against the existing loopback
renderer API:

- a guest that prints its console and exits 7 before it is entered is abandoned with nothing uploaded or settled; the
  log names the launcher's exit as its own, and none of the console (a canary line) reaches the log;
- with the diagnostic, it gets the bounded console (16 of 33 lines, the long line cut and marked, the canary last and
  printable, within 4 096 bytes) and exit code 7, and the job ends the same;
- a launcher killed by SIGKILL is reported as signal SIGKILL, never as an exit code;
- a guest that got in keeps no console; a throwing diagnostic leaves the job settled; a Stop with the diagnostic is still
  cancelled with nothing uploaded or settled and its processes gone.

## Remaining obligations

The cause of #389's boot failure is unresolved. This patch only records evidence next time. Independent review (V, and R
for the retained supervisor interaction) before any push; then one controlled run of the existing UML workflow on the
exact head, with its new image ID and artifact hashes, as the coordinator dispatches. CI is not native Render
qualification.

## Next bounded action

The coordinator's review and dispatch of that one controlled run; the combined-source integrator carries the reviewed
commit.
