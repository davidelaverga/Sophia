# Room: captions on the stage

> 2026-10-05 · Luis · second PR of the room's $20 plan ([prototype](https://claude.ai/artifact/HFtEbbCuzYN834bu7LahWb), scene 1) · "Procede"

## The gap, measured

Live captions (CX-0023) reach the page in `room.captions`, but only the Chat panel shows them. With the panel closed (the room's usual state), the stage shows nothing of what is being said. On the fixture page:
- `sophia=speaking` and a caption of hers give "Sophia is speaking" under the light, and none of her words anywhere in sight;
- Chat's toggle doesn't mark them as new either (voice is heard live; CX-0023).

## What changes

Meet's place for captions, in the room's own style. The prototype's scene 1 has the look.

- **Where:** on the stage's axis, just above the dock. Each line has its speaker's name as a small capital label (the voice of the dock's labels: YOU, MARCO, SOPHIA in her violet), then the words.
- **How many:** the last two captions said, in the chat's order (one placed before another shows above it); the older one dimmed. A long caption shows its end, about two lines on a desktop and up to three on a phone.
- **When:**
  - while this person is in the call, and the Chat panel is closed;
  - with the panel open, the chat already shows them, so the stage doesn't repeat them;
  - six seconds after anything was last said (a word or an end, in any caption), they go;
  - only what is said after that brings them back.

  The hold runs even while the stage doesn't show them: after leaving and joining again, or closing Chat later, old words never come back as new.
- **With video:** the gallery and the present layout end above the captions while they show, so no tile sits under words.
- **Assistive tech:** the stage's captions are a visual copy of the chat's, and are hidden from assistive tech. Sophia's line stays the room's announced state, so nothing is announced twice.
- **Motion:** they arrive with the room's 220 ms ease and go at once; under reduced motion they also arrive at once.

No new control and no new words. Whether people want a toggle for them (Meet's CC) is an open question for Luis, not built here.

## Out of scope

- guests: the guest room's stage gets no captions, as before;
- Sophia's work line;
- the made object;
- the phone layout finds from #100 (names over the light, a cut tile).

Those are the plan's next PRs.

## Checks (written first, `e2e/room-captions.spec.ts`, over #100's fixture states)

- **Captions in place:** a caption of Sophia's, then one of Marco's, appear on the stage with their names, in order; Sophia's label is hers.
- **Two at most:** a third caption leaves the two latest, the older one dimmed.
- **One place at a time:** with Chat open they leave the stage, and they come back when it closes.
- **They go:** six seconds after the last one ended (the page's clock moved on), none show. A new partial brings them back.
- **On the axis:** their centre is on the stage's centre (within 1 px), and they end above the dock.
- **With video:** in the gallery and the present layout, no tile reaches under them.
- **Out of the call:** leaving takes them away.
- **Phone:** they fit 390 px without sideways scroll, above the dock.
