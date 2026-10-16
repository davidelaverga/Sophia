# A phone chooses its devices too

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, the room). On a phone, the dock hid every device
> opener, beside the microphone, the camera and Join (`call-devices.md`: «on a phone the dock keeps its one row»). A
> phone could not choose its camera, front or back, nor check its audio and video before joining. Studio only.

## What changes

- **In the call, on a phone:** one opener beside the camera, «Device settings». It lists in one menu what the two
  openers list on a desktop: the microphones, the cameras (a phone's front and back), the speakers where the browser
  lets a page choose, the background and the mirror. One narrow tab keeps the dock to its one row.
  - On a phone the share-screen square is absent (`getDisplayMedia` isn't there), which leaves the room.
  - On a desktop nothing changes: two openers, «Audio settings» and «Video settings».
- **Before joining, on a phone:** «Check audio and video» stands beside Join again. Before the call the dock has only
  Join and its opener, so there is room.
- A camera chosen from the menu is the flip: the call switches to it at once, as on a desktop.

## Checks

- **`call-devices.spec.ts` (`@phone`, replacing «no device openers»):**
  - in the call, «Device settings» stands beside the camera and the desktop's two openers don't;
  - it lists Microphone, Camera and Speaker;
  - choosing the desk camera switches to it;
  - the dock is still one row;
  - before joining, «Check audio and video» opens the check.
