// The room's calendar: put a session on it (in your own time zone) and take one off. The room shows how long
// until it begins; invitations do not carry sessions yet, and the tab says so rather than promise it.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RoomSession, SessionCreate } from '@sophia/contracts'
import { ConfirmButton } from '@sophia/ui'
import { cancelSession, scheduleSession } from '../../api/access.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { countdown, sessionFromForm, sessionLabel } from './access-view.ts'
import { canInvite, type SheetContext } from './useAccess.ts'

const DURATIONS = [30, 45, 60, 90] as const
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** The zone as people say it ("Atlantic Time"), not its identifier ("Etc/GMT+4"). */
function zoneName(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'longGeneric' }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone()
  } catch {
    return zone()
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date and the next half hour, as the form's starting values. */
function nextSlot(): { date: string; time: string } {
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export function CalendarTab({ context }: { context: SheetContext }) {
  const queryClient = useQueryClient()
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: snapshotKey(context.projectId, context.identity.name) })
  const editable = canInvite(context.membership)
  return (
    <section className="sheet-body" aria-label="Calendar">
      <p className="sheet-lead">
        When the room meets, in your time ({zoneName()}). Everyone in the room sees what’s next; invitations don’t
        include sessions yet.
      </p>
      {editable ? (
        <SessionForm context={context} onScheduled={refresh} />
      ) : (
        <p className="sheet-status">Only editors and admins set the calendar.</p>
      )}
      <SessionList sessions={context.sessions} token={context.identity.token} editable={editable} onChange={refresh} />
    </section>
  )
}

function SessionForm({ context, onScheduled }: { context: SheetContext; onScheduled: () => void }) {
  const [form, setForm] = useState(() => ({ title: 'Room session', ...nextSlot(), minutes: 60 }))
  const schedule = useAdmission<SessionCreate, RoomSession>((key, body) =>
    scheduleSession(context.identity.token, context.projectId, key, body),
  )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await schedule.submit(sessionFromForm(form, zone()))) onScheduled()
  }
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  return (
    <form className="sheet-form calendar-form" onSubmit={(e) => void submit(e)}>
      <label className="field-label" htmlFor="session-title">
        Title
      </label>
      <input
        id="session-title"
        required
        maxLength={180}
        value={form.title}
        onChange={(e) => set({ title: e.target.value })}
      />
      <div className="calendar-when">
        <input
          aria-label="Date"
          type="date"
          required
          value={form.date}
          onChange={(e) => set({ date: e.target.value })}
        />
        <input
          aria-label="Start time"
          type="time"
          required
          value={form.time}
          onChange={(e) => set({ time: e.target.value })}
        />
        <select aria-label="Length" value={form.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="pill primary" disabled={schedule.state.status === 'sending'}>
        {schedule.state.status === 'sending' ? 'Scheduling…' : 'Schedule the session'}
      </button>
      <p className="sheet-status" role="status">
        {schedule.state.status === 'rejected' && schedule.state.error.message}
      </p>
    </form>
  )
}

interface ListProps {
  sessions: readonly RoomSession[]
  token: string
  editable: boolean
  onChange: () => void
}

function SessionList({ sessions, token, editable, onChange }: ListProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const now = Date.now()
  if (sessions.length === 0) return <p className="sheet-status">Nothing on the calendar yet.</p>
  const cancel = (s: RoomSession) => {
    setFailed(null)
    cancelSession(token, s.id)
      .then(onChange)
      .catch(() => setFailed(`Couldn’t cancel “${s.title}”. Try again.`))
  }
  return (
    <>
      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <span className="session-title">{s.title}</span>
            <span className="session-when">
              {sessionLabel(s, now)} · {countdown(s, now)}
            </span>
            {editable && (
              <ConfirmButton
                label="Cancel"
                warning="It leaves the room’s calendar for everyone."
                confirm="Cancel session"
                onConfirm={() => cancel(s)}
              />
            )}
          </li>
        ))}
      </ul>
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}
    </>
  )
}
