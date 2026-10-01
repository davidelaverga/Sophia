// The room's side panel, as meeting apps have it: the chat and the brief beside the stage, one at a time, opened
// from the stage's corner and closed from the panel's own header (or Esc). Both stay mounted while hidden, so an
// unsent message or a brief edit in progress is never lost. On a phone the panel covers the room.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon, Tip, type IconName } from '@sophia/ui'
import { nextInRow } from '../../app/roving.ts'
import {
  changedUnseen,
  focusOnOpen,
  focusStep,
  isNew,
  PANEL_TITLE,
  PANELS,
  seenNow,
  toggled,
  type Panel,
  type PanelFocus,
} from './side-panel.ts'

interface PanelProps {
  open: Panel | null
  onOpen: (panel: Panel | null) => void
  chat: ReactNode
  brief: ReactNode
  /**
   * The call's switches (microphone, and camera or screen while on). The head shows them where the panel covers
   * the room, so what this person is sending is never out of sight; beside the room, the dock already does.
   */
  call: ReactNode
  /**
   * Said under the head where the panel covers the dock that says it: what stopped a device, or why the call ended or
   * failed (panelNote).
   */
  note: string | null
}

/** The control a panel's focus goes to as it opens (focusOnOpen): the message bar, or the panel's tab. */
function openingTarget(open: Panel, root: HTMLElement | null): HTMLElement | null {
  const entry = root?.querySelector<HTMLElement>('[data-chat-entry]') ?? null
  const kind = !entry ? null : entry instanceof HTMLTextAreaElement ? 'bar' : 'start'
  const lands = focusOnOpen(open, window.matchMedia('(pointer: fine)').matches, kind)
  return lands === 'bar' ? entry : (root?.querySelector<HTMLElement>(`#side-tab-${open}`) ?? null)
}

/**
 * Opening moves focus in: to the message bar where a keyboard is at hand, else to the tab (no keyboard jumps up on a
 * phone, and Chat with Sophia is never focused for a stray Space to press). Closing hands it back to the toggle that
 * opened the panel, also after another tab was chosen (focusStep).
 */
function usePanelFocus(open: Panel | null, panel: RefObject<HTMLElement | null>) {
  const remembered = useRef<PanelFocus>({ open, opener: open })
  useEffect(() => {
    const { next, move } = focusStep(remembered.current, open)
    remembered.current = next
    if (!move) return
    const target =
      'in' in move
        ? openingTarget(move.in, panel.current)
        : document.querySelector<HTMLElement>(`.panel-toggles [data-panel="${move.back}"]`)
    target?.focus({ preventScroll: true })
  }, [open, panel])
}

/**
 * Esc closes the panel from inside it (its own handler) and from nowhere: with the focus on no control, as after a
 * click on the messages, a letter goes to the chat's foot (shortcuts.ts) and Esc is the one key that closes. A
 * control outside the panel keeps its own keys.
 */
function useEscFromNowhere(open: Panel | null, onOpen: (panel: Panel | null) => void) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      const at = e.target instanceof HTMLElement ? e.target : null
      const nowhere = !at || at === document.body || at === document.documentElement
      if (e.key === 'Escape' && !e.defaultPrevented && nowhere) onOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpen])
}

export function SidePanel({ open, onOpen, chat, brief, call, note }: PanelProps) {
  const body: Record<Panel, ReactNode> = { chat, brief }
  const panel = useRef<HTMLElement>(null)
  usePanelFocus(open, panel)
  useEscFromNowhere(open, onOpen)
  return (
    <aside
      ref={panel}
      className="side-panel"
      // A letter typed on the panel's tabs or buttons is text for the chat's foot, not a shortcut (shortcuts.ts).
      data-typing-scope
      hidden={!open}
      aria-label={open ? PANEL_TITLE[open] : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onOpen(null)
      }}
    >
      <PanelHead open={open} onOpen={onOpen} call={call} />
      {/* For the eye only: the dock's own note, still in the accessibility tree under the panel, is the one announced. */}
      {note && (
        <p className="side-panel-note" aria-hidden>
          {note}
        </p>
      )}
      {PANELS.map((p) => (
        <div
          key={p}
          id={`side-${p}`}
          className="side-panel-body"
          role="tabpanel"
          aria-labelledby={`side-tab-${p}`}
          hidden={open !== p}
        >
          {body[p]}
        </div>
      ))}
    </aside>
  )
}

