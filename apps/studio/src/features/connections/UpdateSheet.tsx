// The update's preview (docs/plans/project-connections.md): built from the newest closed meeting's recap (A12), its
// lines chosen one by one, shown exactly as a channel would receive it, and copied as it is. Nothing is sent.
import { useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { getRecap, listMeetings, type MeetingRecap } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { routePath } from '../../app/route.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { Waiting } from '../../app/Waiting.tsx'
import { updateLines, updateText } from './update-text.ts'

interface Props {
  projectId: string
  identity: Identity
  title: string
  onClose: () => void
}

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dayOf = (iso: string) => DAY.format(new Date(iso))

/** The newest closed meeting's recap: undefined while read, null when there is none. */
function useNewestRecap({ projectId, identity }: Pick<Props, 'projectId' | 'identity'>) {
  const meetings = useQuery({
    queryKey: ['vision', 'update-meetings', projectId, identity.name],
    queryFn: ({ signal }) => listMeetings(identity.token, projectId, 20, signal),
    retry: 1,
  })
  const newest = meetings.data?.meetings.find((m) => m.endedAt !== null)
  const recap = useQuery({
    queryKey: ['vision', 'update-recap', projectId, newest?.id, identity.name],
    queryFn: ({ signal }) => getRecap(identity.token, projectId, newest?.id ?? '', signal),
    enabled: newest !== undefined,
    retry: 1,
  })
  const failed = meetings.isError || recap.isError
  const none = meetings.isSuccess && newest === undefined
  const again = () => void (meetings.isError ? meetings.refetch() : recap.refetch())
  return { recap: recap.data, waiting: !failed && !none && recap.data === undefined, failed, none, again }
}

export function UpdateSheet(props: Props) {
  const id = useId()
  const read = useNewestRecap(props)
  return (
    <Sheet id={id} title="One update, the right audience" onClose={props.onClose}>
      <Waiting words="Reading the newest meeting…" waiting={read.waiting} />
      {read.failed && (
        <p className="sheet-lead" role="alert">
          The meeting’s recap can’t be read now.{' '}
          <button type="button" className="text-button" onClick={read.again}>
            Try again
          </button>
        </p>
      )}
      {read.none && <p className="sheet-lead">An update is built from a closed meeting’s recap. There is none yet.</p>}
      {read.recap && <Compose recap={read.recap} title={props.title} projectId={props.projectId} />}
      <p className="connection-note">No Slack channel is connected. Nothing is sent from here.</p>
    </Sheet>
  )
}

/** The recap's lines, each with its box, and the exact text they make. */
function Compose({ recap, title, projectId }: { recap: MeetingRecap; title: string; projectId: string }) {
  const previewId = useId()
  const lines = updateLines(recap)
  const [changed, setChanged] = useState<Readonly<Record<string, boolean>>>({})
  const chosen = new Set(lines.filter((l) => changed[l.key] ?? l.chosen).map((l) => l.key))
  const link = `${window.location.origin}${routePath({ projectId, view: 'studio' })}`
  const text = updateText({ title, recap, lines, chosen, link, day: dayOf })
  return (
    <>
      <fieldset className="update-lines">
        <legend className="field-label">Its lines</legend>
        {lines.map((l) => (
          <label key={l.key} className="update-line">
            <input
              type="checkbox"
              checked={chosen.has(l.key)}
              onChange={(e) => setChanged((was) => ({ ...was, [l.key]: e.target.checked }))}
            />
            {l.text}
          </label>
        ))}
      </fieldset>
      <section className="update-preview" aria-labelledby={previewId}>
        <h3 id={previewId} className="field-label">
          The update
        </h3>
        {/* A new text is a new copy: what was said of the last one goes with it. */}
        <Copyable key={text} text={text} ready={chosen.size > 0} />
      </section>
    </>
  )
}

/** The text as it would go, and Copy, which copies exactly it (or selects it, where copying isn't allowed). */
function Copyable({ text, ready }: { text: string; ready: boolean }) {
  const pre = useRef<HTMLPreElement>(null)
  const [said, setSaid] = useState<string | null>(null)
  const copy = () => {
    if (!ready) return
    navigator.clipboard.writeText(text).then(
      () => setSaid('Copied. Paste it where your team reads it.'),
      () => {
        const range = document.createRange()
        if (pre.current) range.selectNodeContents(pre.current)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        setSaid('Selected: copy it with your keyboard.')
      },
    )
  }
  return (
    <>
      <pre ref={pre} className="update-text">
        {text}
      </pre>
      <div className="update-acts">
        <button type="button" className="pill" aria-disabled={!ready || undefined} onClick={copy}>
          Copy the update
        </button>
        <span role="status" className="connection-note">
          {said}
        </span>
      </div>
    </>
  )
}
