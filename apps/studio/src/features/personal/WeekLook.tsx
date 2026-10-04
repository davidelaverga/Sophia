// Her look back at your week (docs/plans/personal-twenty.md): once a week, the newest thing in the conversation is a
// few sentences of hers and the themes she saw, with three ways on: talk about it, keep it as a note, or not now. Each
// puts it away.
// Shown only once the API gives it (extras.ts).
import type { Week } from './extras.ts'
import { focusConversation } from './focus.ts'

/** The words "Talk about it" sends: the week, by its themes. */
export const talkAboutWeek = (themes: readonly string[]) =>
  themes.length > 0 ? `Let’s talk about my week: ${themes.join(', ')}.` : 'Let’s talk about my week.'

export function WeekLook({ week, onTalk }: { week: Week; onTalk: (words: string) => void }) {
  const { look } = week
  return (
    <section className="c3-week" aria-labelledby="c-week-h">
      <h3 id="c-week-h" className="c3-label">
        Your week with Sophia
      </h3>
      <p className="c3-week-text">{look.text}</p>
      {look.themes.length > 0 && (
        <p className="c3-week-themes">
          <span className="sr-only">Themes: </span>
          {look.themes.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </p>
      )}
      <p className="c3-week-acts">
        <button
          className="pill"
          type="button"
          onClick={() => {
            onTalk(talkAboutWeek(look.themes))
            week.dismiss(look.id)
            focusConversation()
          }}
        >
          Talk about it
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            week.keep(look.id)
            focusConversation()
          }}
        >
          Keep as a note
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            week.dismiss(look.id)
            focusConversation()
          }}
        >
          Not now
        </button>
      </p>
    </section>
  )
}
