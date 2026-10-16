// «Send feedback» (docs/plans/crash-feedback.md): a person's words to the team, through the same service as the crash
// reports, offered only where it goes somewhere (crash-report.ts). Said sent once the service took it.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@sophia/ui'
import { sendFeedback } from './crash-report.ts'
import { Sheet } from './Sheet.tsx'

/** Feedback's most: a few paragraphs. */
const FEEDBACK_MOST = 4000

type State = 'idle' | 'sending' | 'sent' | 'failed'

export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const [words, setWords] = useState('')
  const [state, setState] = useState<State>('idle')
  const offered = words.trim() !== '' && state !== 'sending' && state !== 'sent'
  // Sent, Send goes with the form's words: the focus it held goes on to Close, never to the page.
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (state === 'sent') close.current?.focus()
  }, [state])
  const send = async () => {
    if (!offered) return
    setState('sending')
    setState((await sendFeedback(words.trim())) ? 'sent' : 'failed')
  }
  return (
    <Sheet id="feedback-title" title="Send feedback" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <label className="field-label" htmlFor="feedback-words">
          What would you like us to know?
        </label>
        <div className="field feedback-words">
          <textarea
            id="feedback-words"
            rows={5}
            maxLength={FEEDBACK_MOST}
            value={words}
            readOnly={state === 'sending' || state === 'sent'}
            onChange={(e) => setWords(e.target.value)}
          />
        </div>
        <p className="role-note">It goes to the team with no account details; leave out anything private.</p>
        <p className="sheet-status" role="status">
          {state === 'sent' ? 'Sent. Thank you.' : ''}
        </p>
        {state === 'failed' && <p role="alert">Couldn’t send it. Try again.</p>}
        <div className="rename-acts">
          <Button ref={close} kind="ghost" onClick={onClose}>
            {state === 'sent' ? 'Close' : 'Cancel'}
          </Button>
          {state !== 'sent' && (
            <Button kind="primary" type="submit" aria-disabled={!offered || undefined}>
              {state === 'sending' ? 'Sending…' : 'Send'}
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
