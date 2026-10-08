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
