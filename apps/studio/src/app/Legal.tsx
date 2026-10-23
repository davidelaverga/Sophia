// A legal document (docs/plans/terms-privacy.md): the terms of use or the privacy notice, in a reading column, with the
// way to the other one and back to Sophia. Plain links: it reads before sign-in, with nothing of the Studio loaded.
import { Mark } from './Mark.tsx'
import { CONTACT_EMAIL, SECTIONS, TITLES, UPDATED, type LegalDoc, type LegalSection } from './legal-text.ts'

/** A line's words, the contact address in them a mailto link (legal-contact.md). */
function Words({ line }: { line: string }) {
  const [before, ...after] = line.split(CONTACT_EMAIL)
  if (after.length === 0) return line
  return (
    <>
      {before}
      {after.map((rest, i) => (
        <span key={`${String(i)}-${rest}`}>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {rest}
        </span>
      ))}
    </>
  )
}

/** A list's items start with «· »: consecutive ones make one list. */
function Body({ body }: { body: LegalSection['body'] }) {
  const runs: (string | string[])[] = []
  for (const line of body) {
    const last = runs.at(-1)
    if (!line.startsWith('· ')) runs.push(line)
    else if (Array.isArray(last)) last.push(line.slice(2))
    else runs.push([line.slice(2)])
  }
  return (
    <>
      {runs.map((run) =>
        Array.isArray(run) ? (
          <ul key={run[0]}>
            {run.map((item) => (
              <li key={item}>
                <Words line={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={run}>
            <Words line={run} />
          </p>
        ),
      )}
    </>
  )
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const other: LegalDoc = doc === 'terms' ? 'privacy' : 'terms'
  return (
    <div className="legal">
      <header className="legal-head">
        <a href="/" className="legal-mark" aria-label="Sophia">
          <Mark />
          <span className="mark-word">Sophia</span>
        </a>
      </header>
      <main className="legal-doc" data-content>
        <h1>{TITLES[doc]}</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>
        {SECTIONS[doc].map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            <Body body={s.body} />
          </section>
        ))}
      </main>
      <footer className="legal-foot">
        <a href={`/${other}`}>{TITLES[other]}</a>
        <a href="/">Back to Sophia</a>
      </footer>
    </div>
  )
}
