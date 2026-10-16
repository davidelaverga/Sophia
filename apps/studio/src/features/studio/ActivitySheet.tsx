// A project's activity, for its admins (docs/plans/project-activity.md, A28): who did what, on whom and when, newest
// first, as the Work pulse names each act; a person filter, and «Earlier» for the page before. Codes and names only,
// never content.
import { useEffect, useState } from 'react'
import type { ActivityEntry } from '@sophia/contracts'
import { EmptyState } from '@sophia/ui'
import { getProjectActivity } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { summaryLabel } from '../work/labels.ts'

interface Props {
  projectId: string
  identity: Identity
  onClose: () => void
}

type Reading = 'reading' | 'idle' | 'failed'

/** When, as the activity says it: day and time, in the reader's own zone. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const who = (person: { name: string | null }) => person.name ?? 'A member'

/**
 * Acts on a member said as their actor did them, beside the actor's name («Marco · Took out of the call · Lucía»); the
 * Work pulse's own words, which name no one, say them from the member's side.
 */
const DONE: Readonly<Record<string, string>> = {
  'room.host_muted': 'Muted in the call',
  'room.host_removed': 'Took out of the call',
  'room.host_camera_off': 'Turned off the camera of',
  'room.host_screen_off': 'Stopped the screen sharing of',
  'room.host_muted_all': 'Muted everyone in the call',
  'project.member_role': 'Changed the role of',
  'project.member_removed': 'Removed from the project',
  'project.archived': 'Archived the project',
  'project.unarchived': 'Brought the project back',
}

const what = (e: ActivityEntry) => DONE[e.summaryCode] ?? summaryLabel(e.summaryCode, e.type)

/** The pages read so far, and the next one. */
function useActivity({ projectId, identity }: Props) {
  const [entries, setEntries] = useState<readonly ActivityEntry[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [reading, setReading] = useState<Reading>('reading')
  const read = (anchor: string | null) => {
    setReading('reading')
    getProjectActivity(identity.token, projectId, anchor).then(
      (page) => {
        setEntries((was) => (anchor ? [...was, ...page.entries] : page.entries))
        setBefore(page.before)
        setReading('idle')
      },
      () => setReading('failed'),
    )
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, as the sheet opens
  useEffect(() => read(null), [])
  return { entries, before, reading, more: () => read(before), retry: () => read(entries.at(-1)?.sequence ?? null) }
}

/** While a page is read: said at once, and why it takes long after a few seconds (Codex P1 on #355). */
function ReadingNote({ reading }: { reading: Reading }) {
  const slow = useSlow(reading === 'reading')
  if (reading !== 'reading') return null
  return (
    <p className="activity-reading" role="status">
      {slow ? SLOW_NOTE : 'Reading the activity…'}
    </p>
  )
}

export function ActivitySheet(props: Props) {
  const { entries, before, reading, more, retry } = useActivity(props)
  const [person, setPerson] = useState('')
  const people = [...new Map(entries.map((e) => [e.actor.id, who(e.actor)])).entries()]
  const shown = person ? entries.filter((e) => e.actor.id === person) : entries
  return (
    <Sheet id="project-activity-title" title="Project activity" onClose={props.onClose}>
      <div className="activity">
        <div className="field activity-filter">
          <select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Everyone</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <ReadingNote reading={reading} />
        {reading === 'idle' && entries.length === 0 && <EmptyState>Nothing has happened here yet.</EmptyState>}
        <ul className="activity-list" aria-label="Activity">
          {shown.map((e) => (
            <li key={e.sequence}>
              <span className="activity-who">{who(e.actor)}</span>
              <span className="activity-what">
                {what(e)}
                {e.target && <span className="activity-on">{` · ${who(e.target)}`}</span>}
              </span>
              <time className="activity-when" dateTime={e.occurredAt}>
                {when(e.occurredAt)}
              </time>
            </li>
          ))}
        </ul>
        {reading === 'failed' && (
          <p className="form-error" role="alert">
            Couldn’t read the activity.{' '}
            <button type="button" className="text-button" onClick={retry}>
              Try again
            </button>
          </p>
        )}
        {before && reading === 'idle' && (
          <button type="button" className="text-button activity-earlier" onClick={more}>
            Earlier
          </button>
        )}
      </div>
    </Sheet>
  )
}
