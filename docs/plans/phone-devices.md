# A phone chooses its devices too

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, the room). On a phone, the dock hid every device
> opener, beside the microphone, the camera and Join (`call-devices.md`: «on a phone the dock keeps its one row»). A
> phone could not choose its camera, front or back, nor check its audio and video before joining. Studio only.

## What changes

- **Before joining, on a phone:** «Check audio and video» stands beside Join again. Before the call the dock has only
  Join and its check, so there is room.
  - Its sheet chooses the microphone and the camera, a phone's front or back, and Join opens the call with them.
- **In the call, on a phone:** unchanged. The dock keeps its one row of 42 px squares (`room-dock.spec.ts`).
  - A first try put one «Device settings» opener beside the camera. It broke that row, wrapping to two in the fixture,
    where the share-screen square shows.
  - Switching the camera during a call wants its own place, as Meet's flip on your own tile. It stays a follow-up.
- On a desktop nothing changes.

## Checks

- **`call-devices.spec.ts` (`@phone`):**
  - in the call, the dock still has no device openers;
  - before joining, the check stands beside Join, chooses the desk camera, and the call opens with it
    (`devicesOnJoin`).
