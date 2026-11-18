# Raise hand in the call

> 2026-11-16 · Lote 18, point 12 (`evaluacion-2026-11-16/textos-lote-18.md`, «Levantar la mano»): «Raise hand» and
> «Lower hand» in the dock, «Hand raised» on the person's tile; client only, over the room's data channel, no API.
> Luis approved the lines that day, word for word.

## What was measured

- Nothing in the call raises a hand. «Take the floor» (the hand icon) is the input floor for Sophia, a project record
  the API keeps: not a person asking the room for a turn.
- **The token allows it for members, not for guests.** `issueRoomToken` (`apps/api/src/livekit.ts`) grants
  `canPublishData` only when the standing carries a role, and `canUpdateOwnMetadata: false` to everyone. So a member
  can send a packet on the data channel; nobody can set their own attributes or metadata; a guest can send nothing
  (as `guest-reactions.md` found for React). Every participant receives data, guests included.
- **How the Studio already uses the channel:** reactions on `sophia.reaction` (`reaction-channel.ts`, one-shot, to
  everyone), what a member follows on `sophia.following.v1` (`following-signal.ts`, state: said to whoever joins,
  resynced after a reconnect by asking), the chat to Sophia on her own topic. Her bridge reads only the chat's topic.
  Participant attributes are written by the bridge alone (`sophia.input`, `sophia.output`).

## What changes

- **A hand is state, on its own topic** `sophia.hand.v1` (`hand-signal.ts`), kept by the sender LiveKit
  authenticated, so nobody raises another's hand; nothing touches attributes or metadata. Packets: `{hand: true}`,
  `{hand: false}`, and `{ask: true}`. Anything else, or anything from Sophia's participant, is let go.
- **«Raise hand»** in the dock, after React, for members (a guest's token can't send: not offered, as React). Pressed,
  it is sent to everyone in the call; the button keeps its name and reads as pressed (`aria-pressed`), as the dock's
  other toggles do, and its tip says «Lower hand». No key: the plans name none.
- **On a phone (≤ 600 px)** the dock keeps its one row of seven (`phone-dock.md`): «Raise hand» / «Lower hand» is the
  first item of React's menu instead, as Meet's phone has it.
- **«Hand raised»** on the person's tile, for everyone in the call, the host among them: in the gallery's chip after
  the name (on a phone's strip, its hand alone, the words for a screen reader), and in the light's seats as their line,
  before any other.
- **Only a member's hand is heard,** as only a member's token can send one; an ask is answered at most once a second
  for each person (review P3).
- **Whoever joins later is told** by each raised hand, to them alone.
- **Leaving lowers it:** the hand lives in the connection, so a new call starts lowered, and the others forget a hand
  whose person left.
- **A reconnect clears it, the same for everyone:** back from a drop, this person's own hand is lowered and said so to
  the room, sent again until it goes (review P2; a raise pressed meanwhile is never overtaken by it), what was heard before the drop is forgotten once the room is asked, and the members still raised answer
  the asker alone. An ask that can't be sent (a guest's) forgets nothing.
- A hand sent and refused (the data channel failed) goes back down here.

## Checks (written first)

- `hand-signal.test.ts`: a raise sent to everyone and kept as mine; a packet from another raises theirs, from Sophia
  or not one of the three, nothing; a newcomer told only while raised; an ask answered only while raised, to the asker;
  a leaver forgotten; a reconnect lowers mine, says so, asks, and forgets only what came before; a refused send goes
  back down.
- `call-raise-hand.spec.ts`, over the fake LiveKit (its connection runs the real `hand-signal.ts`):
  - «Raise hand» sends it, reads as pressed with «Lower hand» as its tip, and your tile says «Hand raised»; the bytes sent, delivered as from
    Marco, raise «Hand raised» on his tile (what a second participant sees); lowering clears both;
  - in the gallery, the chip after the name says it;
  - after a reconnect, the hand is down for you and said down to the room;
  - leave and join again: «Raise hand», no hand raised;
  - at 390 px it is raised and lowered from React's menu, and the dock keeps one row;
  - a guest is not offered «Raise hand».

## Not here

- No line said to a screen reader when someone raises a hand (a new line, not approved); the tile's words are read.
- A guest can't raise a hand: that needs a data grant for guests, which is the API's to decide.
- No queue order of hands, and no auto-lower when the person speaks.
