// The call's devices (docs/plans/call-devices.md): a narrow opener beside a switch, the kit's menu over it, as Meet's
// arrow beside its buttons. It lists the devices of its kinds, the one in use marked, read when it opens and again
// when one is plugged in or out; a choice switches the call and is kept for the next one. What the browser can't do
// isn't offered: a speaker only where media elements choose their output, and with access refused it says how to give
// it, with nothing to press.
import { Fragment, useEffect, useState } from 'react'
import { Icon, Menu, MenuHead, MenuItem, MenuSep, Tip, usePopover } from '@sophia/ui'
import { newVersion } from '../../app/new-version-early.ts'
import { BACKGROUNDS, chosenBackground, type BackgroundId } from './background-preference.ts'
import {
  canChooseOutput,
  chosenDevices,
  deviceInUse,
  KIND_WORD,
  type DeviceKind,
  type MediaDevice,
} from './device-preference.ts'
import { refusalOf } from './part-gone.ts'

/** What the menu found: still reading, refused, its part gone after a deploy (stale-part-call.md), or each kind's devices. */
export type Found =
  | { state: 'reading' }
  | { state: 'refused' }
  | { state: 'stale' }
  | { state: 'found'; devices: Partial<Record<DeviceKind, MediaDevice[]>> }

/** How a kind's devices are listed: the room's own (useProjectRoom). */
export type List = (kind: DeviceKind) => Promise<MediaDevice[]>

/** The devices of these kinds; refused where the browser keeps access back, stale where their part is gone. */
async function readDevices(kinds: readonly DeviceKind[], list: List): Promise<Found> {
  try {
    const lists = await Promise.all(kinds.map((k) => list(k)))
    return { state: 'found', devices: Object.fromEntries(kinds.map((k, i) => [k, lists[i] ?? []])) }
  } catch (err: unknown) {
    return { state: refusalOf(err, newVersion) }
  }
}

/** Read while open, and again when a device is plugged in or out. */
export function useDevices(open: boolean, kinds: readonly DeviceKind[], list: List): Found {
  const [found, setFound] = useState<Found>({ state: 'reading' })
  useEffect(() => {
    if (!open) return undefined
    let live = true
    const read = () =>
      void readDevices(kinds, list).then((f) => {
        if (live) setFound(f)
      })
    read()
    // An insecure page has no mediaDevices: nothing is plugged in or out there to hear of.
    const media = 'mediaDevices' in navigator ? navigator.mediaDevices : null
    media?.addEventListener('devicechange', read)
    return () => {
      live = false
      media?.removeEventListener('devicechange', read)
      setFound({ state: 'reading' })
    }
  }, [open, kinds, list])
  return found
}

/** A line in the menu that says something and offers nothing to press. */
const Said = ({ children }: { children: string }) => <MenuItem disabled>{children}</MenuItem>

interface KindProps {
  kind: DeviceKind
  found: Found
  /** The device chosen of this kind, if any. */
  chosen: string | undefined
  onChoose: (id: string) => void
}

function KindItems({ kind, found, chosen, onChoose }: KindProps) {
  if (found.state === 'reading') return <Said>Finding devices…</Said>
  if (found.state === 'stale') return <Said>Reload this tab to choose one</Said>
  if (found.state === 'refused')
    return <Said>{`Allow the ${KIND_WORD[kind].toLowerCase()} in your browser’s site settings to choose one`}</Said>
  const devices = found.devices[kind] ?? []
  if (devices.length === 0) return <Said>{`No ${KIND_WORD[kind].toLowerCase()} found`}</Said>
  const inUse = deviceInUse(devices, chosen)
  return devices.map((d) => (
    <MenuItem key={d.id} checked={d.id === inUse} onClick={() => onChoose(d.id)}>
      {d.label}
    </MenuItem>
  ))
}

/** A camera background chosen beside the cameras (call-backgrounds.md): whether the device can draw one, and the choice. */
interface BackgroundChoice {
  supported: () => Promise<boolean>
  onChoose: (id: BackgroundId) => void
}

/** Whether the device can draw a background, asked while the menu is open; null until it answers. */
function useCanDraw(open: boolean, background: BackgroundChoice | undefined): boolean | null {
  const [can, setCan] = useState<boolean | null>(null)
  const supported = background?.supported
  useEffect(() => {
    if (!open || !supported) return undefined
    let live = true
    void supported().then((ok) => {
      if (live) setCan(ok)
    })
    return () => {
      live = false
      setCan(null)
    }
  }, [open, supported])
  return can
}

/**
 * The backgrounds, the one in use marked. Where the device can't draw one, None still answers, so a background kept
 * from a device that could is always cleared (Codex P2 on #342); the rest are said unavailable.
 */
