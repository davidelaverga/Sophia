// The background a person chose for their camera (docs/plans/call-backgrounds.md): none, a blur, or one of Sophia's
// lights behind them, kept on this device for the next call. Pure of LiveKit and MediaPipe, so the rules are unit-tested.

export type BackgroundId = 'none' | 'blur-light' | 'blur' | 'dusk' | 'deep' | 'dawn'

/** The pictures among them: gradients drawn in the browser (background-pictures.ts). */
export type PictureId = Extract<BackgroundId, 'dusk' | 'deep' | 'dawn'>

/** What the menu offers, in its order. */
export const BACKGROUNDS: readonly { id: BackgroundId; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'blur-light', label: 'Slight blur' },
  { id: 'blur', label: 'Blur' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'deep', label: 'Deep' },
  { id: 'dawn', label: 'Dawn' },
]

const KEY = 'sophia.background.v1'
const isBackground = (v: unknown): v is BackgroundId => BACKGROUNDS.some((b) => b.id === v)

/** The background kept on this device; none where nothing is kept, or something it doesn't know. */
export function chosenBackground(): BackgroundId {
  try {
    const kept = localStorage.getItem(KEY)
    return isBackground(kept) ? kept : 'none'
  } catch {
    return 'none'
  }
}

/** Keep a choice for the next call; storage that can't be written leaves the next call without one. */
export function rememberBackground(id: BackgroundId): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // storage unavailable: the next call starts with none
  }
}

/** How strongly each blur softens what is behind a person, in the processor's pixels. */
const BLUR: Record<'blur-light' | 'blur', number> = { 'blur-light': 4, blur: 12 }

/** A background as LiveKit's processor takes it (`switchTo`): off, a blur of its strength, or a picture behind. */
export type BackgroundEffect =
  | { mode: 'disabled' }
  | { mode: 'background-blur'; blurRadius: number }
  | { mode: 'virtual-background'; imagePath: string }

export function backgroundEffect(id: BackgroundId, picture: (id: PictureId) => string): BackgroundEffect {
  if (id === 'none') return { mode: 'disabled' }
  if (id === 'blur-light' || id === 'blur') return { mode: 'background-blur', blurRadius: BLUR[id] }
  return { mode: 'virtual-background', imagePath: picture(id) }
}
