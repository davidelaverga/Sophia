// What was carried in from Personal (docs/plans/project-carried-in.md, Davide's chapter 1, the project's side): in
// Knowledge, the notes members carried to this project, exactly as carried, with who and when, and nothing else of
// anyone's Personal. Read from the project list (`GET /api/v1/projects`, each project's releases), as Personal's Work
// reads it. Only under the vision flag.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef } from 'react'
import type { ProjectRelease } from '@sophia/contracts'
import { listProjects } from '../../api/personal.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'

interface Props {
  projectId: string
  identity: Identity
  /** The project's feed position: what was carried in is read again as it moves. */
  cursor: string | undefined
}

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DAY_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Its day, with the year when it isn't this one. */
const dayOf = (at: Date) => (at.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(at)

/** Who carried it in, and when: mine is «you». */
export const carriedBy = (r: Pick<ProjectRelease, 'mine' | 'ownerName' | 'createdAt'>): string =>
  `${r.mine ? 'You, from your Personal' : `${r.ownerName}, from their Personal`} · ${dayOf(new Date(r.createdAt))}`

/** The project's releases, newest first; null when the list doesn't hold this project (it lists the first ones). */
const releasesOf = (projects: readonly { projectId: string; releases: readonly ProjectRelease[] }[], id: string) => {
  const project = projects.find((p) => p.projectId === id)
  return project ? project.releases.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : null
}

/** Read again each time the project's feed moves on from a position already seen (a member carried or took back). */
function useReadAgain(cursor: string | undefined, refetch: () => Promise<unknown>) {
  const seen = useRef(cursor)
  useEffect(() => {
    if (seen.current === cursor) return
    seen.current = cursor
    void refetch()
  }, [cursor, refetch])
}

export function CarriedIn({ projectId, identity, cursor }: Props) {
  const id = useId()
  const read = useQuery({
    queryKey: ['vision', 'carried-in', identity.name],
    queryFn: ({ signal }) => listProjects(identity.token, signal),
    retry: 1,
  })
  useReadAgain(cursor, read.refetch)
  const releases = read.data ? releasesOf(read.data.projects, projectId) : undefined
  return (
    <section className="carried-in" aria-labelledby={id}>
      <h3 id={id} className="eyebrow">
        Carried in from Personal
      </h3>
      {/* While it is read, its place is kept: the reports below don't jump when it comes. */}
      <Waiting words="Reading what was carried in…" waiting={read.isPending} />
      {read.isError && (
        <p className="carried-in-note" role="alert">
          {read.data ? 'This may be out of date.' : 'What was carried in can’t be read now.'}{' '}
          <button
            type="button"
            className="text-button"
            aria-disabled={read.isFetching || undefined}
            onClick={() => !read.isFetching && void read.refetch()}
          >
            {read.isFetching ? 'Reading again…' : 'Try again'}
          </button>
        </p>
      )}
      {releases === null && (
        <p className="carried-in-note">
          What was carried in can’t be listed here: this project isn’t in your list’s read.
        </p>
      )}
      {releases?.length === 0 && (
        <p className="carried-in-note">Nothing carried in yet. A member can carry notes from their Personal.</p>
      )}
      {releases && releases.length > 0 && (
        <ul>
          {releases.map((r) => (
            <li key={r.id}>
              <p className="carried-in-text">{r.text}</p>
              <span className="carried-in-by">{carriedBy(r)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
