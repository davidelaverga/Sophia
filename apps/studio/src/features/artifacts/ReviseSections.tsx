// Ask Sophia to revise sections of a report's designed page (docs/plans/revise-section.md): «Revise with Sophia…» over
// the page, for editors and admins on the current version. The sheet lists the page's sections (page-sections.ts),
// takes what to change, and sends requestDesignEdit; the next version is Sophia's to publish, and the room hears of it.
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon } from '@sophia/ui'
import { requestDesignEdit } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
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
  if (sections.length === 0) return null
  return (
    <div className="report-revise">
      <Button kind="ghost" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="sophia" />
        Revise with Sophia…
      </Button>
      {open &&
        createPortal(<ReviseSheet {...props} sections={sections} onClose={() => setOpen(false)} />, document.body)}
    </div>
  )
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

function ReviseSheet(props: Props & { sections: readonly PageSection[]; onClose: () => void }) {
  const { sections, onClose } = props
  const { chosen, toggle, instruction, setInstruction, sending, offered, ask } = useAsk(props)
  const sent = sending.state === 'sent'
  return (
    <Sheet id="revise-page-title" title="Revise the page" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <SectionChoice sections={sections} chosen={chosen} toggle={toggle} disabled={sent} />
        <label className="field-label" htmlFor="revise-instruction">
          What to change
        </label>
        <div className="field revise-words">
          <textarea
            id="revise-instruction"
            rows={4}
            maxLength={MOST_WORDS}
            value={instruction}
            disabled={sent}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>
        <p className="sheet-status" role="status">
          {sent ? 'Sophia is revising the page. Its next version will appear here.' : ''}
        </p>
        {sending.failed && <p role="alert">{sending.failed}</p>}
        <div className="rename-acts">
          {sent ? (
            <Button kind="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button kind="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button kind="primary" type="submit" disabled={!offered}>
                {sending.state === 'sending' ? 'Asking…' : 'Ask Sophia'}
              </Button>
            </>
          )}
        </div>
      </form>
    </Sheet>
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
