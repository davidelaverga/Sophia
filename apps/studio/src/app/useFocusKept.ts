// The focus never falls to the page when the control that held it goes away after a press (docs/plans/focus-kept.md):
// Hold becomes Resume, Create the room link becomes Copy link, Join becomes the microphone. The box watches itself;
// when the focused control inside it leaves or turns natively disabled, and the page has the focus, the control that
// takes its place gets it (nextFocus). A focus moved on purpose (a click elsewhere, Tab out) is left alone.
import { useEffect, type RefObject } from 'react'
import { KEPT_MS, nextFocus, type Candidate } from './focus-kept.ts'

/** The controls a box hands the focus between, unless it names its own (the dock: its anchors). */
const CONTROLS = 'button, input, select, textarea, a[href], [data-focus-fallback]'

const unusable = (el: HTMLElement): boolean =>
  !el.isConnected || el.matches(':disabled') || el.closest('[hidden]') !== null || el.getClientRects().length === 0

const candidate = (el: HTMLElement): Candidate => ({
  slot: el.closest('[data-focus-slot]')?.getAttribute('data-focus-slot') ?? null,
  unusable: unusable(el),
  fallback: el.hasAttribute('data-focus-fallback'),
})

const pageHasFocus = () => document.activeElement === null || document.activeElement === document.body

/** What a box remembers between its events. */
interface Kept {
  /** The control that had the focus: its slot and its place among the box's controls. */
  held: { slot: string | null; index: number } | null
  /**
   * A stand-in that took the focus while the lost control's own replacement wasn't there yet (Hold → Stop while the
   * goal is holding): when the replacement comes (Resume, once held), the focus moves on to it, if it is still there.
   */
  handed: { to: HTMLElement; slot: string } | null
  /** When a control in the box was last pressed: a loss long after a press is nobody's to hand on. */
  pressed: number
  /** Whether that press was a key's: a box that hands the focus on only after one (`keys`) reads it. */
  byKey: boolean
}

/** The box changed: a late replacement takes the focus from its stand-in, or a lost focus goes where nextFocus says. */
function onChange(kept: Kept, items: HTMLElement[], keys: boolean) {
  if (Date.now() - kept.pressed > KEPT_MS || (keys && !kept.byKey)) return
  const { handed } = kept
  if (handed && document.activeElement === handed.to) {
    const mate = items.find((x) => !unusable(x) && candidate(x).slot === handed.slot)
    if (mate) {
      kept.handed = null
      mate.focus({ preventScroll: true })
      return
    }
  }
  if (!kept.held || !pageHasFocus()) return
  const lost = kept.held.slot
  const to = items[nextFocus(items.map(candidate), kept.held)]
  if (!to) return
  to.focus({ preventScroll: true })
  if (lost !== null && candidate(to).slot !== lost) kept.handed = { to, slot: lost }
}

/** The box's listeners over what it remembers: a focus in, a press, a focus out. */
function listeners(el: HTMLElement, kept: Kept, list: () => HTMLElement[], controls: string) {
  const hold = (target: EventTarget | null) => {
    if (target instanceof HTMLElement) kept.held = { slot: candidate(target).slot, index: list().indexOf(target) }
  }
  const onIn = (e: Event) => {
    if (kept.handed && e.target !== kept.handed.to) kept.handed = null
    hold(e.target)
  }
  // Only a press on one of the box's controls counts: a press on its words or its gaps hands nothing on later.
  const onPress = (e: Event) => {
    // Any control counts as pressed (the dock's Leave too); `controls` only narrows where the focus may go.
    const on = e.target instanceof Element ? e.target.closest<HTMLElement>(`${CONTROLS}, ${controls}`) : null
    if (!on || !el.contains(on)) {
      kept.held = kept.handed = null
      return
    }
    kept.pressed = Date.now()
    kept.byKey = e.type === 'keydown'
    hold(on)
  }
  const onOut = (e: Event) => {
    const next = e instanceof FocusEvent ? e.relatedTarget : null
    if (next instanceof Node) {
      if (!el.contains(next)) kept.held = kept.handed = null
      return
    }
    // Nowhere next: the control went away or waits disabled (kept), or the person clicked off it (let go).
    const left = e.target
    setTimeout(() => {
      if (left instanceof HTMLElement && !unusable(left) && document.activeElement !== left) kept.held = null
    }, 0)
  }
  return [
    ['focusin', onIn, false],
    ['focusout', onOut, false],
    ['pointerdown', onPress, true],
    ['keydown', onPress, true],
  ] as const
}

/** Watches `el`; returns what stops it. */
function keepFocus(el: HTMLElement, controls: string, keys: boolean): () => void {
  const list = () => [...el.querySelectorAll<HTMLElement>(controls)]
  const kept: Kept = { held: null, handed: null, pressed: 0, byKey: false }
  const on = listeners(el, kept, list, controls)
  const watch = new MutationObserver(() => onChange(kept, list(), keys))
  for (const [type, listener, capture] of on) el.addEventListener(type, listener, capture)
  watch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'hidden'] })
  return () => {
    for (const [type, listener, capture] of on) el.removeEventListener(type, listener, capture)
    watch.disconnect()
  }
}

/**
 * `keys`: hand the focus on only after a key's press. The dock's: a mouse that joins leaves the focus on the page, where
 * Space is push-to-talk (usePushToTalk); on the microphone, Space would toggle it instead.
 */
export function useFocusKept(box: RefObject<HTMLElement | null>, controls = CONTROLS, keys = false) {
  useEffect(() => {
    const el = box.current
    return el ? keepFocus(el, controls, keys) : undefined
  }, [box, controls, keys])
}
