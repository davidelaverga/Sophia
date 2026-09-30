// The three places outside a project (direction C, "Two doors"): home with its two doors, the personal space and the
// work space, under one bar. One place in three states: a door grows into its space and shrinks back into itself, and
// the hairline with the lock is always at the edge you crossed. This component owns what is open over the places
// (notes, the data sheet, menus, dialogs) and wires the keys; the places render; the words come from places-view.ts.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectRelease, ProjectSummary } from '@sophia/contracts'
import type { Identity } from '../../app/dev-identity.ts'
import { initialOf } from '../../app/profile.ts'
import type { Place } from '../../app/route.ts'
import { useShortcuts } from '../../app/shortcuts.ts'
import { DataSheet } from './DataSheet.tsx'
import { HomeDoors } from './HomeDoors.tsx'
import { OPEN, lockedBy, shut, type Lock } from './lock.ts'
import { PlaceDialogs } from './PlaceDialogs.tsx'
import { PlacesBar, type InCall } from './PlacesBar.tsx'
import { PersonalSpace } from './PersonalSpace.tsx'
import { dateLine, firstName, greeting, workDoor, youDoor } from './places-view.ts'
import { Toast, useToast, type ShowToast } from './Toast.tsx'
import { useEscape } from './useEscape.ts'
import { usePersonalSpace, usePersonalWrites, useProjects, type PersonalWrites } from './usePersonal.ts'
import { usePlaceMotion } from './usePlaceMotion.ts'
import { WorkSpace } from './WorkSpace.tsx'
import { personalFailure } from './write-words.ts'
import './personal.css'

export interface PlacesProps {
  place: Place
  identity: Identity
  lock: Lock
  setLock: (lock: Lock) => void
  /** Why a sign-in link did not do what it offered, when it did not. */
  notice?: string | undefined
  /** The room this person is in, if any: the bar shows it, and Personal stays locked while it lasts. */
  call: (InCall & { projectId: string }) | null
  onGo: (place: Place) => void
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

/** What is open over the places. A click outside the menus closes them. */
function useLayers() {
  const [chip, setChip] = useState(false)
  const [menu, setMenu] = useState(false)
  const [earlier, setEarlier] = useState(false)
  const [notes, setNotes] = useState(false)
  const [data, setData] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [unlock, setUnlock] = useState<{ after: (() => void) | null } | null>(null)
  const [newProject, setNewProject] = useState(false)
  const closeMenus = useCallback(() => {
    setChip(false)
    setMenu(false)
    setEarlier(false)
  }, [])
  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest('.acct'))) closeMenus()
    }
    document.addEventListener('click', outside)
    return () => document.removeEventListener('click', outside)
  }, [closeMenus])
  return {
    chip,
    setChip,
    menu,
    setMenu,
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

/** Where to land after arriving: the field on a desktop (no phone keyboard popping up uninvited), else the heading. */
function focusOnArrival(place: Place, left: Place) {
  const touch = matchMedia('(hover: none)').matches
  let target: HTMLElement | null
  if (place === 'home') target = document.querySelector(`[data-door="${left}"] .c2-main`)
  else if (place === 'personal' && !touch) target = document.querySelector('#c-input:not(:disabled)')
  else target = null
  target ??= document.getElementById(place === 'work' ? 'c-w-h' : 'c-p-h')
  target?.focus({ preventScroll: true })
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

interface NavInput {
  props: PlacesProps
  layers: Layers
  toast: ShowToast
}

/** Moving between the places, and the padlock. Personal behind a shut padlock asks the person to confirm it's them. */
function usePlaceNavigation({ props, layers, toast }: NavInput) {
  const { place, lock, setLock, onGo, identity } = props
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
    layers.setNotes(false)
    if (place === 'personal') onGo('home')
    toast('Personal locked. Opening it asks for your passkey.')
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
        toast('Back in your notes', receipt.noteId ? again(receipt.noteId) : undefined)
      })
      .catch((err: unknown) => toast(personalFailure(err)))
  }
}

/** What a key does at home: Enter from nowhere goes in; an arrow outside a field, a menu or the switch picks a door. */
function homeKey(e: KeyboardEvent): 'enter' | 'personal' | 'work' | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return null
  if (e.key === 'Enter') return document.activeElement === document.body ? 'enter' : null
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return null
  if (e.target instanceof Element && e.target.closest('.seg, .menu, input, textarea, select')) return null
  return e.key === 'ArrowLeft' ? 'personal' : 'work'
}

