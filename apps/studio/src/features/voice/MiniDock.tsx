// The room from every other view: a small floating pill, so the room stays one click away and a live
// call keeps its microphone and leave within reach while you read goals or work. What goes wrong with the
// call (a failed join, a blocked microphone) is said here too, not only on the Studio stage.
//
// Whatever this person is sending is shown here with its off switch (CallSwitches): a camera or a shared screen is
// never on out of sight just because the view changed. The room's keys work only on the stage, so these tips show none.
import { Tip } from '@sophia/ui'
import { CallSwitches, sendingOf } from './CallSwitches.tsx'
import { joinTip, TextMode } from './RoomDock.tsx'
import { LookingIndicator } from './SophiaControls.tsx'
import type { ProjectRoom } from './useProjectRoom.ts'

interface Props {
  room: ProjectRoom
  /** What Sophia is looking at, in words: the indicator stays visible from every view. */
  looking: string | null
  onOpen: () => void
}

/**
 * The call's switches beyond the dock, Leave included: the mini dock's, and a sheet's while it covers them (SheetCall).
 * Leaving from inside a sheet hands the focus to the sheet, not to the page behind it.
 */
export function RoomSwitches({ room, side = 'top' }: { room: ProjectRoom; side?: 'top' | 'bottom' }) {
  const me = room.participants.find((p) => p.local)
  const leave = () => {
    const sheet =
      document.activeElement instanceof HTMLElement ? document.activeElement.closest('[role="dialog"]') : null
    void room.leave({ pressed: true })
    if (sheet instanceof HTMLElement) sheet.focus()
  }
  return (
    <CallSwitches
      sending={sendingOf(me)}
      controls={{
        setMicrophone: (on) => void room.setMicrophone(on),
        setCamera: (on) => void room.setCamera(on),
        setScreenShare: (on) => void room.setScreenShare(on),
        leave,
      }}
      textMode={{ on: room.textMode, onVoice: () => void room.setTextMode(false) }}
      keys={false}
      side={side}
    />
  )
}

export function MiniDock({ room, looking, onOpen }: Props) {
  const live = room.status === 'live' || room.status === 'reconnecting'
  const note = room.mediaError ?? room.error
  return (
    <div className="mini-dock" role="group" aria-label="Project room" data-live={live || undefined}>
      <LookingIndicator text={looking} />
      {note && (
        <p className="dock-note mini-note" role="alert">
          {note}
        </p>
      )}
      {live ? (
        <>
          <button type="button" className="pill has-tip" onClick={onOpen}>
            <span className="pill-dot" data-live aria-hidden />
            In the room · {room.participants.length}
            <Tip label="Open the room" />
          </button>
          <RoomSwitches room={room} />
        </>
      ) : (
        <>
          <button
            type="button"
            className="pill has-tip"
            // Where text mode's pill hands the focus once pressed (TextMode).
            data-call-anchor
            disabled={room.status === 'joining' || !room.ready}
            onClick={() => void room.join()}
          >
            <span className="pill-dot" aria-hidden />
            {room.status === 'joining' ? 'Joining…' : room.status === 'failed' ? 'Try again' : 'Join the room'}
            <Tip label={joinTip(room.textMode)} />
          </button>
          <TextMode on={room.textMode} onVoice={() => void room.setTextMode(false)} />
        </>
      )}
    </div>
  )
}
