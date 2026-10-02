// Line icons drawn for the Studio: one stroke weight, round ends, 24-unit grid. Decorative only: the
// control that shows an icon always carries its own accessible name.
import type { ReactNode } from 'react'

export type IconName =
  | 'mic'
  | 'micOff'
  | 'camera'
  | 'cameraOff'
  | 'screen'
  | 'leave'
  | 'link'
  | 'invite'
  | 'chevron'
  | 'close'
  | 'calendar'
  | 'chat'
  | 'brief'
  | 'send'
  | 'lock'
  | 'unlock'
  | 'home'
  | 'forward'
  | 'back'
  | 'stop'

const slash = <path d="M4 4l16 16" />
const mic = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </>
)
const camera = (
  <>
    <rect x="3" y="6.5" width="12.5" height="11" rx="2.5" />
    <path d="M15.5 10.5l5-2.8v8.6l-5-2.8" />
  </>
)

const padlock = <rect x="5" y="10.5" width="14" height="9.5" rx="2" />

const PATHS: Record<IconName, ReactNode> = {
  mic,
  micOff: (
    <>
      {mic}
      {slash}
    </>
  ),
  camera,
  cameraOff: (
    <>
      {camera}
      {slash}
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
  leave: <path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3M10 16.5l4.5-4.5L10 7.5M14.5 12H4" />,
  link: (
    <path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />
  ),
  invite: (
    <>
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0M19 8v6M16 11h6" />
    </>
  ),
  chevron: <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  chat: <path d="M5.5 5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5V17h-1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  brief: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </>
  ),
  send: <path d="M12 19V5M6 11l6-6 6 6" />,
  lock: (
    <>
      {padlock}
      <path d="M8 10.5v-3a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      {padlock}
      <path d="M8 10.5v-3a4 4 0 0 1 7.6-1.8" />
    </>
  ),
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  forward: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
  back: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />,
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
