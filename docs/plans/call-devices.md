# A person chooses their microphone, speaker and camera

> 2026-10-15 · Luis asked whether a person can pick their audio and video devices and blur their background, as Google
> Meet does. Neither existed; «Procede». This is the first of three pieces: the devices. The second is a check before
> joining (a camera preview and a voice meter). The third is backgrounds.

## What was measured

- The call turns the microphone, the camera and a shared screen on and off (`livekit-room.ts`), always on the browser's
  default device. Nothing in the Studio lists devices (`enumerateDevices`, `deviceId`, `setSinkId`,
  `switchActiveDevice`: none).
- A join starts in six places: the dock's Join, the stage, the mini dock, the room's key, Work's «Join the room» and a
  typed chat. 25 browser checks press Join and expect the call.

## What changes

- **A narrow opener beside each switch** in the dock, the kit's menu over it, like Meet's arrow beside its buttons:
  - beside the microphone, **Audio settings** lists the microphones and the speakers;
  - beside the camera, **Video settings** lists the cameras;
  - beside Join, **Audio and video settings** lists all three, so a choice is made before the call.
- **The device in use is marked:** the chosen one while it is plugged in, else the browser's default, else the first.
  The menu reads the devices when it opens and again when one is plugged in or out.
- **A choice switches the call at once** (`room.switchActiveDevice`) and is kept on this device for the next call
  (`sophia.devices.v1`). LiveKit opens the next call's devices with it, and falls back to another device when it has
  gone. A switch the browser refuses says so in the dock's note.
- **What the browser can't do isn't offered:**
  - a speaker only where media elements can choose their output (`setSinkId`: Chrome and Edge, not Safari);
  - with access refused, the menu says how to give it and offers nothing to press.
- **Join stays one press.** Making every join two steps would change six entry points and their keys for what the
  opener beside Join already gives. The check before joining comes with the second piece.
- **On a phone the dock keeps its one row:** the openers don't show there.
- The names say «settings», never «Microphone» or «Camera», so a check finding the switches by name finds only them.

## Checks

- `device-preference.test.ts`:
  - each kind's choice kept apart;
  - unreadable storage reads as nothing chosen;
  - which device is in use;
  - names while the browser keeps its labels back.
- `call-devices.spec.ts` on the room's fixture, whose fake LiveKit lists two of each:
  - the audio menu marks the device in use, and a choice switches the call and is marked next time;
  - a camera chosen before joining is the one the call opens with, after a reload too;
  - no speaker where the browser can't choose one;
  - with access refused, the menu says how to give it;
  - a refused switch is said in the dock;
  - a phone shows no openers.

## Left

- The mini dock and the places' bar keep their switches without openers: the dock is where a call is set up.
- On a phone, choosing between the front and back camera.
