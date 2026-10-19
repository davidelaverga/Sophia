# «Mute everyone»: follow-ups to #369

> 2026-10-19 · two Codex P2s left on #369 (merged), from the follow-up list: «Add the slow-wait note to mute-all» and
> «Keep mute-all state mounted until the request settles». Luis 2026-10-18: «Todo trabajo nuevo que hagas ten en
> cuenta nuestro cuello de botella actual. Si se puede hacer en un pr, excelente o como veas, que alivie la presión
> pero hay que seguir trabajando». One small branch: Studio and its fixture only, no API.

## What was read (at `b89a5a962`)

- **A slow «Mute everyone» never says so.** While the request is on its way, `MuteEveryone` (`PeoplePanel.tsx:258`)
  only changes its label to «Muting everyone…» and waits. `useSlow` and `SLOW_NOTE` are imported (`:22`) and used only
  by a row's `Pending` (`:297`). A row's control says it is slow past 6 s. This press can sit for the write's whole
  90 s limit (`WRITE_TIMEOUT_MS`) without a word.
- **A refusal after the microphones went off is never said.** `:268` returns nothing as soon as no one else's
  microphone is on, before it reads `state`. The component stays mounted (the return is inside it, so Codex's
  «unmounts» is now «renders nothing»), but `setState('failed')` at `:273` then draws nothing, and the alert at `:288`
  never shows. It happens for real:
  - the API's mute-all records its act only after the room server has acted (`recordedIfDone`,
    `apps/api/src/routes/host-acts.ts:11`). A failed record answers with an error while every microphone is already
    off. A mute-all that fails partway (`PartialMute`) can leave none on either.
  - LiveKit can report the last microphone off before the HTTP answer arrives. While the request is still on its way,
    the waiting press goes with it.
- **The fixture can't hold a mute-all.** `mutedAll` (`fixture-api.ts:551`) ignores `hostHeld`, which `hostAct` honours
  (`:572`). Its only failure, `failHost`, refuses before anyone is muted.

## What changes

- **`PeoplePanel.tsx`, `MuteEveryone`:**
  - `useSlow(state === 'sending')` is called before any return, so the hooks keep their order. Past 6 s a status line
    under the press says `SLOW_NOTE`, in a row's waiting style (`.person-pending`).
  - It draws nothing only at rest with no one else's microphone on. On its way, the waiting press stays, even if every
    microphone went off meanwhile.
  - Refused with no microphone left on: the alert alone. A press with nothing to mute would do nothing. Refused with a
    microphone still on: the press and the alert, as before.
- **`fixture-api.ts`, `mutedAll` only:**
  - it honours `hostHeld` as `hostAct` does: the microphones go off when the reply is let through.
  - a new `failAfterMuteAll` flag next to `failHost`: the next mute-all mutes everyone, then answers 503, as the API
    does when its record fails after the room server acted.
- **`room.tsx`:** `window.fixture.failAfterMuteAll()` sets that flag (one entry beside `failHost` in the type, the
  project and `window.fixture`). It stays away from #468's hunks in that file.

## Checks, written first (`host-controls.spec.ts`)

- «Mute everyone» past six seconds says it is slow: held (`holdHost`), the clock moved 6.5 s
  (`page.clock.fastForward`), and a status in the panel's head reads `SLOW_NOTE`. Let through, both microphones go off
  and the note goes.
- «Mute everyone» refused after the microphones went off still says so: with `failAfterMuteAll`, both microphones go
  off, «Couldn’t mute everyone. Try again.» shows, and no «Mute everyone» press is left.
- `room-people.spec.ts` stays as it is (#468 changes it).

## Limits

- The words stay «Couldn’t mute everyone. Try again.». With no microphone left on there is nothing to press again;
  once one comes on, the press comes back beside the alert. The API doesn't say how far it got, so the panel shows
  each microphone as LiveKit reports it.
- An answer that leaves no microphone on removes the press that held the focus, so the focus drops to the page. That
  already happens on success, and before this change the whole head went on a refusal too. Not changed here.
- Closing the side panel keeps what it says: its bodies stay mounted, hidden (`SidePanel.tsx:134`).
