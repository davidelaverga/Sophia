# «Up to date» says when it last checked

> 2026-11-16 · Lote 18, item 10 (evaluacion-2026-11-16/textos-lote-18.md, «Usuario experto»). Luis approved the line
> word for word: «Up to date · checked 12 seconds ago», with the relative time.

## Why

- The header's pill (`ProjectHeader`, ProjectShell.tsx) says «Up to date» with a title of the same words. A feed that
  heard from the project a second ago and one silent for twenty seconds (the stall watch gives up at 25 s,
  stream.ts) look the same.
- **Where the time is known:** the stream reader (`followEvents`, stream.ts) proves the stream alive on every chunk,
  its `: ping` every 10 s included (`watch.alive()`). That is the last successful read: the snapshot is read only on a
  gap or an applied event, the stream all along.

## What changes

- `followEvents` takes an optional `onHeard`, called as the stream opens and on every chunk it reads.
- `useProjectFeed` keeps the time of the last one in a ref (no state: nothing re-renders for it) and hands out a
  stable `checkedAt()`.
- The pill's help, only while it says «Up to date»: «Up to date · checked {ago}», in the app's own words for a live
  reading (`ago(at, now, { seconds: true })`, time-words.ts): «just now», «6 s ago», «2 min ago». It is computed as the
  pointer comes onto the pill, so the shell renders nothing every second. Every other state keeps its words.

## Deviation from the approved line

The approved line spells «12 seconds ago»; the app's time words say «12 s ago» (time-words.md: short, spaced units).
Reusing them, as asked, gives «Up to date · checked 12 s ago». Said in the handoff for Luis to confirm.

## Checks

`feed-recovery.spec.ts`: live, the help reads «checked just now» or a few seconds; with the stream silenced
(`stallStream`, no pings), 8 s later the pill still says «Up to date» and its help counts 8 to 14 s.

## Not changed

The pill's label, its states, the stall watch, the reconnect loop. No API.
