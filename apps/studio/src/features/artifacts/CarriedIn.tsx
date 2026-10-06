// What was carried in from Personal (docs/plans/project-carried-in.md, Davide's chapter 1, the project's side): in
// Knowledge, the notes members carried to this project, exactly as carried, with who and when, and nothing else of
// anyone's Personal. Read from the project list (`GET /api/v1/projects`, each project's releases), as Personal's Work
// reads it. Only under the vision flag.
import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import type { ProjectRelease } from '@sophia/contracts'
import { listProjects } from '../../api/personal.ts'
import type { Identity } from '../../app/dev-identity.ts'

interface Props {
  projectId: string
  identity: Identity
}

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DAY_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Its day, with the year when it isn't this one. */
const dayOf = (at: Date) => (at.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(at)

/** Who carried it in, and when: mine is «you». */
export const carriedBy = (r: Pick<ProjectRelease, 'mine' | 'ownerName' | 'createdAt'>): string =>
  `${r.mine ? 'You, from your Personal' : `${r.ownerName}, from their Personal`} · ${dayOf(new Date(r.createdAt))}`

export function CarriedIn({ projectId, identity }: Props) {
  const id = useId()
  const read = useQuery({
    queryKey: ['vision', 'carried-in', identity.name],
    queryFn: ({ signal }) => listProjects(identity.token, signal),
    retry: 1,
  })
  // While it is read, nothing: the reports below don't jump.
  if (read.isPending) return null
  const releases = (read.data?.projects.find((p) => p.projectId === projectId)?.releases ?? []).toSorted(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
  return (
    <section className="carried-in" aria-labelledby={id}>
      <h3 id={id} className="eyebrow">
        Carried in from Personal
      </h3>
      {read.isError && !read.data ? (
        <p className="carried-in-note" role="alert">
          What was carried in can’t be read now.{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      ) : releases.length === 0 ? (
        <p className="carried-in-note">Nothing carried in yet. A member can carry notes from their Personal.</p>
      ) : (
        <>
          {read.isError && (
            <p className="carried-in-note">
              This may be out of date.{' '}
              <button type="button" className="text-button" onClick={() => void read.refetch()}>
                Try again
              </button>
            </p>
          )}
          <ul>
            {releases.map((r) => (
              <li key={r.id}>
                <p className="carried-in-text">{r.text}</p>
                <span className="carried-in-by">{carriedBy(r)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
