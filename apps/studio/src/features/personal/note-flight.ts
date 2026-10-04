/**
 * A note kept lands somewhere: a small light leaves the turn it was kept from and flies to the notes' count, which
 * brightens as it arrives (Head). With less motion asked for, nothing flies.
 */
export function noteFlight(from: Element | null): void {
  const to = document.querySelector('.c3-notes-toggle')
  if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // From the start of the turn's first line to the middle of the count.
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const [x, y] = [a.left + 16, a.top + 12]
  const fly = document.createElement('div')
  fly.className = 'c3-noteflight'
  fly.style.left = `${String(x)}px`
  fly.style.top = `${String(y)}px`
  document.body.append(fly)
  const dx = b.left + b.width / 2 - x
  const dy = b.top + b.height / 2 - y
  const flight = fly.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(${String(dx)}px - 50%), calc(${String(dy)}px - 50%)) scale(0.4)`, opacity: 0.2 },
    ],
    { duration: 640, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
  )
  void flight.finished.finally(() => fly.remove())
}
