# SDD-01 UML width performance investigation

Goal and attempt: SDD-01 / root UML width profile after the failed CPU comparison.  
Human owner / executor resource: Davide / Codex root; own qualification branch.  
Native session: current Codex session identity not supplied.  
Starting worktree/commit: `codex/render-uml-qualification`, `3764faa3595ac7ea795f66ba7e02fa5ccda86c49`.  
Ending commit/tree: resolve from the commit containing this record.

## Outcome

The same-image Render comparison at 2 CPUs still failed the original 60-second width pace check. PDF, screenshots,
live sandbox and host adverse controls passed. The guest reported one CPU. The original 1 CPU/2 GB service was restored
and suspended; no paid attempt remains in that envelope. No merge, production acceptance or Claude handover.

## Evidence

An isolated macOS diagnostic using the pinned Chromium 141.0.7390.37 and exact 936-byte fixture measured 64 sequential
widths in 35–52 ms. Reusing the text-baseline canvas returned identical results with only modest gains. This is neither
UML performance evidence nor Linux confinement acceptance. The source already batches CDP commands.

The new diagnostic records 32 sequential widths, attributing viewport, order, snapshot and comparison times, browser-side
order time, snapshot bytes and Node CPU use. It validates fresh order and full snapshot answers. The existing batched
samples and original suite verdict remain authoritative. The diagnostic is bounded by its existing 60-second window.

## Decisions and changes

Add a branch-scoped Linux CI fixture job with one CPU/2 GB and the existing host capabilities. The outer Docker seccomp
filter is absent, matching Render; the unchanged host launcher installs Landlock and its own inherited seccomp before
UML executes. CI uses the existing renderer job's runner-only namespace setting. No production credentials or provider
calls. A CI-only idle adapter exits with the original settled verdict and refuses execution on Render.

Changed files: diagnostic, CI-only adapter and its settlement/Render-refusal tests, branch-scoped workflow, this record.
Confinement, Chromium wrapper, host probe, host driver, width checks and all limits are preserved.

## Remaining obligations

CI measurements have not yet been executed at preparation. The Render service stays suspended. Independent review,
actual UML/browser cancellation, production memory/output boundaries and application acceptance remain open. Render
support remains unsent. The approved combined spending ceiling is retained, not reset by this attempt.

## Next bounded action

Codex root examines the component profile from this exact Linux CI source, then implements and verifies the smallest
supported fix. A different paid Render candidate requires an amended concrete request under WORKING_PROTOCOL §4.

## CPU-affinity candidate

The next candidate narrows only the owned host launcher's CPU affinity to one CPU already permitted by the OS. It
verifies that the requested affinity took effect and that the adverse-control child inherited both affinity and file
denial. The ordinary confinement modules, browser flags, host Landlock rules, host seccomp rules, guest kernel and width
limits stay unchanged. A real Linux subprocess test checks inheritance through exec and leaves the test caller's
affinity unchanged; a denied affinity request has no silent fallback. CI runs the original fixture at one CPU/2 GB.
This is a performance hypothesis until the candidate's full fixture completes; no Render success is asserted.

## CPU-affinity result and visible-surface candidate

Candidate `b37eda1e69ea7407f07038e55c75f8a21a2b6ebd` passed the complete original Linux CI fixture at one CPU/2 GB
([run 37764472193](https://github.com/davidelaverga/Sophia/actions/runs/37764472193)), including all eight Python helper
tests. All six ordinary CI jobs passed in push run 37764472235 and PR run 37764478067. The preceding Linux baseline
failed width pace. CI is distinct from Render, and independently built images are not a same-image causal comparison.

The approved native Render attempt built and deployed that exact source once on the original one CPU/2 GB worker.
It applied CPU0 affinity, host UID10001, Landlock ABI8 and seccomp2; all host adverse controls, PDF and 10 captures
passed, but the original width pace gate still failed. Launch took 3811.164 ms and the entire failed fixture took
49.128 seconds. Render had moved to host kernel 7.0.0-1009-aws; historical attempts used kernel6.8/ABI4. Failure-only
32-width retained-function samples projected 30.3–44.6 seconds; these are not completed sweep timings.

The complete 756886-byte native log hash `6a86d0e8e7d6e0f9e358d592321f28b8a91ddf761269b529cf7b944b59ab5ce6` matched the
export. Both PNG payloads were hash-verified. Guest exit and scratch/sentinel removal were natural. Only the verified
owned idle supervisor was signaled via pidfd; it exited and remained an unreaped zombie until container suspension.
The worker was suspended and not billed before the deadline, at the original tier. That batch is closed, without a
retry. Claude handover remains withheld until a full native Render pass. Support remains unsent.

The next source candidate uses Chromium's pinned `dontSetVisibleSize` option only for the widths whose layout is read
without photographing them. Device metrics still change at every width, followed by fresh order and full snapshot
reads. Band-end measurements and captures retain normal visible-surface sizing. No confinement rule, browser flag,
width, batch, deadline or pace test changes. The new real Linux browser regression compares complete snapshots and
order answers across responsive/container-query boundaries, fixed/sticky boxes, flex/grid wrapping, RTL and tables.
An isolated macOS prototype returned identical full snapshots/order/viewport results on those cases. This establishes
local equivalence, not native Linux or Render acceptance; new CI results remain pending at preparation.

## Visible-surface result and actual sweep tracing

Candidate `77597f30cbbc9fffc9d1968a096a3cbd0e4c9f46` passed the complete original Linux CI fixture
([run 37774839703](https://github.com/davidelaverga/Sophia/actions/runs/37774839703)), the new confined-browser complete
snapshot comparison, and all six ordinary jobs in both push and PR CI runs. The approved exact-source native Render
fixture nevertheless failed the original width pace gate. All other suite checks passed. Chromium launch took
5218.198 ms; the entire fixture took69.540 seconds, which is not the width-sweep duration. This host used
kernel6.8.0-1050-aws and Landlock ABI4, so it is not a controlled timing comparison with the preceding host.

The complete756880-byte native log matched SHA-256
`cb80932a767f754458ac0876e4057f9eafbb587f12531e5c0b316ba7be45f409`. The guest exited0; owned children, scratch and synthetic
sentinels settled. The verified idle supervisor exited after pidfd termination and remained an unreaped zombie until
container suspension. The original worker was suspended/not billed at14:32:59 UTC, before its14:41:19 UTC deadline.
That batch is closed with no further paid attempt authorized. No Claude handover, merge or deployment acceptance.

The failure-only samples labeled “cold” had already read32 component-profile widths. They also resized the visible
surface, unlike the exact current probe. Those projections cannot identify the real sweep's first-batch or later
bottleneck. The labels now explicitly describe prewarmed samples. A trusted fixture subscriber collects bounded
numeric timings from the actual original sweep: media/band setup, reader compilation, each original batch's observed
pace and remaining budget, and completion. It flushes after capture returns. No DOM/source/path/capability data is
recorded; no subscriber is installed by production entry points. Width coverage, batches, pace rejection, deadlines,
layout judgments and confinement remain unchanged. Fake-clock controls verify unchanged early pace failure and full
coverage of a timely band with tracing enabled. New Linux CI evidence remains pending at preparation.
