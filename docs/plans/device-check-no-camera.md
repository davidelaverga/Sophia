# The check says when there is no camera, or another app holds it, and still checks the microphone

> 2026-10-18 · Luis: «Que más podemos ir haciendo en lo qe esperamos. Ya que tenemos un cuello de botella» · seam #5 of
> the seams report (evaluacion-2026-10-18/experiencia/costuras.md), after [device-check](device-check.md). Studio only;
> no API. 2026-10-19: two reviewers' P2, the same finding, under «The line lasts only while it is true».

## What was measured

- **Every refusal reads as a permission to give** (`useDevicePreview.ts`): any rejection of the check's request sets
  `{ state: 'refused' }` and drops the browser's reason.
- **The microphone goes with the camera** (`device-check.ts` `previewConstraints`): one request asks for both. A
  request is all or nothing (the Media Capture spec), so a PC without a webcam loses the microphone's check too.
- **What the sheet shows then** (`DeviceCheck.tsx`): «Allow the camera and microphone in your browser’s site settings
  to check them here.» The picture and its switches go. The meter stays drawn but never moves: the brief said it was
  hidden, and the code keeps it in the Microphone row, at 0. Nothing is blocked, so the line sends the person to
  settings that have nothing to change.
- **In a call the reasons are already told apart** (`room-view.ts` `mediaMessage`): NotAllowedError, NotFoundError and
  NotReadableError each have their own words.
- **The fixture has one lever** (`e2e/device-check.spec.ts`'s stand-in for `getUserMedia`, not `room.html`):
  `gum=refuse` turns down every request with NotAllowedError.

## What changes

- **No camera** (the request turned down with NotFoundError, or OverconstrainedError): the sheet asks again for the
  microphone alone, as chosen, so the meter moves. The picture's place says «No camera found, so this checks your
  microphone only.»
- **The camera busy** (NotReadableError, or AbortError): the sheet asks for the microphone alone too. The line is
  «Another app is using your camera. Close it to see yourself here; you can still join.»
- **The site-settings words stay for NotAllowedError alone**, as today, and nothing is asked again. A second prompt
  right after a refusal would be a nag.
- **If the microphone alone fails too,** the camera can't be blamed. Its own refusal keeps the site-settings words.
  Anything else says «The camera and microphone couldn’t start here. You can still join.» An unknown reason for both
  says the same: no more settings to visit when nothing says there is one.
- **One line, never two.** It takes the picture's place, and «Your camera is off» doesn't show under it. It is a status
  (role=status), so a screen reader hears it without the focus moving. No toast and no memory: the line is the sheet's
  own state, said each time it opens while it is true.
- **With the microphone checked alone,** its switch stays on the picture. The camera's switch goes, since there is no
  picture for it to turn on. Join still enters, with the camera as chosen (off, as the sheet opens).
- **The line lasts only while it is true** (reviewers' P2, 2026-10-19). Before, the request was made again only when
  a device was chosen. So «Close it to see yourself here» led nowhere: after closing the other app, the line stayed
  until the sheet was opened again. A webcam plugged in showed up in the Camera row, under «No camera found».
  - With the camera busy, the check asks for the camera and microphone again when the person comes back to the page:
    the window's focus, or the tab shown again. Closing the other app means leaving the browser and coming back.
  - With no camera, it asks again when a device is plugged in or out (devicechange), as the Camera row already re-reads.
  - Once per answer: one return that the browser reports twice asks once. If the camera is still held, the line stays,
    and the next return asks again.
  - A refusal, or the line for both failing, asks nothing on its own, since that would prompt.
  - With the camera back, the line goes and the picture shows as when the sheet opens: the camera off, as the join
    starts, with its switch on the picture.
  - `cameraBackOn(name)` in `device-check.ts` says which reason listens for what. The live preview keeps the browser's
    reason beside its line.
- **Closing the sheet before the first answer** asks nothing more, so no prompt for the microphone shows after the
  sheet has gone.
- **The words live in `device-check.ts`** as `previewMessage(name, micChecked)`, beside the constraints: the mirror of
  `mediaMessage`. `asksMicAlone(name)` says which reasons ask again, and `micConstraints(chosen)` is the microphone
  alone, as `previewConstraints` asks for it.

## Checks, written first

- **`device-check.test.ts`** (unit):
  - each reason's line: NotFoundError and OverconstrainedError with the microphone checked, NotReadableError and
    AbortError the same, NotAllowedError, and both unattributed;
  - only a missing or busy camera asks again, never a refusal or an unknown reason;
  - the microphone alone is asked for as chosen, else the default;
  - `cameraBackOn`: a busy camera listens for the return and a missing one for a plug; a refusal or an unknown reason
    listens for nothing.
- **`device-check.spec.ts`** (e2e). Two new levers in the stand-in, beside `gum=refuse`: `gum=nocamera` turns down any
  request with video with NotFoundError, and `gum=busy` with NotReadableError. Both use Chrome's own messages.
  - With `gum=nocamera`: the line, as a status, the only one on the picture. A second request for audio alone, and a
    meter that moves. The microphone's switch and no camera's switch. Join enters.
  - With `gum=busy`: the busy line, no «site settings», and the meter moves.
  - Control, `gum=refuse`: today's words, and one request only. A return to the page or a plug asks nothing.
  - The stand-in frees the camera when a test sets `checkMedia.camera = null`: the other app closed, or one plugged in.
    The tests dispatch the window's `focus`, the document's `visibilitychange` and `devicechange` themselves.
  - With `gum=busy`: a return while the camera is still held asks again and keeps the line. After the camera is freed,
    a return heard twice asks once, the line goes, and the picture has its track and the camera's switch.
  - With `gum=nocamera`: a camera plugged in takes the line's place with its picture.

## Limits

- A camera that is there while the microphone is missing reads as both unattributed. Telling that apart needs a
  request for the camera alone. That is a second line for a rarer case.
- A camera refused while the microphone is allowed still says the site-settings words without asking for the
  microphone alone: the same nag as above.
- Chrome on Windows' error names weren't observed here. The levers use the names the spec gives and Chrome's messages.
- A camera freed while the person stays on the page (the other app's call ends on its own) shows at the next return,
  or the next time the sheet opens. A return before the previous answer is in isn't heard.
- In a browser that asks for each request instead of keeping the answer, the return after closing the other app can
  show its prompt again.
- Without a camera, any device plugged in or out asks again. If none of them is a camera, that is one more request for
  the microphone, with no prompt once it is allowed.
