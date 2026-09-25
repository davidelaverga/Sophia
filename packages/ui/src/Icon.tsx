// Line icons drawn for the Studio: one stroke weight, round ends, 24-unit grid. Decorative only: the
// control that shows an icon always carries its own accessible name.
import type { ReactNode } from 'react'

export type IconName =
  'mic' | 'micOff' | 'camera' | 'cameraOff' | 'screen' | 'leave' | 'link' | 'invite' | 'chevron' | 'close' | 'calendar'

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
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
