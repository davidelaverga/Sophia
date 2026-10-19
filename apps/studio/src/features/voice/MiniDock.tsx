// The room from every other view: a small floating pill, so the room stays one click away and a live
// call keeps its microphone and leave within reach while you read goals or work. What goes wrong with the
// call (a failed join, a blocked microphone) is said here too, not only on the Studio stage.
//
// Whatever this person is sending is shown here with its off switch (CallSwitches): a camera or a shared screen is
// never on out of sight just because the view changed. Its keys come with it, as its switches here allow: the
// microphone both ways, the camera and the screen only off, Leave in the palette (docs/plans/call-keys-anywhere.md).
import { useEffect, useRef } from 'react'
import { Tip } from '@sophia/ui'
import { useCommands } from '../../app/useCommands.ts'
import { callCommands } from './call-commands.ts'
import { CallSwitches, sendingOf } from './CallSwitches.tsx'
import { DockNote, joinTip, TextMode } from './RoomDock.tsx'
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
 * Leaving from inside a sheet hands the focus to the sheet, not to the page behind it. `keys`: the mini dock's own, so
 * its switches' keys and commands are offered (a sheet's row offers none: the mini dock under it already does).
 */
export function RoomSwitches({
  room,
  side = 'top',
  keys = false,
}: {
  room: ProjectRoom
  side?: 'top' | 'bottom'
  keys?: boolean
}) {
  const me = room.participants.find((p) => p.local)
  const leave = () => {
    const sheet =
      document.activeElement instanceof HTMLElement ? document.activeElement.closest('[role="dialog"]') : null
    void room.leave({ pressed: true })
    if (sheet instanceof HTMLElement) sheet.focus()
  }
  const sending = sendingOf(me)
  const controls = {
    setMicrophone: (on: boolean) => void room.setMicrophone(on),
    setCamera: (on: boolean) => void room.setCamera(on),
    setScreenShare: (on: boolean) => void room.setScreenShare(on),
    leave,
  }
  useCommands(callCommands(sending, controls), keys)
  return (
    <CallSwitches
      sending={sending}
      controls={controls}
      textMode={{ on: room.textMode, onVoice: () => void room.setTextMode(false) }}
      keys={keys}
      side={side}
    />
  )
}

/**
 * In the header, what the dock says hangs under it where the door's lobby stands: its height (and the gap) is kept as
 * `--dock-notes-h` on the root, so the lobby starts under it (theme.css; Codex on #254). Floating, it says nothing.
 */
function useNotesHeight() {
  const notes = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = notes.current
    if (!el) return undefined
    const root = document.documentElement.style
    const keep = () => {
      const h = el.closest('.topbar') ? el.getBoundingClientRect().height : 0
      if (h > 0) root.setProperty('--dock-notes-h', `${String(Math.ceil(h) + 10)}px`)
      else root.removeProperty('--dock-notes-h')
    }
    keep()
    const sized = new ResizeObserver(keep)
    sized.observe(el)
    return () => {
      sized.disconnect()
      root.removeProperty('--dock-notes-h')
    }
  }, [])
  return notes
}

export function MiniDock({ room, looking, onOpen }: Props) {
  const live = room.status === 'live' || room.status === 'reconnecting'
  const note = room.mediaError ?? room.error
  const notes = useNotesHeight()
  return (
    <div className="mini-dock" role="group" aria-label="Project room" data-live={live || undefined}>
      {/* What the dock says, stacked by its own height: a note (a join or device error) first, her looking under it. */}
      <div className="dock-notes" ref={notes}>
        <DockNote note={note} className="dock-note mini-note" />
        <LookingIndicator text={looking} />
      </div>
      {live ? (
        <>
          <button type="button" className="pill has-tip" data-dock-key="room" onClick={onOpen}>
            <span className="pill-dot" data-live aria-hidden />
            In the room · {room.participants.length}
            <Tip label="Open the room" />
          </button>
          <RoomSwitches room={room} keys />
        </>
      ) : (
        <>
          <button
            type="button"
            className="pill has-tip"
            // Where text mode's pill hands the focus once pressed (TextMode).
            data-call-anchor
            // The same control before and after a join, whatever its words say (useDockFocus).
            data-dock-key="room"
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
