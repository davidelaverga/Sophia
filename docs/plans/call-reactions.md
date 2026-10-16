# Reactions in the call

> 2026-10-15 · Point 6 of the gaps report (`evaluacion-2026-10-15/informe-brechas-funcionales.md`): no emoji
> reactions in the call. Luis: «Sí, hazlos en ese orden». Built on #342, since both touch `livekit-room.ts`.

## What was measured

- The dock holds the devices, the floor, Sophia and Leave (`RoomDock.tsx`). Nothing in `features/voice` sends or shows
  a reaction.
- LiveKit's data channel already carries the chat to Sophia on its own topic (`sophia-channel.ts`). Her bridge reads
  only that topic (`media-bridge/src/rtc.ts`), so another topic never reaches her.

## What changes

- **React in the dock** opens the kit's menu with Meet's six: 👍 Thumbs up, ❤️ Heart, 😂 Laugh, 🎉 Celebrate, 👏 Clap,
  😮 Surprised.
  - It is one round square, a smile, with the tip «React», so on a phone it is one more square in the dock's row.
- **A reaction goes to everyone in the call** on its own data topic (`sophia.reaction`), and nothing is kept.
  - It floats up the room for a few seconds with who sent it («🎉 You», «👏 Marco»).
  - It sits in a polite live log («Reactions»), which says it to a screen reader as «Marco reacted Clap».
  - With less motion asked for, it appears without moving.
- **What arrives is checked:** only one of the six from a person in the room shows. Anything else, or anything from
  Sophia's participant, is let go.
- **From here, at most one every 400 ms**, so a held key never floods the room. The newest twelve stay on screen.

## Checks

- `reactions.test.ts`: the six; the packet read back as one of the six only; the pace; the newest twelve.
- `call-reactions.spec.ts`:
  - React's menu lists the six; one chosen floats up with «You», is sent, and goes;
  - another's floats up with their name, and one not of the six never shows;
  - on a phone, React is a 42 px square in the row.
