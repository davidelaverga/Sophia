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

## Anonymous RAM candidate

The native boot record reports that the UML physical-memory file is not on tmpfs. The exact pinned upstream
`arch/um/os-Linux/mem.c` prefers tmpfs to avoid host dirty-page throttling. This is a supported hypothesis, not a proven
explanation of the Render pace failure. A private closure-allocation prototype preserved answers but showed no material
warm improvement; it was not added to the candidate.

The next patch changes only `create_mem_file` to use an anonymous memfd with the same declared length, close-on-exec and
shared writable mapping. Grow/shrink/seal seals keep its length fixed. Creation, sizing, sealing and executable mapping
must all succeed; denial exits without a disk fallback or host-policy adjustment. The original host isolation, ABI
patch, guest memory allowance, browser confinement and width/time limits stay unchanged. Build controls compile the
actual patched upstream function, testing anonymous backing, fixed length, shared writes across fork, closure across
exec, and each denied primitive. An offline private ARM Linux VM passed these controls and cross-compiled the modified
x86 UML kernel. All owned local VMs powered off naturally. Full original Linux CI and native Render evidence remain
pending for this RAM candidate. The worker stays suspended; the earlier approval is not reused for this new source.

## RAM-backing result and compiler optimization candidate

Candidate `4055ff1336456a19053dd394395a84ffaad357b0` passed the original one-CPU/2-GiB Linux CI fixture
([run 37796099848](https://github.com/davidelaverga/Sophia/actions/runs/37796099848)) and all six ordinary jobs in both
push and PR CI. Its approved native Render build passed the actual anonymous-RAM controls, compiled and deployed.
Host adverse controls, sandbox, PDF and ten captures passed. The original width check failed after its first32 widths:
961 ms elapsed,58,929 ms remaining, early pace rejection without reaching the hard deadline. The observed1.958-second
sweep stopped early; it was not a completed sweep. The later failure-detail diagnostic independently covered all2,241
widths in37.787 seconds and cannot replace the original failed verdict.

The complete768,267-byte log matched SHA-256 `7b34421b27a13e5644c61de1944ae9b7d4d6e6357d9be3202f95fe9b59a63427`.
The guest exited naturally and owned descendants, scratch and sentinels settled. The verified idle supervisor exited
via pidfd and remained a zombie until suspension. The original one-CPU/2-GB worker was suspended/not billed at18:55:48 UTC,
before the19:03:05 UTC deadline. That paid batch is closed. Support remains unsent and there has been no Claude handover.

The owner then requested performance optimization followed by handback to Claude. Starting source is4055ff13 and
writable scope remains this qualification branch. Separate fresh-process macOS prototypes for shared baseline canvases
and linear snapshot-style decoding preserved answers but yielded only modest gains; neither is included here. They do
not establish native UML performance or explain the cold native first-batch difference.

The existing kernel selected size optimization (`-Os`), whereas pinned upstream `init/Kconfig` defaults to performance
optimization (`-O2`). The next candidate changes only that choice. Its offline x86 UML cross-compile passed and the
normalized before/after configurations differ only in the two mutually exclusive optimization entries. The private VM
powered off naturally. Browser code, RAM backing, all security options and all acceptance criteria are unchanged.

CI builds the default performance image and an explicit size-control image from the same source. It runs four fresh
complete fixtures on one host, in size/performance/performance/size order, at one CPU/2 GiB with network disabled. Each
retains its own log and original verdict; any failure fails the job. CI timing evidence remains pending at preparation.
An independent whole-diff review is required before push. The changed source requires an amended concrete paid request;
no closed batch is reopened. Native success, actual UML/browser cancellation, independent kernel/host review and
production application integration remain separate outstanding obligations.

The independent reviewer inspected the whole diff and found one fixture ownership gap: stopping `host-qa` could leave
the root namespace supervisor alive after its watchdog disappeared. `owned-exec.py` now arms parent-death `SIGKILL` and
checks the spawning driver's PID before executing every owned direct child. Existing descendant guards remain active.
Linux regression controls cover driver `SIGTERM`/`SIGKILL` and a mismatched parent; a guard-removal mutation must fail.
This ownership correction is applied equally to both comparison images, so their only difference remains optimization.
All ten helper tests passed without skips in the private offline ARM Linux VM. Removing the parent-death guard made
both cancellation subtests fail; the tests cleaned up those owned children through their pidfds. The VM powered off
naturally. The independent amended whole-diff review found no further actionable issues; it did not independently run
the private Linux checks or grant production kernel/host acceptance. Actual native UML cancellation remains unverified.
No paid effect has been performed by this performance continuation.


## Reader allocation amendment after compiler comparison preparation

The first compiler comparison at `f8cb6357` was cancelled at the whole-job35-minute limit after two builds and two
passing original fixtures; its third fixture was partial and fourth never started. Source `4eb223e6` expands only the
whole CI job allowance to60 minutes, keeping every fixture deadline and security bound. Its complete result remains
pending while this reader amendment is prepared. No cancelled or partial comparison is counted as a full pass.

Four rotated rounds of six separate fresh-process macOS prototypes read all2241 real viewport widths, comparing three
decoders on every complete fresh snapshot. A linear style decoder plus one retained text-baseline canvas reduced mean
first-batch time from15.11 to11.33 ms and mean summed batch time from508.71 to442.08 ms. These private measurements
motivate this amendment; they are not UML, Linux confinement or Render acceptance. The simpler loop outperformed the
more complex per-snapshot style-cache prototype, so the cache is not included.

The actual amendment reads all computed style fields through the same string-index fallback. The width order reader
retains one scratch canvas, resetting its font at each block; all text, direction, fonts, ranges, layout and viewport
answers remain freshly read. Ordinary target measurements keep the preceding fresh-canvas behavior. The browser
regression compares complete snapshots and order answers across responsive/container-query boundaries, fixed/sticky
boxes, flex/grid, RTL and varied-font tables, then repeats the widths in reverse and requires one canvas across batches.
The protocol-double regression must fail when the preceding per-call order reader is restored.

The next CI control restores only the three preceding reader modules from immutable `4eb223e6` into the candidate
context; both images otherwise share all kernel, driver, guest and security inputs. It runs baseline/optimized/
optimized/baseline as four fresh full original fixtures on one CPU/2 GiB, unchanged limits. Comparison and ordinary CI
remain pending at preparation. The same paid worker remains suspended, all preceding batches stay closed, support
remains unsent, and handback to Claude still waits for a full original native Render pass.
