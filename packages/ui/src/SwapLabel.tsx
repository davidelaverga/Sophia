// A label that changes in place: every option lives in one grid cell, so the control keeps its width
// and nothing around it moves; the options crossfade. Only the current one is exposed to assistive tech.

export function SwapLabel({ value, labels }: { value: string; labels: Readonly<Record<string, string>> }) {
  return (
    <span className="swap">
      {Object.entries(labels).map(([key, label]) => (
        <span key={key} aria-hidden={key !== value}>
          {label}
        </span>
      ))}
    </span>
  )
}
