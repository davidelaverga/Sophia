# Handoff · a raised hand said, «Up to date» by keyboard (attempt 1)

Branch `a11y/hand-and-sync-announced`, off `origin/main` c9c226c94. Design note: `docs/plans/hand-and-sync-announced.md`.

## What changed

- **A raised hand is said.** `hand-signal.ts` takes `onRaised`, called once per raise of another member's hand (down to
  up only); never for this person's own, a lowering, a guest or Sophia (none heard), nor for a hand the signal already
  had. Back from a drop, a hand forgotten by the reconnect and heard again within 5 s (`REHEARD_MS`, the ask's answer)
  is the same raise, not said again. `livekit-room.ts` maps the identity to the room's name (`onHandRaised`),
  `useProjectRoom.ts` keeps the line for a few seconds (`handSaid`, keyed by a turn so the same words said again are a
  new node), and `RoomDock.tsx` says it in its own polite, out-of-sight `role="status"` line (`.hand-said`), mounted
  all along beside the reactions' log. Not the dock's note: a hand would overwrite the connection's line.
- **The words** live in one place: `handRaisedLine` in `room-view.ts`, «Marco raised their hand.» with the tile's
  `shortName`. **Proposed, for Luis to approve.**
- **«Up to date» by keyboard.** `ConnectionPill.tsx`: `tabIndex=0`, `has-tip` + `<Tip side="bottom" align="end">` in
  place of `title`, `aria-describedby` to the tip. The help is computed as the pointer or the focus arrives (no
  re-render per second); it says its word again once both have gone. `Tip` (packages/ui) takes an optional `id` for
  this. `theme.css`: the tip in the sans type (not the pill's mono capitals) and a 4 px focus ring radius. No new copy.

## Tests, red → green

- Test commit **bba3bc833** (tests alone): `node --test hand-signal.test.ts room-view.test.ts` → 20 run, 16 pass, 4 fail
  (`handRaisedLine` not exported; `onRaised` never called).
- Fix commit **db5636991**: the same two files → 52 / 52 pass. All Studio units: 2467 run, 2465 pass, 2 fail — the
  known Windows-only `attention.test.ts` and `browser-imports.test.ts`. `packages/ui` units 43 / 43.
- `pnpm -s lint` (oxlint type-aware, whole repo) exit 0; `pnpm -s typecheck` exit 0; Prettier on every touched file.

## Not run

- **Playwright** (`call-raise-hand.spec.ts` new test; `feed-recovery.spec.ts` new keyboard test and the hover check now
  reading the tip): the guard (`pw-gentle.ps1`) refused both the red run (free RAM 7.7 GB) and the green run (5.6 GB).
  Run both at the two SHAs above before review.

## Open

- Luis approves «<name> raised their hand.».
- The line lives in `RoomDock`, so it is said while the room's stage is shown; with the call minimised to the header's
  mini dock (another view of the project), nothing is said. Mounting it higher (ProjectShell) is a follow-up if wanted.
- A late joiner hears each hand already raised once, as it is told (the design note says why).
