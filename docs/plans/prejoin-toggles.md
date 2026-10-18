# The microphone and the camera, chosen before joining

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.6): the check before joining
> (device-check.md) shows the picture and the meter and lets a device be chosen, but not whether to join muted or with
> the camera on. Meet, Zoom and Teams all put both switches on the picture. The call starts with the last microphone
> choice made on this device (`mic-preference.ts`) and the camera off, and the only way to change that is to join first.
> Luis's queue, item 3.

## What changes

- **`DeviceCheck`:** on the picture, «Microphone» and «Camera» switches, each with `aria-pressed`.
  - The microphone starts as the next join would: this device's last choice, on by default.
  - The camera starts off, as a join does today.
  - The preview follows them: an off track is disabled, so the meter rests and the picture says «Your camera is off».
    Nothing is asked of the browser again.
  - The microphone's choice is kept as the dock's own is (`rememberMic`), so the next join and the Join tip follow it.
  - With access refused, the picture only says how to give it: there is nothing to check, and the join keeps the
    last microphone choice.
- **Join** from the sheet enters with that microphone, then turns the camera on when it was chosen.

## Checks

- `device-check.spec.ts`:
  - the switches start as the join would;
  - turning the microphone off rests the meter, and turning the camera on shows its picture;
  - Join enters muted, with the camera on.