/** Enter at home goes to the side used last; the arrows move between the doors. */
function useHomeKeys(place: Place, active: boolean, identity: string, nav: Nav) {
  useEffect(() => {
    if (place !== 'home' || !active) return undefined
    const onKey = (e: KeyboardEvent) => {
      const key = homeKey(e)
      if (key === 'enter') nav.enter(readFlag(identity, 'last') === 'work' ? 'work' : 'personal')
      if (key !== 'personal' && key !== 'work') return
      e.preventDefault()
      document.querySelector<HTMLElement>(`[data-door="${key}"] .c2-main`)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [place, active, identity, nav])
}

const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus()

/** H, P, W go to the three places; D opens your data; L the padlock; T the notes. Esc closes what opened last. */
function usePlaceKeys(props: PlacesProps, layers: Layers, nav: Nav, explain: Explain) {
  const { place } = props
  const free = !layers.unlock && !layers.privacy
  useShortcuts(
    {
      h: () => nav.enter('home'),
      p: () => nav.enter('personal'),
      w: () => nav.enter('work'),
      d: () => layers.setData(!layers.data),
      l: nav.toggleLock,
      t: () => nav.enter('personal', () => layers.setNotes(place === 'personal' ? !layers.notes : true)),
    },
    free,
  )
  useHomeKeys(place, free, props.identity.name, nav)
  // With nothing open, Escape takes the place home; each open layer closes first, the latest first.
  useEscape(place !== 'home', () => nav.enter('home'))
  useEscape(place === 'home' && explain.shown, explain.dismiss)
  useEscape(layers.notes, () => {
    layers.setNotes(false)
    focus('[aria-controls="c-notes"]')
  })
  useEscape(layers.data, () => layers.setData(false))
  useEscape(layers.menu, () => {
    layers.setMenu(false)
    focus('.avatar-btn')
  })
  useEscape(layers.earlier, () => {
    layers.setEarlier(false)
    focus('.c3-daypill')
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

interface View {
  props: PlacesProps
  /** The call, if any, with a Leave that says what it did. */
  call: PlacesProps['call']
  now: Date
  layers: Layers
  toast: ReturnType<typeof useToast>
  space: ReturnType<typeof usePersonalSpace>
  projects: readonly ProjectSummary[] | undefined
  writes: PersonalWrites
  shown: readonly Place[]
  nav: Nav
  carried: Carried
  explain: Explain
}

function Home({ v }: { v: View }) {
  const { props, now, space, nav, layers } = v
  const data = space.data
  const work = workDoor(v.projects ?? [], now, props.call?.title ?? null)
  const fresh = !!data && data.turns.length === 0 && data.notes.length === 0
  return (
    <div className="c-home" data-place-view="home" hidden={!v.shown.includes('home')}>
      <HomeDoors
        hello={greeting(now.getHours(), firstName(props.identity), fresh)}
        date={dateLine(now)}
        explain={v.explain.shown}
        you={youDoor({ locked: lockedBy(props.lock), turns: data?.turns ?? [], notes: data?.notes.length ?? 0, now })}
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
      identity={props.identity.name}
      name={firstName(props.identity)}
      space={v.space.data}
      projects={v.projects ?? []}
      writes={v.writes}
      notes={{ open: layers.notes, set: layers.setNotes }}
      earlier={{ open: layers.earlier, set: layers.setEarlier }}
      edge={{ badge: carried.unseen, pulse: carried.pulse }}
      toast={v.toast.show}
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
      projects={v.projects}
      fresh={v.carried.fresh}
      inCallProject={props.call?.projectId ?? null}
      personalLock={lockedBy(props.lock)}
      newProject={{ open: layers.newProject, set: layers.setNewProject }}
      actions={{
        open: (id) => props.onOpenProject(id, false),
        join: (id) => props.onOpenProject(id, true),
        leaveRoom: () => v.call?.onLeave(),
        takeBack: takeBack(v.writes, v.toast.show),
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
      call={v.call}
      layers={{ chip: layers.chip, menu: layers.menu, setChip: layers.setChip, setMenu: layers.setMenu }}
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

/** Leaving the room from here says so, and whether it opened the personal side again (a lock the room set lifts). */
function leaveSaying(props: PlacesProps, toast: ShowToast) {
  return () => {
    if (!props.call) return
    const reopens = props.lock.locked && props.lock.by === 'room'
    props.call.onLeave()
    toast(`You left ${props.call.title}.${reopens ? ' Personal is open again.' : ''}`)
  }
}

export function Places(props: PlacesProps) {
  const { place, identity, lock, onGo } = props
  const root = useRef<HTMLDivElement>(null)
  const layers = useLayers()
  const toast = useToast()
  const explain = useExplain(identity.name)
  const nav = usePlaceNavigation({ props, layers, toast: toast.show })
  const projects = useProjects(identity)
  const v: View = {
    props,
    call: props.call && { ...props.call, onLeave: leaveSaying(props, toast.show) },
    now: useNow(),
    layers,
    toast,
    space: usePersonalSpace(identity, !lock.locked),
    projects: projects.data?.projects,
    writes: usePersonalWrites(identity),
    shown: usePlaceMotion(place, root),
    nav,
    carried: useCarried(place),
    explain,
  }
  useArrival(place)
  usePlaceKeys(props, layers, nav, explain)
  const { show } = toast
  useEffect(() => {
    if (props.notice) show(props.notice)
  }, [props.notice, show])
  // A shut side is never on screen: arriving at it (a reload, Back, a room joined) lands at home instead.
  useEffect(() => {
    if (place === 'personal' && lock.locked) onGo('home')
  }, [place, lock.locked, onGo])
  return (
    <div ref={root} className={`places${props.call ? ' in-room' : ''}`} data-place={place}>
      <Bar v={v} />
      <Home v={v} />
      <p className="sr-only" aria-live="polite">
        {ANNOUNCE[place]}
      </p>
      <Personal v={v} />
      <Work v={v} />
      <PlaceDialogs layers={layers} onUnlocked={nav.unlocked} />
      <DataSheet
        open={layers.data}
        token={identity.token}
        who={identity.displayName ?? firstName(identity) ?? identity.name}
        space={v.space.data}
        locked={lock.locked}
        toast={toast.show}
        onClose={() => layers.setData(false)}
        onUnlock={() => layers.setUnlock({ after: null })}
        onErase={v.writes.erase}
      />
      <Toast notice={toast.notice} onHide={toast.hide} />
    </div>
  )
}
