// The personal space's own marks, drawn as the prototype draws them (direction C): the padlock open and shut, the way
// across an edge, home, the microphone and its stop. Decorative: every control that shows one names itself.

const svg = (props: { className?: string | undefined; width?: number | undefined }) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: props.width ?? 1.8,
  'aria-hidden': true,
  focusable: false,
  ...(props.className ? { className: props.className } : {}),
})

interface Props {
  className?: string
}

export function LockShut({ className, width }: Props & { width?: number }) {
  return (
    <svg {...svg({ className, width })}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function LockOpen({ className }: Props) {
  return (
    <svg {...svg({ className })}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.6-1.8" />
    </svg>
  )
}

export function Across({ className, toward }: Props & { toward: 'left' | 'right' }) {
  return (
    <svg {...svg({ className })}>
      <path d={toward === 'right' ? 'M9.5 6.5 15 12l-5.5 5.5' : 'M14.5 6.5 9 12l5.5 5.5'} />
    </svg>
  )
}

export function HomeMark({ className }: Props) {
  return (
    <svg {...svg({ className })}>
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
    </svg>
  )
}

export function Mic() {
  return (
    <svg {...svg({})}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}

export function Stop() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable={false}>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  )
}

export function Chevron() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden focusable={false}>
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
