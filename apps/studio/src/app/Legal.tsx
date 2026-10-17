// A legal document (docs/plans/terms-privacy.md): the terms of use or the privacy notice, in a reading column, with the
// way to the other one and back to Sophia. Plain links: it reads before sign-in, with nothing of the Studio loaded.
import { Mark } from './Mark.tsx'
import { SECTIONS, TITLES, UPDATED, type LegalDoc, type LegalSection } from './legal-text.ts'

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
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={run}>{run}</p>
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