function BackgroundItems({ can, onChoose }: { can: boolean | null; onChoose: (id: BackgroundId) => void }) {
  if (can === null) return <Said>Checking this device…</Said>
  const chosen = chosenBackground()
  const offered = can ? BACKGROUNDS : BACKGROUNDS.filter((b) => b.id === 'none')
  return (
    <>
      {offered.map((b) => (
        <MenuItem key={b.id} checked={b.id === chosen} onClick={() => onChoose(b.id)}>
          {b.label}
        </MenuItem>
      ))}
      {!can && <Said>This browser can’t draw a background</Said>}
    </>
  )
}

interface Switch {
  on: boolean
  toggle: () => void
}

/** Last, the menu's switches: your camera mirrored here (room-basics.md), others' cameras coming (incoming-video.md). */
function Switches(props: {
  mirror?: Switch | undefined
  incoming?: Switch | undefined
  closeThen: (act: () => void) => void
}) {
  const { mirror, incoming, closeThen } = props
  if (!mirror && !incoming) return null
  return (
    <>
      <MenuSep />
      {mirror && (
        <MenuItem checked={mirror.on} toggle onClick={() => closeThen(mirror.toggle)}>
          Mirror my video
        </MenuItem>
      )}
      {incoming && (
        <MenuItem checked={incoming.on} toggle onClick={() => closeThen(incoming.toggle)}>
          Show others’ cameras
        </MenuItem>
      )}
    </>
  )
}

interface Props {
  /** The kinds it lists, in order; a speaker only where the browser can choose one. */
  kinds: readonly DeviceKind[]
  /** Its name and its menu's: «settings», never a switch's own name. */
  label: string
  list: List
  onChoose: (kind: DeviceKind, id: string) => void
  /** Under the cameras, the camera's background. */
  background?: BackgroundChoice
  /** Last, whether your own camera shows mirrored here (room-basics.md). */
  mirror?: Switch | undefined
  /** And whether others' cameras come here, for this call (incoming-video.md). */
  incoming?: Switch | undefined
}

export function DeviceMenu({ kinds, label, list, onChoose, background, mirror, incoming }: Props) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const shown = kinds.filter((k) => k !== 'audiooutput' || canChooseOutput())
  const found = useDevices(open, kinds, list)
  const can = useCanDraw(open, background)
  // The devices arrive after the menu opened on «Finding devices…», which goes with the focus it held: it moves to the
  // device in use, so the arrows and Escape still work from the menu.
  useEffect(() => {
    const panel = menu.panel.current
    if (!panel || found.state === 'reading' || panel.contains(document.activeElement)) return
    panel.querySelector<HTMLElement>('[aria-checked="true"], [role^="menuitem"]')?.focus()
  }, [found, can, menu.panel])
  const closeThen = (act: () => void) => {
    menu.opener.current?.focus()
    setOpen(false)
    act()
  }
  const choose = (kind: DeviceKind, id: string) => closeThen(() => onChoose(kind, id))
  return (
    <div ref={menu.wrap} className="device-menu">
      <button
        ref={menu.opener}
        type="button"
        className="device-open has-tip"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chevron" />
        <Tip label={label} />
      </button>
      {open && (
        <Menu popover={menu} label={label} side="top" align="center" className="device-list">
          {shown.map((kind, i) => (
            <Fragment key={kind}>
              {i > 0 && <MenuSep />}
              <MenuHead>{KIND_WORD[kind]}</MenuHead>
              <KindItems kind={kind} found={found} chosen={chosenDevices()[kind]} onChoose={(id) => choose(kind, id)} />
            </Fragment>
          ))}
          {background && (
            <>
              <MenuSep />
              <MenuHead>Background</MenuHead>
              <BackgroundItems can={can} onChoose={(id) => closeThen(() => background.onChoose(id))} />
            </>
          )}
          <Switches mirror={mirror} incoming={incoming} closeThen={closeThen} />
        </Menu>
      )}
    </div>
  )
}

/** What a kind's row says before a device can be named. */
const UNNAMED: Record<Found['state'], string> = {
  reading: 'Finding…',
  refused: 'Not allowed',
  stale: 'Needs a reload',
  found: 'None found',
}

/**
 * One kind's device, named, in the check before joining (device-check.md): a press opens the kit's menu to choose
 * another, the one in use marked.
 */
export function DeviceChoice({ kind, found, chosen, onChoose }: KindProps) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const devices = found.state === 'found' ? (found.devices[kind] ?? []) : []
  const inUse = deviceInUse(devices, chosen)
  const name = devices.find((d) => d.id === inUse)?.label ?? UNNAMED[found.state]
  const choose = (id: string) => {
    menu.opener.current?.focus()
    setOpen(false)
    onChoose(id)
  }
  return (
    <div ref={menu.wrap} className="device-choice">
      <button
        ref={menu.opener}
        type="button"
        className="device-choice-open"
        aria-label={`${KIND_WORD[kind]}: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="device-choice-name">{name}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <Menu popover={menu} label={KIND_WORD[kind]} side="bottom" align="start" className="device-list">
          <KindItems kind={kind} found={found} chosen={chosen} onChoose={choose} />
        </Menu>
      )}
    </div>
  )
}
