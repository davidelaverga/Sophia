// The room's capture keys. What turns on a microphone, a camera or a screen share, or joins a call, takes the command
// key (⌘ on a Mac, Ctrl elsewhere), as in Meet: ⌘D or Ctrl+D for the microphone, ⌘E or Ctrl+E for the camera. A
// stray letter never starts sending.
import { keyLabel, onMac } from '../../app/shortcuts.ts'

export const ROOM_KEYS = {
  join: 'mod+j',
  microphone: 'mod+d',
  camera: 'mod+e',
  screen: 'mod+shift+e',
} as const

/** A room key as this platform writes it, for a tip. */
export const roomKey = (action: keyof typeof ROOM_KEYS) => keyLabel(ROOM_KEYS[action], onMac)
