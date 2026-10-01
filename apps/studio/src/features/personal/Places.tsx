// The three places outside a project (direction C, "Two doors"): home with its two doors, the personal space and the
// work space, under one bar. One place in three states: a door grows into its space and shrinks back into itself, and
// the hairline with the lock is always at the edge you crossed. This component owns what is open over the places (the
// notes, the sheets, the small menus) and wires the keys; the places render; the words come from the view modules. The
// toast is the app's (SignedIn), so a result is said the same way in a project and here.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PersonalSpace as Space, ProjectRelease, ProjectSummary } from '@sophia/contracts'
import { accountOf, tokenSubject } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useDocumentTitle } from '../../app/document-title.ts'
import { initialOf } from '../../app/profile.ts'
import type { Place } from '../../app/route.ts'
import { modalOnScreen, useShortcuts } from '../../app/shortcuts.ts'
import type { ShowToast } from '../../app/Toast.tsx'
import { DataSheet } from './DataSheet.tsx'
import { focusConversation, focusNotesToggle, focusPersonalSwitch, placesAccount } from './focus.ts'
import { HomeDoors } from './HomeDoors.tsx'
import { OPEN, lockedBy, shut, type Lock } from './lock.ts'
import { NOTICE } from './notice-view.ts'
import { PlaceDialogs } from './PlaceDialogs.tsx'
import { PlacesBar, type InCall } from './PlacesBar.tsx'
import { PersonalSpace } from './PersonalSpace.tsx'
import { dateLine, firstName, greeting, PLACE_TITLE, READ_FAILED, readState, workDoor, youDoor } from './places-view.ts'
import type { Read } from './ReadNotes.tsx'
import { useEscape } from './useEscape.ts'
import { usePersonalSpace, usePersonalWrites, useProjects, type PersonalWrites } from './usePersonal.ts'
import { usePlaceMotion } from './usePlaceMotion.ts'
import { WorkSpace } from './WorkSpace.tsx'
import { personalFailure } from './write-words.ts'
import './personal.css'

/** A sheet asked for from outside the places (a project's account menu): it opens once the person is home. */
export type Opening = 'data' | 'privacy'

export interface PlacesProps {
  place: Place
  identity: Identity
  lock: Lock
  setLock: (lock: Lock) => void
  /** The padlock as stored this moment (useLock), for what arrives later: a copy's export. */
  lockedNow: () => boolean
  /** The room this person is in, if any: the bar shows it, and Personal stays locked while it lasts. */
  call: (InCall & { projectId: string }) | null
  toast: ShowToast
  opening: Opening | null
  onOpened: () => void
  /** `replace`: take this history entry's place (a place that can't be shown, which Back must not land on again). */
  onGo: (place: Place, replace?: boolean) => void
  onOpenProject: (projectId: string, join: boolean) => void
  onChooseDev: (identity: Identity | null) => void
  onSignOut: () => void
}

const ANNOUNCE: Record<Place, string> = {
  home: 'Home',
  personal: 'Personal space. Only you can see it.',
  work: 'Work. Shared with your team.',
}

const flagKey = (identity: string, flag: string) => `sophia.personal.${flag}.v1.${identity}`
function readFlag(identity: string, flag: string): string | null {
  try {
    return localStorage.getItem(flagKey(identity, flag))
  } catch {
    return null
  }
}
function writeFlag(identity: string, flag: string, value: string): void {
  try {
    localStorage.setItem(flagKey(identity, flag), value)
  } catch {
    // storage unavailable: the page forgets it on reload
  }
}

/** A clock that moves every 20 s: "starts in 12 min" counts down, and a session about to start becomes the verb. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

interface Unlock {
  /** Where to go once the person confirmed it's them: they arrive where they asked, and aren't asked again. */
  after: (() => void) | null
}

/** What is open over the places. The small menus close themselves (usePopover); navigating closes them too. */
function useLayers() {
  const [chip, setChip] = useState(false)
  const [earlier, setEarlier] = useState(false)
  const [notes, setNotes] = useState(false)
  const [data, setData] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [unlock, setUnlock] = useState<Unlock | null>(null)
  const [newProject, setNewProject] = useState(false)
  const closeMenus = useCallback(() => {
    setChip(false)
    setEarlier(false)
  }, [])
  return {
    chip,
    setChip,
    earlier,
    setEarlier,
    notes,
    setNotes,
    data,
    setData,
    privacy,
    setPrivacy,
    unlock,
    setUnlock,
    newProject,
    setNewProject,
    closeMenus,
  }
}

type Layers = ReturnType<typeof useLayers>

