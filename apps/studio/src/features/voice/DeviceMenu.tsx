// The call's devices (docs/plans/call-devices.md): a narrow opener beside a switch, the kit's menu over it, as Meet's
// arrow beside its buttons. It lists the devices of its kinds, the one in use marked, read when it opens and again
// when one is plugged in or out; a choice switches the call and is kept for the next one. What the browser can't do
// isn't offered: a speaker only where media elements choose their output, and with access refused it says how to give
// it, with nothing to press.
import { Fragment, useEffect, useState } from 'react'
import { Icon, Menu, MenuHead, MenuItem, MenuSep, Tip, usePopover } from '@sophia/ui'
import {
  canChooseOutput,
  chosenDevices,
  deviceInUse,
  KIND_WORD,
  type DeviceKind,
  type MediaDevice,
} from './device-preference.ts'

/** What the menu found: still reading, refused, or each kind's devices. */
export type Found =
  { state: 'reading' } | { state: 'refused' } | { state: 'found'; devices: Partial<Record<DeviceKind, MediaDevice[]>> }

/** How a kind's devices are listed: the room's own (useProjectRoom). */
export type List = (kind: DeviceKind) => Promise<MediaDevice[]>

/** The devices of these kinds; refused where the browser keeps access back. */
async function readDevices(kinds: readonly DeviceKind[], list: List): Promise<Found> {
  try {
    const lists = await Promise.all(kinds.map((k) => list(k)))
    return { state: 'found', devices: Object.fromEntries(kinds.map((k, i) => [k, lists[i] ?? []])) }
  } catch {
    return { state: 'refused' }
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

interface Props {
  /** The kinds it lists, in order; a speaker only where the browser can choose one. */
  kinds: readonly DeviceKind[]
  /** Its name and its menu's: «settings», never a switch's own name. */
  label: string
  list: List
  onChoose: (kind: DeviceKind, id: string) => void
}

export function DeviceMenu({ kinds, label, list, onChoose }: Props) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const shown = kinds.filter((k) => k !== 'audiooutput' || canChooseOutput())
  const found = useDevices(open, kinds, list)
  // The devices arrive after the menu opened on «Finding devices…», which goes with the focus it held: it moves to the
  // device in use, so the arrows and Escape still work from the menu.
  useEffect(() => {
    const panel = menu.panel.current
    if (!panel || found.state === 'reading' || panel.contains(document.activeElement)) return
    panel.querySelector<HTMLElement>('[aria-checked="true"], [role^="menuitem"]')?.focus()
  }, [found, menu.panel])
  const choose = (kind: DeviceKind, id: string) => {
    menu.opener.current?.focus()
    setOpen(false)
    onChoose(kind, id)
  }
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
        </Menu>
      )}
    </div>
  )
}

/** What a kind's row says before a device can be named. */
const UNNAMED: Record<Found['state'], string> = { reading: 'Finding…', refused: 'Not allowed', found: 'None found' }

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
