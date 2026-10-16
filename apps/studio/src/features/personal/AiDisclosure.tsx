// Personal says Sophia is an AI, and help is one press away (docs/plans/personal-ai-disclosure.md): the line under the
// field, with «Help now», and the sheet of crisis lines it opens. In a talk by voice, the line alone (Talk.tsx).
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Sheet } from '../../app/Sheet.tsx'
import { AI_LINE, EMERGENCY, HELP_LEAD, HELP_LINES, HELP_SOPHIA, type HelpWay } from './help-lines.ts'

/** A call or a text opens the phone's own; a site, a new tab with nothing of this page handed to it. */
function Way({ way }: { way: HelpWay }) {
  const site = way.href.startsWith('https:')
  return (
    <a className="pill help-way" href={way.href} {...(site ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {way.label}
    </a>
  )
}

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet id="c-help-h" title="Help now" onClose={onClose}>
      <p className="help-lead">{HELP_LEAD}</p>
      <p className="help-danger">{EMERGENCY}</p>
      <ul className="help-lines">
        {HELP_LINES.map((line) => (
          <li key={line.where}>
            <span className="help-where">{line.where}</span>
            <strong>{line.name}</strong>
            <span className="help-note">{line.note}</span>
            <span className="help-ways">
              {line.ways.map((way) => (
                <Way key={way.href} way={way} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="help-note">{HELP_SOPHIA}</p>
    </Sheet>
  )
}

/**
 * Under the field: Sophia is an AI, and «Help now» opens the crisis lines. The sheet goes to the places' root, as a talk
 * does: the space under it moves (its shift), and a sheet fixed inside it would move with it.
 */
export function AiLine() {
  const [helping, setHelping] = useState(false)
  const host = document.querySelector('.places') ?? document.body
  return (
    <>
      <p className="c3-ai-line">
        {AI_LINE}{' '}
        <button type="button" className="text-button" onClick={() => setHelping(true)}>
          Help now
        </button>
      </p>
      {helping && createPortal(<HelpSheet onClose={() => setHelping(false)} />, host)}
    </>
  )
}