/** The panel's tabs (arrow keys move between them) and its Close. */
function PanelHead({ open, onOpen, call }: Pick<PanelProps, 'open' | 'onOpen' | 'call'>) {
  const tabs = useRef(new Map<Panel, HTMLButtonElement>())
  const onTabKey = (e: React.KeyboardEvent) => {
    const next = open ? nextInRow(PANELS, open, e.key) : null
    if (!next) return
    e.preventDefault()
    onOpen(next)
    tabs.current.get(next)?.focus()
  }
  return (
    <header className="side-panel-head">
      <div className="side-tabs" role="tablist" aria-label="Side panel" onKeyDown={onTabKey}>
        {PANELS.map((p) => (
          <button
            key={p}
            ref={(el) => {
              if (el) tabs.current.set(p, el)
            }}
            type="button"
            role="tab"
            id={`side-tab-${p}`}
            aria-selected={open === p}
            aria-controls={`side-${p}`}
            tabIndex={open === p ? 0 : -1}
            onClick={() => onOpen(p)}
          >
            {PANEL_TITLE[p]}
          </button>
        ))}
      </div>
      <div className="side-panel-call">{call}</div>
      <button type="button" className="round has-tip" aria-label="Close" onClick={() => onOpen(null)}>
        <Icon name="close" />
        <Tip label="Close" keys="Esc" side="bottom" align="end" />
      </button>
    </header>
  )
}

interface ToggleProps {
  open: Panel | null
  onOpen: (panel: Panel | null) => void
  /** New messages since the chat was last in view. */
  unread: boolean
  /** The brief changed since it was last in view. */
  updated: boolean
}

const ICON: Record<Panel, IconName> = { chat: 'chat', brief: 'brief' }
const KEY: Record<Panel, string> = { chat: 'C', brief: 'B' }

/** The stage's corner: the chat and the brief, each a toggle, with a dot for what is new. */
export function PanelToggles({ open, onOpen, unread, updated }: ToggleProps) {
  const dot: Record<Panel, boolean> = { chat: unread, brief: updated }
  return (
    <div className="panel-toggles">
      {PANELS.map((p) => (
        <button
          key={p}
          type="button"
          className="round has-tip"
          data-panel={p}
          aria-pressed={open === p}
          aria-label={dot[p] ? `${PANEL_TITLE[p]}, something new` : PANEL_TITLE[p]}
          onClick={() => onOpen(toggled(open, p))}
        >
          <Icon name={ICON[p]} />
          {dot[p] && <span className="toggle-dot" aria-hidden />}
          <Tip label={PANEL_TITLE[p]} keys={KEY[p]} side="top" align="end" />
        </button>
      ))}
    </div>
  )
}

/** Whether what the chat shows changed while it was out of view; the first chat that loads is the baseline. */
export function useUnread(signature: string | null, inView: boolean): boolean {
  const [seen, setSeen] = useState(signature)
  const next = seenNow(seen, signature, inView)
  useEffect(() => {
    if (next !== seen) setSeen(next)
  }, [next, seen])
  return changedUnseen(signature, seen, inView)
}

/** The brief's revision as it is read, and whether it moved on while the brief was out of view. */
export function useBriefUpdates(inView: boolean) {
  const [latest, setLatest] = useState<number | null>(null)
  const [seen, setSeen] = useState<number | null>(null)
  const onRevision = useCallback((revision: number) => setLatest(revision), [])
  useEffect(() => {
    if (latest !== null && (inView || seen === null)) setSeen(latest)
  }, [inView, latest, seen])
  return { onRevision, updated: isNew(latest, seen, inView) }
}
