// The bar over the three places (direction C), built as a project's bar is (`.topbar`, the mark, `.segmented`, the
// account), so the two halves share one bar: the mark goes home; the switch shows the three places, all visible, with
// Personal's padlock when it is shut; on the right, the room you're in (back to it, its switches, Leave), who can see
// where you are (nothing at home, where the line with the lock says it), and your account.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Icon, Tip, Segmented } from '@sophia/ui'
import { AccountMenu, type AccountActions } from '../../app/AccountMenu.tsx'
import type { Identity } from '../../app/dev-identity.ts'
import type { Place } from '../../app/route.ts'
import { usePopover } from '../../app/usePopover.ts'
import { CallSwitches, type Sending } from '../voice/CallSwitches.tsx'
import { LookingIndicator } from '../voice/SophiaControls.tsx'
import { LOCK_TIP, WHO_SEES } from './places-view.ts'
import { Mark } from '../../app/Mark.tsx'

export interface InCall {
  title: string
  /** What this person sends: whatever is on shows here with its off switch (nothing sends out of sight). */
  sending: Sending
  /** Text mode while it holds: said here too, and one press goes back to voice. */
  textMode: boolean
  /** What Sophia is looking at, in words, or null. */
  looking: string | null
  /** What stopped a device in the call, in words, or null. */
  note: string | null
  /** Back to the project's room. */
  onReturn: () => void
  onLeave: () => void
  onMicrophone: (on: boolean) => void
  onCamera: (on: boolean) => void
  onScreen: (on: boolean) => void
  onVoice: () => void
}

interface Props {
  place: Place
  locked: boolean
  /** Notes carried since Work was last open: on a phone the Work switch counts them. */
  newInWork: number
  identity: Identity
  call: InCall | null
  chip: { open: boolean; set: (open: boolean) => void }
  actions: AccountActions & { go: (place: Place) => void; lockNow: () => void }
}

const SWITCH: ReadonlyArray<{ place: Place; name: string; key: string }> = [
  { place: 'home', name: 'Home', key: 'H' },
  { place: 'personal', name: 'Personal', key: 'P' },
  { place: 'work', name: 'Work', key: 'W' },
]

function Switch({
  place,
  locked,
  newInWork,
  go,
}: Pick<Props, 'place' | 'locked' | 'newInWork'> & { go: Props['actions']['go'] }) {
  return (
    <Segmented
      role="group"
      label="Places"
      className="places-switch"
      items={SWITCH.map((s) => ({
        id: s.place,
        name: s.name,
        label:
          s.place === 'home' ? (
            <>
              <span className="seg-t">Home</span>
              <span className="seg-i" aria-hidden>
                <Icon name="home" size={14} />
              </span>
            </>
          ) : (
            <>
              {s.place === 'personal' && (
                <span className="seg-lock" aria-hidden>
                  <Icon name="lock" size={12} />
                </span>
              )}
              <span>{s.name}</span>
            </>
          ),
        tip: { label: s.name, keys: s.key, side: 'bottom' },
        ...(s.place === 'personal' && locked && { className: 'locked' }),
        data: { place: s.place, ...(s.place === 'work' && newInWork ? { new: `${newInWork} new` } : {}) },
      }))}
      value={place}
      onChange={go}
    />
  )
}

/**
 * In a room: the bar says so. Back to it, and the call's switches and Leave, the same as the mini dock's. Under it, what
 * the call's dock would say: what Sophia is looking at, and what stopped a device. These are the copies a screen reader
 * hears: the dock's own are inside the project kept out of sight.
 */
function RoomPill({ call }: { call: InCall }) {
  return (
    <>
      <CallPill call={call} />
      {(call.looking ?? call.note) && (
        <div className="room-pill-notes">
          <LookingIndicator text={call.looking} />
          {call.note && (
            <p className="dock-note" role="alert">
              {call.note}
            </p>
          )}
        </div>
      )}
    </>
  )
}

/**
 * The pill goes when the call ends, however it ends (Leave, another tab taking the call, a lost connection): a focus
 * inside it goes to the bar's mark, which stays, never to the page (where the next letter would be a place's key).
 */
function useFocusAfterCall(pill: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = pill.current
    return () => {
      if (!el?.contains(document.activeElement)) return
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.places-bar .mark')?.focus({ preventScroll: true }),
      )
    }
  }, [pill])
}

function CallPill({ call }: { call: InCall }) {
  const pill = useRef<HTMLDivElement>(null)
  useFocusAfterCall(pill)
  return (
    <div ref={pill} className="room-pill" role="group" aria-label="Your call">
      <span className="live" aria-hidden />
      <button type="button" className="t has-tip" onClick={call.onReturn}>
        In {call.title}
        <Tip label="Open the room" side="bottom" />
      </button>
      <CallSwitches
        sending={call.sending}
        controls={{
          setMicrophone: call.onMicrophone,
          setCamera: call.onCamera,
          setScreenShare: call.onScreen,
          leave: call.onLeave,
        }}
        textMode={{ on: call.textMode, onVoice: call.onVoice }}
        keys={false}
        side="bottom"
      />
    </div>
  )
}

interface ChipProps {
  place: Place
  chip: Props['chip']
  onLock: () => void
  onPrivacy: () => void
}

/** Who can see where you are, as a button: a tap explains it on any screen, and in Personal offers to lock. */
function PrivacyChip({ place, chip, onLock, onPrivacy }: ChipProps) {
  const pop = usePopover(chip.open, () => chip.set(false))
  // How privacy works opens a sheet: the chip takes the focus first, so the sheet gives it back there.
  const privacy = () => {
    pop.opener.current?.focus()
    onPrivacy()
  }
  const who = place === 'work' ? WHO_SEES.work : WHO_SEES.personal
  return (
    <div ref={pop.wrap} className="chip-wrap" hidden={place === 'home'}>
      <button
        ref={pop.opener}
        className={`chip-private${place === 'work' ? ' team' : ''}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={chip.open}
        aria-label={who.name}
        onClick={() => chip.set(!chip.open)}
      >
        <Icon name="lock" size={12} />
        <span className="t">{who.chip}</span>
      </button>
      {chip.open && (
        <div ref={pop.panel} className="popover chip-pop" role="dialog" aria-label={who.name} onKeyDown={pop.onKeyDown}>
          <p>{who.says}</p>
          <div className="row">
            {place !== 'work' && (
              <button className="pill has-tip" type="button" onClick={onLock}>
                Lock now
                <Tip label={LOCK_TIP.open.label} side="bottom" />
              </button>
            )}
            <button className="text-button" type="button" onClick={privacy}>
              How privacy works
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PlacesBar(props: Props) {
  const { place, locked, newInWork, identity, call, chip, actions } = props
  return (
    <header className="topbar places-bar">
      <button type="button" className="mark has-tip" aria-label="Home" onClick={() => actions.go('home')}>
        <Mark />
        <span className="mark-word">Sophia</span>
        <Tip label="Home" keys="H" side="bottom" />
      </button>
      <Switch place={place} locked={locked} newInWork={newInWork} go={actions.go} />
      <div className="topbar-end">
        {call && <RoomPill call={call} />}
        <PrivacyChip place={place} chip={chip} onLock={actions.lockNow} onPrivacy={actions.privacy} />
        <AccountMenu identity={identity} where="places" actions={actions} />
      </div>
    </header>
  )
}
