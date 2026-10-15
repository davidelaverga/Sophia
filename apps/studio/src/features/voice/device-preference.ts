// The devices a person chose for their calls (docs/plans/call-devices.md): a microphone, a speaker and a camera,
// kept on this device for the next call. Pure of LiveKit, so the rules are unit-tested.

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'

/** One device as a menu lists it. */
export interface MediaDevice {
  id: string
  label: string
}

const KEY = 'sophia.devices.v1'
const KINDS: readonly DeviceKind[] = ['audioinput', 'audiooutput', 'videoinput']

/** What each kind is called, as a menu heads it and names a device the browser keeps the label of. */
export const KIND_WORD: Record<DeviceKind, string> = {
  audioinput: 'Microphone',
  audiooutput: 'Speaker',
  videoinput: 'Camera',
}

/** The device chosen of each kind, as this device keeps it; nothing where storage can't be read. */
export function chosenDevices(): Partial<Record<DeviceKind, string>> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (typeof kept !== 'object' || kept === null) return {}
    const chosen: Partial<Record<DeviceKind, string>> = {}
    for (const kind of KINDS) {
      const id: unknown = Reflect.get(kept, kind)
      if (typeof id === 'string' && id) chosen[kind] = id
    }
    return chosen
  } catch {
    return {}
  }
}

/** Keep a choice for the next call; storage that can't be written leaves the next call on the default. */
export function rememberDevice(kind: DeviceKind, id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...chosenDevices(), [kind]: id }))
  } catch {
    // storage unavailable: the next call uses the default
  }
}

/** Which listed device is in use: the chosen one while it is plugged in, else the browser's default, else the first. */
export function deviceInUse(devices: readonly MediaDevice[], chosen: string | undefined): string | null {
  const ids = devices.map((d) => d.id)
  if (chosen !== undefined && ids.includes(chosen)) return chosen
  return ids.includes('default') ? 'default' : (ids[0] ?? null)
}

/** A device's name: its own, or its kind and place while the browser keeps labels back (before access is given). */
export function deviceName(kind: DeviceKind, label: string, index: number): string {
  return label.trim() || `${KIND_WORD[kind]} ${String(index + 1)}`
}

/** Whether a call's sound can go to a chosen speaker: media elements choose their output (Chrome, Edge; not Safari). */
export const canChooseOutput = (): boolean =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
