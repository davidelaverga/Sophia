// The bar over the three places (direction C): the mark goes home; the switch shows the three places, all visible, with
// Personal's padlock when it is shut; on the right, the room you're in (back to it, or leave), who can see where you
// are (nothing at home, where the line with the lock says it), and your account.
import { useEffect, useRef } from 'react'
import { Icon, Tip } from '@sophia/ui'
import type { Identity } from '../../app/dev-identity.ts'
import type { Place } from '../../app/route.ts'
import { AccountMenu } from './AccountMenu.tsx'
import { HomeMark, LockShut } from './icons.tsx'

export interface InCall {
  title: string
  /** What this person sends: whatever is on shows here with its off switch (nothing sends out of sight). */
  sending: { microphone: boolean; camera: boolean; screen: boolean }
  /** Back to the project's room. */
  onReturn: () => void
  onLeave: () => void
  onMicrophone: (on: boolean) => void
  onCamera: (on: boolean) => void
  onScreen: (on: boolean) => void
}

interface Layers {
  chip: boolean
  menu: boolean
  setChip: (open: boolean) => void
  setMenu: (open: boolean) => void
}

interface Props {
  place: Place
  locked: boolean
  /** Notes carried since Work was last open: on a phone the Work switch counts them. */
  newInWork: number
  identity: Identity
  call: InCall | null
  layers: Layers
  actions: {
    go: (place: Place) => void
    lockNow: () => void
    privacy: () => void
    data: () => void
    chooseDev: (identity: Identity | null) => void
    signOut: () => void
  }
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
}: Pick<Props, 'place' | 'locked' | 'newInWork'> & { go: (p: Place) => void }) {
  return (
    <div className="seg" role="group" aria-label="Space">
      {SWITCH.map((s) => (
        <button
          key={s.place}
          type="button"
          className={`has-tip${s.place === 'personal' && locked ? ' locked' : ''}`}
          data-place={s.place}
          data-new={s.place === 'work' && newInWork ? `${newInWork} new` : undefined}
          aria-pressed={place === s.place}
          aria-label={s.name}
          onClick={() => go(s.place)}
        >
          {s.place === 'personal' && <LockShut className="seg-lock" width={2} />}
          {s.place === 'home' ? (
            <>
              <span className="seg-t">Home</span>
              <HomeMark className="seg-i" />
            </>
          ) : (
            <span>{s.name}</span>
          )}
          <Tip label={s.name} keys={s.key} side="bottom" />
        </button>
      ))}
    </div>
  )
}

/** In a room: the bar says so. Back to it, the microphone and anything else being sent, and Leave, one tap each. */
function RoomPill({ call }: { call: InCall }) {
  const { sending } = call
  return (
    <span className="room-pill" role="group" aria-label={`In ${call.title}`}>
      <span className="live" aria-hidden />
      <button type="button" className="t" onClick={call.onReturn} aria-label={`Back to ${call.title}`}>
        In {call.title}
      </button>
      <button
        type="button"
        className="sw"
        aria-pressed={sending.microphone}
        aria-label={sending.microphone ? 'Microphone on: mute' : 'Microphone off: unmute'}
        onClick={() => call.onMicrophone(!sending.microphone)}
      >
        <Icon name={sending.microphone ? 'mic' : 'micOff'} size={12} />
      </button>
      {sending.camera && (
        <button
          type="button"
          className="sw"
          aria-pressed
          aria-label="Camera on: turn it off"
          onClick={() => call.onCamera(false)}
        >
          <Icon name="camera" size={12} />
        </button>
      )}
      {sending.screen && (
        <button
          type="button"
          className="sw"
          aria-pressed
          aria-label="Sharing your screen: stop"
          onClick={() => call.onScreen(false)}
        >
          <Icon name="screen" size={12} />
        </button>
      )}
      <button type="button" className="leave" onClick={call.onLeave} aria-label={`Leave ${call.title}`}>
        Leave
      </button>
    </span>
  )
}

/** Who can see where you are, as a button: a tap explains it on any screen, and in Personal offers to lock. */
function PrivacyChip({ place, layers, actions }: Pick<Props, 'place' | 'layers' | 'actions'>) {
  const pop = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const work = place === 'work'
  useEffect(() => {
    if (layers.chip) pop.current?.querySelector('button')?.focus()
  }, [layers.chip])
  const close = () => {
    layers.setChip(false)
    chip.current?.focus()
  }
  return (
    <div className="acct chip-wrap" hidden={place === 'home'}>
      <button
        ref={chip}
        className={`chip-private${work ? ' team' : ''}`}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={layers.chip}
        aria-label={work ? 'Who can see Work' : 'Who can see your personal space'}
        onClick={() => layers.setChip(!layers.chip)}
      >
        <LockShut width={2} />
        <span className="t">{work ? 'Your team' : 'Only you'}</span>
      </button>
      {layers.chip && (
        <div
          ref={pop}
          className="menu chip-pop"
          role="dialog"
          aria-label="Who can see this"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            close()
          }}
        >
          <p>
            {work
              ? 'Everyone in these projects sees what’s here, including what you carried over.'
              : 'Only you can see this space. Your projects, their members and the team’s Sophia can’t read it.'}
          </p>
          <div className="row">
            {!work && (
              <button className="btn" type="button" onClick={actions.lockNow}>
                Lock now <kbd>L</kbd>
              </button>
            )}
            <button className="link" type="button" onClick={actions.privacy}>
              How privacy works
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function PlacesBar(props: Props) {
  const { place, locked, newInWork, identity, call, layers, actions } = props
  return (
    <div className="appbar">
      <div className="left">
        <button className="home-btn has-tip" type="button" aria-label="Home" onClick={() => actions.go('home')}>
          <span className="dot" aria-hidden />
          <span className="word">Sophia</span>
          <Tip label="Home" keys="H" side="bottom" />
        </button>
      </div>
      <Switch place={place} locked={locked} newInWork={newInWork} go={actions.go} />
      <div className="right">
        {call && <RoomPill call={call} />}
        <PrivacyChip place={place} layers={layers} actions={actions} />
        <AccountMenu identity={identity} open={layers.menu} onOpen={layers.setMenu} actions={actions} />
      </div>
    </div>
  )
}