/** Notes carried since Work was last open (the edge and the phone's Work switch count them), marked new once there. */
function useCarried(place: Place) {
  const [unseen, setUnseen] = useState(0)
  const [pulse, setPulse] = useState(0)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    if (place === 'work') setUnseen(0)
    else setFresh(new Set())
  }, [place])
  return {
    unseen,
    pulse,
    fresh,
    add: (releaseId: string | null) => {
      setUnseen((n) => n + 1)
      setPulse((n) => n + 1)
      if (releaseId) setFresh((s) => new Set([...s, releaseId]))
    },
  }
}

type Carried = ReturnType<typeof useCarried>

/** Where to land after arriving: the door left, the conversation (focusConversation), or Work's heading. */
function focusOnArrival(place: Place, left: Place) {
  if (place === 'personal') {
    focusConversation()
    return
  }
  const door = place === 'home' ? document.querySelector<HTMLElement>(`[data-door="${left}"] .c2-main`) : null
  ;(door ?? document.getElementById(place === 'work' ? 'c-w-h' : 'c-p-h'))?.focus({ preventScroll: true })
}

function useArrival(place: Place) {
  const last = useRef<Place | null>(null)
  useEffect(() => {
    const left = last.current
    last.current = place
    if (left === null || left === place) return undefined
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => focusOnArrival(place, left), reduced ? 0 : 420)
    return () => clearTimeout(timer)
  }, [place])
}

/** Moving between the places, and the padlock. Personal behind a shut padlock asks the person to confirm it's them. */
function usePlaceNavigation(props: PlacesProps, layers: Layers) {
  const { place, lock, setLock, onGo, identity, toast } = props
  const arrive = useCallback(
    (target: Place, then?: () => void) => {
      layers.closeMenus()
      if (target !== 'home') writeFlag(identity.name, 'last', target)
      if (target !== place) onGo(target)
      then?.()
    },
    [layers, place, onGo, identity.name],
  )
  // Once the person confirmed it's them, they arrive where they asked to go: the check is not asked again.
  const enter = useCallback(
    (target: Place, then?: () => void) => {
      if (target === 'personal' && lock.locked) layers.setUnlock({ after: () => arrive('personal', then) })
      else arrive(target, then)
    },
    [lock.locked, layers, arrive],
  )
  const lockNow = () => {
    setLock(shut(lock, 'you'))
    if (place === 'personal') {
      onGo('home', true)
      focusPersonalSwitch()
    }
    toast(NOTICE.locked)
  }
  return {
    enter,
    lockNow,
    toggleLock: () => (lock.locked ? layers.setUnlock({ after: null }) : lockNow()),
    unlocked: () => {
      const after = layers.unlock?.after
      setLock(OPEN)
      layers.setUnlock(null)
      after?.()
    },
  }
}

type Nav = ReturnType<typeof usePlaceNavigation>

/** Taking a carried note back from Work, with Undo that carries it to the same project again. */
function takeBack(writes: PersonalWrites, toast: ShowToast) {
  return (release: ProjectRelease, project: ProjectSummary) => {
    const again = (noteId: string) => () =>
      void writes.carry(noteId, project.projectId).catch((err: unknown) => toast(personalFailure(err)))
    void writes
      .takeBack(release.id)
      .then((receipt) => {
        document.getElementById('c-w-h')?.focus({ preventScroll: true })
        toast(NOTICE.takenBack, receipt.noteId ? again(receipt.noteId) : undefined)
      })
      .catch((err: unknown) => toast(personalFailure(err)))
  }
}

/** What a key does at home: Enter from nowhere goes in; an arrow outside a field, a menu or the switch picks a door. */
function homeKey(e: KeyboardEvent): 'enter' | 'personal' | 'work' | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return null
  if (e.key === 'Enter') return document.activeElement === document.body ? 'enter' : null
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return null
  if (
    e.target instanceof Element &&
    e.target.closest('.segmented, [role="menu"], [role="dialog"], input, textarea, select')
  ) {
    return null
  }
  return e.key === 'ArrowLeft' ? 'personal' : 'work'
}

