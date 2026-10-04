// Sophia's mark, Umbral (docs/plans/brand-umbral.md): two presences facing, you and Sophia, the line between them the
// space they leave. Drawn on a 48 grid whose cuts land on whole pixels at 16, 32 and 48 (and twice those on a 2x
// screen): 16 by default, so its gap is one crisp pixel, two on a 2x screen. Sophia's half
// carries a soft halo, brighter while the project's feed is live; yours never glows: the light is her presence.
interface Props {
  /** Its side, in px. */
  size?: number
  /** The project's feed is live: Sophia's halo brightens. */
  live?: boolean
}

export function Mark({ size = 16, live = false }: Props) {
  return (
    <svg
      className="umbral"
      data-mark="umbral"
      data-live={live || undefined}
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden
    >
      <path className="umbral-you" d="M30 14.83A15.19 15.19 0 1 0 30 37.93Z" />
      <path className="umbral-sophia" d="M33 6.65A8.57 8.57 0 1 1 33 23.11Z" />
    </svg>
  )
}
