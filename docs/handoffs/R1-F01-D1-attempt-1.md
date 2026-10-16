# R1-F01 / D-WIDTH D1: the width sweep's 150 s

Goal and attempt: R1-F01 under owner decision D-WIDTH (option D1), attempt 1. Human owner / executor resource: Davide /
Claude A. Native session: Claude Code `local_775c886b-f077-43c7-a07c-74868ab14b5c`.  
Starting worktree/commit: `foundation/r1-f01-d1-20261016` from `main` at `f6be9fa7cd7b83ca688878390d474f0f2899bf69`.  
Ending commit/tree and changed files: resolve from the commit containing this record; `renderers/web/pdf/
{capture-html.mjs,placement.mjs,README.md,uml/README.md,uml/diagnostic.mjs,test/capture-html.test.ts}` and this record.

## Outcome

`SWEEP.maxMs` is 150 000 ms instead of 60 000. Nothing else the sweep reads, checks or bounds changes: every whole width
of 320–2560px, the same band ends, predicates, heights, 2 400 widths, 32 changes, batches of 32, confinement and
resource limits. A sweep, snapshot or comparison past the time still fails `widths_visible`; unread widths never pass.
Old failed runs stay failed. This is source only: no Render capture has run on it, and its completion there is not shown.

## Evidence

Cause (attempt before this one, private evidence with the coordinator): the R1 HTML captures' exact inputs make 6 and 4
band ends, the counts their receipts report unmeasured, so no band end was measured: reading 2 241 widths used the whole
60 s. On macOS the kernel's own sweep reads those inputs in 1.9 s; native Render records of the UML fixture read the same
widths at 15–16 ms each, dominated by per-command overhead in UML; the receipts bound R1's reports above 26.7 ms a width,
and their ~2.3× heavier per-width work suggests 35–40 ms, 80–90 s (inference, not a Render measurement). A focused
reduction of the per-width snapshot gave ~4% and is not part of this change.

Fit (coordinator-verified surrounding limits, not a completion proof): the capture's claim is 180 s for PNG (0039) and
aborts the whole job; R1's captures spent 10.6–13.5 s outside the sweep, so 150 s leaves about 16.5 s; the supervisor
gives the UML guest 270 s of wall time (the 180 s PNG claim plus `UML_MARGIN_MS` 90 s, supervisor.mjs:703), and its
launcher caps CPU at 240 s (landlock-launch.py:104); the QA host's 240 s wall watchdog (host-qa.py:173) is the fixture's,
not production's. CPU, lease and upload bounds are compatible. The QA diagnostic's optional timing probe now starts only
with its whole 125 s budget left (30 s launch, 30 s load, 60 s measurement, 5 s close), not 90 s (#387 review).

Tests: the new bound test pins `SWEEP` and the probe bounds; the existing timeout (`sweepMs: 1`), late-batch and
injected clipping/overflow/cover tests are unchanged and must still fail as before. Commands and CI runs are in the PR.

## Decisions and changes

Owner decision D-WIDTH: exhaustive coverage with up to 90 s more renderer occupancy per HTML capture, on the existing
renderer. The diagnostic reports the sweep budget from `SWEEP.maxMs`. Historical records keep their 60 s wording.

## Remaining obligations

The rebuilt renderer image and UML guest embed the capture code, so their identities change and must be bound fresh;
the kernel, initrd, launchers and supervisor are compared as unchanged, never taken from older image receipts. Production
deployment and the one native capture need the operator's own exact approval (no production grant is held here).

## Next bounded action

Independent review and merge; the operator binds the rebuilt identities and runs one authorized native capture of an
existing stored HTML candidate.
