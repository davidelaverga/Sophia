// Ask Sophia to revise sections of a report's designed page (docs/plans/revise-section.md): «Revise with Sophia…» over
// the page, for editors and admins on the current version. The sheet lists the page's sections (page-sections.ts),
// takes what to change, and sends requestDesignEdit; the next version is Sophia's to publish, and the room hears of it.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon } from '@sophia/ui'
import { requestDesignEdit } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { pageSections, type PageSection } from './page-sections.ts'

/** DesignEditRequest's bounds. */
const MOST_SECTIONS = 16
const MOST_WORDS = 2000

interface Props {
  projectId: string
  identity: Identity
  versionId: string
  /** The page's checked text, read for its sections only. */
  html: string
}

export function ReviseSections(props: Props) {
  const sections = useMemo(() => pageSections(props.html), [props.html])
  const [open, setOpen] = useState(false)
  // The request lives here, not in the sheet: closed while it goes, it carries on, and its outcome is said beside the
  // button and in the sheet opened again, with the same key for a retry (Codex P1 on #359).
  const asked = useAsk({ ...props, sections })
  if (sections.length === 0) return null
  return (
    <div className="report-revise">
      <Button kind="ghost" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="sophia" />
        Revise with Sophia…
      </Button>
      {!open && <OutOfSight sending={asked.sending} />}
      {open &&
        createPortal(<ReviseSheet sections={sections} asked={asked} onClose={() => setOpen(false)} />, document.body)}
    </div>
  )
}

/** With the sheet closed, how the request stands, beside the button. */
function OutOfSight({ sending }: { sending: Sending }) {
  if (sending.state === 'sent') {
    return (
      <span className="report-revise-note" role="status">
        Sophia is revising the page.
      </span>
    )
  }
  if (sending.failed) {
    return (
      <span className="report-revise-note" role="alert">
        {sending.failed}
      </span>
    )
  }
  return null
}

type Sending = { state: 'idle' | 'sending' | 'sent'; failed: string | null }

/** One key per edit: a retry of the same words is the same edit, and changed words are a new one. */
function useEditKey() {
  const last = useRef<{ key: string; said: string } | null>(null)
  return (said: string) => {
    if (last.current?.said !== said) last.current = { key: crypto.randomUUID(), said }
    return last.current.key
  }
}

/** The request's state, and its hook: the sections in page order, the words trimmed, one key per edit. */
function useAsk(props: Props & { sections: readonly PageSection[] }) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState<Sending>({ state: 'idle', failed: null })
  const keyFor = useEditKey()
  const offered = chosen.size > 0 && instruction.trim() !== '' && sending.state === 'idle'
  const ask = async () => {
    if (!offered) return
    const sections = props.sections.filter((s) => chosen.has(s.id)).map((s) => s.id)
    const body = { versionId: props.versionId, sections, instruction: instruction.trim() }
    setSending({ state: 'sending', failed: null })
    try {
      await requestDesignEdit(props.identity.token, props.projectId, keyFor(JSON.stringify(body)), body)
      setSending({ state: 'sent', failed: null })
    } catch (err: unknown) {
      const failed = err instanceof Error ? err.message : 'Couldn’t ask Sophia. Try again.'
      setSending({ state: 'idle', failed })
    }
  }
  const toggle = (id: string, on: boolean) =>
    setChosen((was) => new Set(on ? [...was, id] : [...was].filter((x) => x !== id)))
  return { chosen, toggle, instruction, setInstruction, sending, offered, ask }
}

type Asked = ReturnType<typeof useAsk>

function ReviseSheet({
  sections,
  asked,
  onClose,
}: {
  sections: readonly PageSection[]
  asked: Asked
  onClose: () => void
}) {
  const { chosen, toggle, instruction, setInstruction, sending, offered, ask } = asked
  const sent = sending.state === 'sent'
  // Asked, what went is what stays on screen: the words and the sections hold still until the answer.
  const held = sending.state !== 'idle'
  const slow = useSlow(sending.state === 'sending')
  // Admitted, Ask Sophia goes with the request: the focus it held goes on to Done.
  const done = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (sent) done.current?.focus()
  }, [sent])
  return (
    <Sheet id="revise-page-title" title="Revise the page" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <SectionChoice sections={sections} chosen={chosen} toggle={toggle} disabled={held} />
        <label className="field-label" htmlFor="revise-instruction">
          What to change
        </label>
        <div className="field revise-words">
          <textarea
            id="revise-instruction"
            rows={4}
            maxLength={MOST_WORDS}
            value={instruction}
            readOnly={held}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>
        <p className="sheet-status" role="status">
          {sent ? 'Sophia is revising the page. Its next version will appear here.' : slow ? SLOW_NOTE : ''}
        </p>
        {sending.failed && <p role="alert">{sending.failed}</p>}
        <ReviseActs sending={sending.state} offered={offered} done={done} onClose={onClose} />
      </form>
    </Sheet>
  )
}

/** Done once admitted; else Cancel, and Ask Sophia, which waits focusable while it goes. */
function ReviseActs(props: {
  sending: Sending['state']
  offered: boolean
  done: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const { sending, offered, done, onClose } = props
  return (
    <div className="rename-acts">
      {sending === 'sent' ? (
        <Button ref={done} kind="primary" onClick={onClose}>
          Done
        </Button>
      ) : (
        <>
          <Button kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* Waiting, it stays focusable: aria-disabled, and ask() guards the press (Codex P1 on #359). */}
          <Button kind="primary" type="submit" aria-disabled={!offered || undefined}>
            {sending === 'sending' ? 'Asking…' : 'Ask Sophia'}
          </Button>
        </>
      )}
    </div>
  )
}

/** The page's sections, each a checkbox; at most DesignEditRequest's sixteen at once. */
function SectionChoice(props: {
  sections: readonly PageSection[]
  chosen: ReadonlySet<string>
  toggle: (id: string, on: boolean) => void
  disabled: boolean
}) {
  const { sections, chosen, toggle, disabled } = props
  return (
    <fieldset className="revise-sections" disabled={disabled}>
      <legend className="field-label">Sections</legend>
      {sections.map((s) => (
        <label key={s.id} className="revise-section">
          <input
            type="checkbox"
            checked={chosen.has(s.id)}
            disabled={!chosen.has(s.id) && chosen.size >= MOST_SECTIONS}
            onChange={(e) => toggle(s.id, e.target.checked)}
          />
          {s.label}
        </label>
      ))}
    </fieldset>
  )
}
