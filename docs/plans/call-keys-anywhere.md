# The call's keys from every view, as its switches there allow

> 2026-10-14 · `evaluacion-2026-10-13/informe-comandos-20.md`, proposal A. Luis: «haz la propuesta A».

## What was measured

- In a call, from Tasks, the header holds the call's switches (the mini dock: microphone, Leave; the camera and the
  screen while they are on). Ctrl+D did nothing there; on the Studio view it mutes. The palette offered no microphone,
  camera or Leave outside the Studio view. `MiniDock.tsx` said so on purpose: «The room's keys work only on the stage».
- The rule behind it: nothing starts sending out of the room. Outside the room the camera and the screen only turn
  off; the microphone's switch there goes both ways (it is the same Toggle as the dock's).

## What changes

- **Wherever the call's switches show beyond the dock**, their keys and commands come with them. That is the mini
  dock (every project view but the Studio view) and the places' bar (Home, Personal, Work, the call kept):
  - **Microphone** on Ctrl+D (⌘D), both ways, as its switch there goes: «Microphone off» / «Microphone on».
  - **Camera off** on Ctrl+E, offered only while the camera is on. With it off, Ctrl+E starts nothing.
  - **Stop sharing the screen** on Ctrl+Shift+E, offered only while sharing. With no share, it starts nothing.
  - **Leave the room** in the palette (no key), as the switch beside them.
- The switches' tips there now show the keys, as the dock's do on the stage.
- Unchanged: joining is the room's (Ctrl+J only on the stage: a join sends the microphone). Starting the camera or a
  share stays the room's. On the Studio view the stage keeps its own commands; the mini dock is not there, so
  nothing is offered twice. Inside a sheet the keys don't act, as before.

## Checks

- `call-commands.test.ts`: microphone on → «Microphone off» on `mod+d`, off → «Microphone on»; the camera offered only
  while on, as «Camera off», and its action only turns it off; the screen likewise; Leave only where it is given.
- `e2e/call-keys.spec.ts`:
  - In a call, from Tasks, Ctrl+D turns the header's microphone off and on again.
  - Ctrl+E with the camera off starts nothing.
  - With the camera turned on in the Studio view, Ctrl+E from Tasks turns it off.
  - The palette offers «Microphone off» and «Leave the room», and Enter on Leave leaves.
  - The header microphone's tip says its key.
- Prettier, type-aware lint, typecheck; CI as the run on record.
