// The room's calendar: put a session on it (in your own time zone) and take one off. Invitations can then
// carry the start, and the room shows how long until it begins.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RoomSession, SessionCreate } from '@sophia/contracts'
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
        When the room meets. Times are in your time ({zoneName()}); each invitation shows the start in the invitee’s
        own.
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
        Add to the calendar
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
  const now = Date.now()
  if (sessions.length === 0) return <p className="sheet-status">Nothing on the calendar yet.</p>
  return (
    <ul className="session-list">
      {sessions.map((s) => (
        <li key={s.id}>
          <span className="session-title">{s.title}</span>
          <span className="session-when">
            {sessionLabel(s, now)} · {countdown(s, now)}
          </span>
          {editable && (
            <button type="button" className="ghost" onClick={() => void cancelSession(token, s.id).then(onChange)}>
              Cancel
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
