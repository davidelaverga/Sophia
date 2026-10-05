# Room: the fixture shows people and Sophia's states

> 2026-10-05 · Luis · first PR of the room's $20 plan ([survey](https://claude.ai/artifact/J9qLPAmNKSMGakEwZBgcYw), [prototype](https://claude.ai/artifact/HFtEbbCuzYN834bu7LahWb)) · "Procede con ese plan"

## Why first

The room's fixture page (`fixtures/room.tsx`) can't show the room's main moments. Its fake LiveKit returns:
- only the viewer as a participant;
- `sophia: () => null`;
- no feeds;
- `audioBlocked` false.

So Sophia speaking or listening, other people, the gallery, a shared screen, the floor passing, a paused or unavailable voice and Allow audio exist only in unit tests (`sophia-view.test.ts`, `room-view.test.ts`). Nobody can see them or check them in a browser.

Every later PR of the plan needs these states to be seen and tested: captions on the stage, Sophia's line, the made object and Show everyone.

## What changes (fixtures only; no product code)

| The page asks | The room shows | Through |
|---|---|---|
| `people=N` (1–5) | N others in the room (synthetic names), each with their microphone on | `participants()` |
| `floor=1`…`N`, `floor=me`, `floor=absent` | that person holds the floor; `absent`: a holder who isn't in the room | the snapshot's `room.inputActorId` and `room.sophia.inputActorId` |
| `sophia=here`, `listening`, `settling`, `answering`, `speaking` or `blocked` | her participant with those attributes; `blocked` also has the browser block her sound | `sophia()` and `audioBlocked()`; it opens her conversation as `exchange=open` does |
| `voice=recovering` or `unavailable`; `paused=guest` or `holder_left` | the snapshot's presence says so | `room.sophia` |
| `speaking=0`…`N` | that person speaks (0: the viewer) | `participants()` |
| `video=camera` / `video=screen` | the others' cameras, from synthetic canvas streams (the gallery); or person 1 shares a screen (the present layout) | `feeds()` |
| `looking=screen` | Sophia sees person 1's screen | `room.sophia.looking` |

`window.fixture` gains:
- `sophia(state)` and `speaking(who)`, to change these while the page is open;
- `floorTo`, which records whom the floor went to.

The fixture API answers `POST /rooms/:id/input-floor`, as the API answers it: the floor moves, and the project publishes a new revision.

With none of these parameters, the page is exactly as before. The existing checks don't change.

## Out of scope

Anything in the product: captions on the stage, Sophia's line and the made object are the next PRs.

## Checks (written first, `e2e/room-people.spec.ts`)

- **People and the floor:**
  - `people=2&floor=1`: the two others are around the light, and the line says the floor is theirs.
  - The viewer holds the floor; Pass to… a person: the floor moves, and the API was asked once.
  - `floor=absent`: the line says the holder isn't here.
- **Sophia:**
  - `sophia=listening&floor=1`: "Sophia is listening to <name>"; the light listens.
  - `sophia=speaking`: "Sophia is speaking"; Stop speaking is offered; the light speaks.
  - `sophia=blocked`: Allow audio is offered.
  - `voice=unavailable` and `paused=guest`: their lines.
  - `window.fixture.sophia('speaking')`: the line changes while the page is open.
- **Who speaks:** `speaking=1`: that presence shows it, and the change can be made while the page is open.
- **Video:**
  - `video=camera`: the gallery, with a tile per person and Sophia's.
  - `video=screen&looking=screen`: the present layout with the screen, and "Sophia sees <name>'s screen".
- **Phone:** the gallery at 390 px fits without sideways scroll.
