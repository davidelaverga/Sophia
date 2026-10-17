# Each person's volume, for you alone

> 2026-10-17 · the QoL queue's third item (Luis, 2026-10-16). Someone too loud or too quiet can be turned down for you
> alone, as Zoom's and Discord's «Adjust volume» do. Studio only: nothing reaches the API or the others.

## What changes

- **People panel:** each other person's row gets a «Volume for Marco» control.
  - It shows a speaker at full, the level in its place when turned down («50%»), and a struck speaker when Off. All
    of it stays inside the square, so nothing reaches the next row.
  - It opens a menu: «For you alone», then 100%, 75%, 50%, 25% and Off.
  - A guest's row has it too; your own row doesn't.
- **What a level covers:** everything heard from that person, their voice and their shared screen's sound.
  - Sophia isn't in the panel, so her voice keeps the call's.
- **How long a level lasts:** it is kept by person while you're in the call.
  - Someone who leaves and joins again keeps the level you gave them.
  - Leaving the call sets everyone back to full.
- **Where a page can't set a sound's volume** (iPhone and iPad read 1 whatever is set), the menu offers 100% and Off
  only. Off works there too.
- **The connection** keeps each level and puts it on that person's sounds, those playing and those still to come
  (`people-volume.ts`). It doesn't use LiveKit's own `setVolume`, which puts no volume of 0 on a sound that arrives
  later (its `attach` checks `if (this.elementVolume)`).
- **Off stops their sound coming**, as «Show others’ cameras» does for cameras: their audio tracks are let go
  (unsubscribed), and a track they publish while Off isn't taken.
  - Muting alone wouldn't hold. LiveKit's `startAudio` unmutes every sound it has: on the dock's «Allow audio» and, on
    iPhone and iPad, each time the page shows again.
  - Until a track stops, what still plays is muted at 0.
  - A level after Off takes their tracks again.

## Not here

- A slider: the five levels cover «too loud» and «too quiet». A page can't raise a sound past full without Web Audio,
  which would change how every voice in the call plays.
- Levels kept from one call to the next.

## Checks

- **`people-volume.test.ts`:**
  - a level reaches that person's sounds only, those playing and those to come;
  - Off lets their audio tracks go and leaves their video, and a level after Off takes the tracks again;
  - a track an Off person publishes isn't taken;
  - the levels offered where a sound's volume can't be set;
  - the words.
- **`people-volume.spec.ts`:**
  - the menu and its levels;
  - the level shown and said on the row, with the fixture's connection asked `volume:<identity>:<level>`;
  - the control inside its row, on a computer and on a phone;
  - no control on your own row;
  - after leaving the call and joining again, everyone is back to full.
