# The report pane's call switches show their keys

> 2026-10-16 · A Codex P2 on #326 (`evaluacion-2026-10-13/follow-ups-p2.md`). At 760 px or less, a report covers the
> dock and the mini dock, so its head carries the call's switches (`PanelCallSwitches`). Outside the Studio, those
> switches were given `keys={false}`. But the mini dock under the pane keeps its commands registered, so Ctrl+D works
> while the visible switches' tips don't say so. Studio only.

## What changes

- **`ProjectShell` `WithViewer`:** the report pane's switches show the room's keys wherever a dock under the pane has
  them registered. That is the Studio's dock in the Studio, and the mini dock in every other view of an open project.
- `PanelCallSwitches` registers no commands of its own, so nothing is registered twice.

## Checks

`report-pane-keys.spec.ts`, at 720 px, in a call, a report open from Tasks:
- the pane's Microphone tip shows the same key as the mini dock's;
- pressing that key turns the microphone off, and the pane's switch says so.
