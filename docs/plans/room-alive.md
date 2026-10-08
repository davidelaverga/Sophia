# The demo's room, alive

> 2026-10-08 · Luis: «Sigue con R2». The second of two PRs after the «$20» look at the room (`room-honest.md`).
> Fixture only: what Sophia says is the runtime's to write; the demo shows the bar. No API change.

## What reads as unfinished

- The demo's room opens empty: you join alone, and the room's point (a team, and Sophia among them) is never seen
  unless the address asks for people.
- Asked in, Sophia listens and says nothing: «Sophia is speaking» is never seen with her words, though the stage shows
  captions as Meet does.

## What changes (the demo's fixture only)

- **The team is there:** Marco and Lucía, the project's people, are in the demo's room unless `people=` says
  otherwise.
- **Sophia's first words, captioned:** asked in, she says where the project stands, from its own report, and asks
  where to start: «I’m here. Twelve of the fourteen pilot teams are still active; the two that left both changed their
  admin in week three. Where do you want to start?», her words coming in as she says them. Then Marco takes the floor
  (only the floor's holder is captioned, CX-0019) and asks aloud: «With the two that left. What would have kept
  them?», and she listens to him.
- **Her presses still stop her:** «Stop speaking» cuts her line, «End» ends the scene; a line under way ends cut off,
  and nothing more is said after either.
- Without the demo, nothing changes: no one is in the room unless asked, and she says nothing.

## Checks (written first)

- In the demo, Marco and Lucía are in the room on joining, with no `people=`.
- Asked in, her line shows on the stage under her name, then Marco's under his, and she ends listening to him.
- «Stop speaking» during her line: it ends cut off, no more of her words, and Marco's line never comes.
- Without the demo, asked in, no caption is shown (`room-honest.spec.ts` keeps its checks).
