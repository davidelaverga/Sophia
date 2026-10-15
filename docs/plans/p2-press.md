# Presses on answer the pointer, and the sweep that says so (Codex P2s on #232, #234)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Sixth follow-up to the kit stack's open Codex P2s. This one: the
press sweep (`e2e/press-answers.spec.ts`) and the presses it missed.

## What was measured

- #232 4249580233: «New conversation» on (`aria-pressed`) keeps its look under the pointer: the pressed rule wins.
- #232 4250197340: the account control open (`aria-expanded`) keeps its warm edge under the pointer; the sweep reads only
  the closed state, and a tip inside it would satisfy it anyway.
- #232 4249580244: Calendar's date and time pickers are presses the sweep does not list.
- #232 4250197352: a listening microphone's animation changes `boxShadow` by itself, so the sweep reads a change with
  no hover rule at all.
- #234 4249607147: in light mode, «Ask Sophia» on and both listening microphones deepen to the dark theme's fixed violet
  (`rgba(156, 130, 245, …)`), barely visible on paper.

## What changes

- **CSS**: the conversations' icon press on or expanded deepens under the pointer (`rgb(var(--halo-rgb) / 0.22)`); the
  account open rings its warm edge (`box-shadow`); the three hovers above take `--halo-rgb`, the light theme's own.
- **The sweep**: lists `input[type="date"]` and `input[type="time"]`; holds animations still while it reads
  (`animation-play-state: paused`; transitions, the hover's own, still run); sweeps two more states, the new
  conversation's form open and the account menu open, reading their presses without tips; and checks the light
  halo's hover on Home's listening microphone.

## Checks

- `e2e/press-answers.spec.ts` as above, written first (`3f8d77df`).

## Left

- Not run on this host: the machine guard refused Playwright (free RAM about 5 GB with AION2 open). CI is the run on
  record, the sweep among its browser suites.
