// Asking Sophia about a task, from its sheet: the questions its state invites, offered as one-press asks, or one's own.
// Her answer writes itself in, word by word, under her light. The answer comes from wherever the page sends the ask
// (`onAsk`); the panel never makes one up.
import { useEffect, useState } from 'react'
import type { Mark, PlanRow } from './plan.ts'

export type Ask = (row: PlanRow, question: string) => Promise<string>

/** The questions a task's state invites. */
const INVITED: Record<Mark, string[]> = {
  waiting: ['Why is it waiting?', 'What happens if I say yes?'],
  working: ['What is it doing now?', 'When will it have a candidate?'],
  queued: ['What is it queued behind?'],
  later: ['What does it wait for?', 'Can it start sooner?'],
  free: ['Who could take it?', 'Why isn’t anyone on it?'],
  finished: ['What’s left to check it?', 'Who should check it?'],
  checked: ['What did the check find?'],
}

/** An answer revealed word by word, as speech arrives; at once when less motion is asked for. */
function useWords(text: string | null): string {
  const [shown, setShown] = useState(0)
  const words = text?.split(' ') ?? []
  useEffect(() => {
    setShown(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? Infinity : 0)
    if (!text) return undefined
    const timer = setInterval(() => setShown((n) => n + 1), 45)
    return () => clearInterval(timer)
  }, [text])
  return words.slice(0, shown).join(' ')
}

export function AskSophia({ row, onAsk }: { row: PlanRow; onAsk?: Ask | undefined }) {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const shown = useWords(answer)
  if (!onAsk) return null
  const ask = (q: string) => {
    setAsked(q)
    setAnswer(null)
    setQuestion('')
    onAsk(row, q).then(setAnswer, () => setAnswer('I couldn’t reach the plan just now. Nothing was changed.'))
  }
  return (
    <section className="sheet-section ask-sophia">
      <h3>
        <span className="ask-light" aria-hidden />
        Ask Sophia
      </h3>
      <div className="ask-chips">
        {INVITED[row.status.mark].map((q) => (
          <button key={q} type="button" className="ask-chip" onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="act-guide"
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim()) ask(question.trim())
        }}
      >
        <input
          aria-label="Ask Sophia about this task"
          placeholder="Ask about this task…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="pill" disabled={!question.trim()}>
          Ask
        </button>
      </form>
      {asked && (
        <div className="ask-thread">
          <p className="ask-q">{asked}</p>
          {/* Seen word by word; heard once, whole. */}
          <p className="ask-a" data-thinking={answer === null || undefined} aria-hidden>
            <span className="ask-light" />
            {answer === null ? 'Thinking…' : shown}
          </p>
          <p className="sr-only" aria-live="polite">
            {answer ?? 'Sophia is thinking'}
          </p>
        </div>
      )}
    </section>
  )
}
