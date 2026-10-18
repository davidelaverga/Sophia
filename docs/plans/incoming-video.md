# Others' cameras off, to save data or attention

> 2026-10-17 · the QoL queue, item 3 (Luis: «Sigue con lo que queda en la cola»). A call always received every camera,
> which costs data on a phone's connection and attention on a busy one. Studio only.

## What changes

- **«Show others’ cameras»** in the dock's Video settings, a switch beside «Mirror my video», on by default. Off:
  - this browser stops receiving the others' cameras;
  - their tiles keep their initials while some video is left (your own camera, a screen); with none, the room lists
    everyone, as a call without cameras does;
  - a screen someone shares still comes, since it's what the call is looking at;
  - your own camera is untouched: the others still see you.
- **On again,** the cameras come back.
- **For this call only:** the next call starts with the cameras on.
- **The room's connection** (`setIncomingVideo`) lets go of each camera it is subscribed to, and of each new one as it is
  published, then takes them back.

## Not here

- **On a phone in a call** the dock's device menus aren't there (#412). The switch goes in the People panel with the
  per-person volume, once #369 (the panel's host controls) is on main.

## Checks

- **`incoming-video.spec.ts`:**
  - with the others' cameras on, turning the switch off stops every camera coming, and the room lists everyone; on
    brings the cameras back;
  - with your own camera on, the others keep their tiles, with their initials and no video;
  - a shared screen stays while the cameras are off.