/** Enter at home goes to the side used last; the arrows move between the doors. */
function useHomeKeys(place: Place, active: boolean, identity: string, nav: Nav) {
  useEffect(() => {
    if (place !== 'home' || !active) return undefined
    const onKey = (e: KeyboardEvent) => {
      const key = modalOnScreen() ? null : homeKey(e) // a sheet on screen owns the keys
      if (key === 'enter') nav.enter(readFlag(identity, 'last') === 'work' ? 'work' : 'personal')
      if (key !== 'personal' && key !== 'work') return
      e.preventDefault()
      document.querySelector<HTMLElement>(`[data-door="${key}"] .c2-main`)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [place, active, identity, nav])
}

/** H, P, W go to the three places; D opens your data; L the padlock; T the notes. Esc closes what opened last. */
function usePlaceKeys(props: PlacesProps, layers: Layers, nav: Nav, explain: Explain) {
  const { place } = props
  const free = !layers.unlock && !layers.privacy && !layers.data
  useShortcuts(
    {
      h: () => nav.enter('home'),
      p: () => nav.enter('personal'),
      w: () => nav.enter('work'),
      d: () => layers.setData(true),
      l: nav.toggleLock,
      t: () => nav.enter('personal', () => layers.setNotes(place === 'personal' ? !layers.notes : true)),
    },
    free,
  )
  useHomeKeys(place, free, props.identity.name, nav)
  // With nothing open, Escape takes the place home; each open layer closes first, the latest first. The menus and the
  // sheets close themselves (usePopover, useDialog).
  useEscape(place !== 'home', () => nav.enter('home'))
  useEscape(place === 'home' && explain.shown, explain.dismiss)
  // Only where the notes are on screen: elsewhere they stay open for the way back, and Esc goes home.
  useEscape(layers.notes && place === 'personal', () => {
    layers.setNotes(false)
    focusNotesToggle()
  })
}

/** The first visit explains the line in one sentence above the doors, until "Got it". */
function useExplain(identity: string) {
  const [shown, setShown] = useState(() => readFlag(identity, 'explained') === null)
  return {
    shown,
    dismiss: () => {
      setShown(false)
      writeFlag(identity, 'explained', 'yes')
      document.querySelector<HTMLElement>('.c2-line .c2-lock')?.focus()
    },
  }
}

type Explain = ReturnType<typeof useExplain>

/** A sheet asked for from a project opens here, once. */
function useOpening(props: PlacesProps, layers: Layers) {
  const { opening, onOpened } = props
  const { setData, setPrivacy } = layers
  useEffect(() => {
    if (!opening) return
    if (opening === 'data') setData(true)
    else setPrivacy(true)
    onOpened()
  }, [opening, onOpened, setData, setPrivacy])
}

interface View {
  props: PlacesProps
  now: Date
  layers: Layers
  space: ReturnType<typeof usePersonalSpace>
  /** What the places may show of the space: nothing while it is locked, not even what was read before it shut. */
  personal: Space | undefined
  projects: ReturnType<typeof useProjects>
  writes: PersonalWrites
  shown: readonly Place[]
  nav: Nav
  carried: Carried
  explain: Explain
}

const personalRead = (v: View): Read => ({
  state: readState(v.space),
  failed: READ_FAILED.personal,
  retry: () => void v.space.refetch(),
})

const projectsRead = (v: View): Read => ({
  state: readState(v.projects),
  failed: READ_FAILED.projects,
  retry: () => void v.projects.refetch(),
})

function Home({ v }: { v: View }) {
  const { props, now, nav, layers } = v
  const data = v.personal
  const work = workDoor(v.projects.data?.projects, now, props.call?.title ?? null)
  const fresh = !!data && data.turns.length === 0 && data.notes.length === 0
  return (
    <div className="c-home" data-place-view="home" hidden={!v.shown.includes('home')}>
      <HomeDoors
        hello={greeting(now.getHours(), firstName(props.identity), fresh)}
        date={dateLine(now)}
        explain={v.explain.shown}
        reads={[personalRead(v), projectsRead(v)]}
        you={youDoor({ locked: lockedBy(props.lock), turns: data?.turns, notes: data?.notes.length ?? 0, now })}
        work={work}
        initial={initialOf(props.identity.displayName, props.identity.name)}
        lockedBy={lockedBy(props.lock)}
        actions={{
          personal: () => nav.enter('personal'),
          notes: () => nav.enter('personal', () => layers.setNotes(true)),
          work: () => (work.joins ? props.onOpenProject(work.joins.projectId, true) : nav.enter('work')),
          lock: nav.toggleLock,
          explained: v.explain.dismiss,
        }}
      />
    </div>
  )
}

function Personal({ v }: { v: View }) {
  const { props, layers, nav, carried } = v
  return (
    <PersonalSpace
      hidden={!v.shown.includes('personal') || props.lock.locked}
      account={accountOf(props.identity)}
      name={firstName(props.identity)}
      space={v.personal}
      read={personalRead(v)}
      projects={v.projects.data?.projects}
      writes={v.writes}
      notes={{ open: layers.notes, set: layers.setNotes }}
      earlier={{ open: layers.earlier, set: layers.setEarlier }}
      edge={{ badge: carried.unseen, pulse: carried.pulse }}
      toast={props.toast}
      onCarried={carried.add}
      onCross={() => nav.enter('work')}
      onStartProject={() => nav.enter('work', () => layers.setNewProject(true))}
    />
  )
}

function Work({ v }: { v: View }) {
  const { props, layers, nav } = v
  return (
    <WorkSpace
      hidden={!v.shown.includes('work')}
      token={props.identity.token}
      projects={v.projects.data?.projects}
      read={projectsRead(v)}
      fresh={v.carried.fresh}
      inCallProject={props.call?.projectId ?? null}
      personalLock={lockedBy(props.lock)}
      newProject={{ open: layers.newProject, set: layers.setNewProject }}
      actions={{
        open: (id) => props.onOpenProject(id, false),
        join: (id) => props.onOpenProject(id, true),
        leaveRoom: () => props.call?.onLeave(),
        takeBack: takeBack(v.writes, props.toast),
        cross: () => nav.enter('personal'),
      }}
    />
  )
}

function Bar({ v }: { v: View }) {
  const { props, layers, nav } = v
  return (
    <PlacesBar
      place={props.place}
      locked={props.lock.locked}
      newInWork={v.carried.unseen}
      identity={props.identity}
      call={props.call}
      chip={{ open: layers.chip, set: layers.setChip }}
      actions={{
        go: nav.enter,
        lockNow: () => {
          layers.setChip(false)
          nav.lockNow()
        },
        privacy: () => {
          layers.closeMenus()
          layers.setPrivacy(true)
        },
        data: () => layers.setData(true),
        chooseDev: props.onChooseDev,
        signOut: props.onSignOut,
      }}
    />
  )
}

/** One sheet at a time: "Unlock to copy or delete" closes your data, and unlocking opens it again. */
function Sheets({ v }: { v: View }) {
  const { props, layers, nav } = v
  const { identity } = props
  return (
    <>
      <PlaceDialogs layers={layers} me={tokenSubject(identity.token)} inCall={!!props.call} onUnlocked={nav.unlocked} />
      {layers.data && (
        <DataSheet
          token={identity.token}
          who={identity.displayName ?? firstName(identity) ?? identity.name}
          space={v.personal}
          locked={props.lock.locked}
          lockedNow={props.lockedNow}
          toast={props.toast}
          onClose={() => layers.setData(false)}
          returnTo={placesAccount}
          onUnlock={() => {
            layers.setData(false)
            layers.setUnlock({ after: () => layers.setData(true) })
          }}
          onErase={v.writes.erase}
        />
      )}
    </>
  )
}

/**
 * What a shut space does, whoever shut it (the person's L, a call, another tab). It is never on screen: arriving at it
 * (a reload, Back, a room joined) lands at home instead, in its history entry's place, so Back goes on past it, and the
 * focus waits on the bar's Personal switch, never on the page. Its notes close. (What was read of it is dropped above
 * the places, wherever the person is: SignedIn.)
 */
function useShutSpace({ place, lock, onGo }: PlacesProps, setNotes: (open: boolean) => void) {
  useEffect(() => {
    if (place !== 'personal' || !lock.locked) return
    onGo('home', true)
    focusPersonalSwitch()
  }, [place, lock.locked, onGo])
  useEffect(() => {
    if (lock.locked) setNotes(false)
  }, [lock.locked, setNotes])
}

/**
 * Another tab's unlock closes this tab's unlock sheet and does nothing else: only the tab whose check passed goes where
 * it was asked (a tab sharing its screen in a call never moves into the space on its own). The sheet gives the focus
 * back to what opened it (useDialog), or to the place.
 */
function useUnlockedElsewhere(locked: boolean, layers: Layers) {
  const { unlock, setUnlock } = layers
  useEffect(() => {
    if (!locked && unlock) setUnlock(null)
  }, [locked, unlock, setUnlock])
}

export function Places(props: PlacesProps) {
  const { place, identity, lock } = props
  const root = useRef<HTMLDivElement>(null)
  const layers = useLayers()
  const explain = useExplain(identity.name)
  const nav = usePlaceNavigation(props, layers)
  const space = usePersonalSpace(identity, !lock.locked)
  const v: View = {
    props,
    now: useNow(),
    layers,
    space,
    personal: lock.locked ? undefined : space.data,
    projects: useProjects(identity),
    writes: usePersonalWrites(identity),
    shown: usePlaceMotion(place, root),
    nav,
    carried: useCarried(place),
    explain,
  }
  useArrival(place)
  usePlaceKeys(props, layers, nav, explain)
  useOpening(props, layers)
  useDocumentTitle(PLACE_TITLE[place])
  useShutSpace(props, layers.setNotes)
  useUnlockedElsewhere(lock.locked, layers)
  return (
    <div ref={root} className={`places${props.call ? ' in-room' : ''}`} data-place={place}>
      <Bar v={v} />
      <Home v={v} />
      <p className="sr-only" aria-live="polite">
        {ANNOUNCE[place]}
      </p>
      <Personal v={v} />
      <Work v={v} />
      <Sheets v={v} />
    </div>
  )
}
