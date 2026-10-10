// The room's calendar: put a session on it (in your own time zone) and take one off. The room shows how long
// until it begins; invitations do not carry sessions yet, and the tab says so rather than promise it. The form
// says when a time overlaps another session, and after scheduling it moves on, so a second click is no twin.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { RoomSession, SessionCreate } from '@sophia/contracts'
import { ConfirmButton } from '@sophia/ui'
import { cancelSession, scheduleSession } from '../../api/access.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import {
  admissionLabel,
  clashWith,
  countdown,
  formSlot,
  plannedSession,
  scheduleLines,
  sessionFromForm,
  sessionLabel,
} from './access-view.ts'
import { AdmissionNote } from './AdmissionNote.tsx'
import { canInvite, type SheetContext } from './useAccess.ts'
import { useNow } from '../../app/use-now.ts'

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

/** Today's date and the next half hour, as the form's starting values. */
function nextSlot(): { date: string; time: string } {
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return formSlot(d)
}

export function CalendarTab({ context }: { context: SheetContext }) {
  const queryClient = useQueryClient()
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: snapshotKey(context.projectId, context.identity.name) })
  const editable = canInvite(context.membership)
  return (
    <section className="sheet-tab-body" aria-label="Calendar">
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

interface SessionFields {
  title: string
  date: string
  time: string
  minutes: number
}

function SessionForm({ context, onScheduled }: { context: SheetContext; onScheduled: () => void }) {
  const [form, setForm] = useState<SessionFields>(() => ({ title: 'Room session', ...nextSlot(), minutes: 60 }))
  const schedule = useAdmission<SessionCreate, RoomSession>((key, body) =>
    scheduleSession(context.identity.token, context.projectId, key, body),
  )
  const set = (patch: Partial<SessionFields>) => setForm((f) => ({ ...f, ...patch }))
  const scheduled = (created: RoomSession | undefined) => {
    if (!created) return
    set(formSlot(new Date(created.endsAt)))
    onScheduled()
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    scheduled(await schedule.send(sessionFromForm(form, zone())))
  }
  // After no reply the session asked for is still open: its fields wait, locked, until Try again answers.
  const frozen = schedule.state.status === 'unknown'
  const planned = plannedSession(form, zone())
  const clash = planned ? clashWith(context.sessions, planned) : null
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
        readOnly={frozen}
        onChange={(e) => set({ title: e.target.value })}
      />
      <WhenFields form={form} set={set} frozen={frozen} />
      <button type="submit" className="pill primary" disabled={schedule.state.status === 'sending'}>
        {admissionLabel(schedule.state.status, 'Schedule the session', 'Scheduling…')}
      </button>
      <p className="sheet-status" role="status">
        <ScheduleNote state={schedule.state} clash={clash} onRetry={() => void schedule.retry().then(scheduled)} />
      </p>
    </form>
  )
}

/** When the session starts, and for how long: one row where they fit, the date on its own row where not. */
interface WhenProps {
  form: SessionFields
  set: (patch: Partial<SessionFields>) => void
  frozen: boolean
}

function WhenFields({ form, set, frozen }: WhenProps) {
  return (
    <div className="calendar-when">
      <input
        aria-label="Date"
        type="date"
        required
        value={form.date}
        disabled={frozen}
        onChange={(e) => set({ date: e.target.value })}
      />
      <input
        aria-label="Start time"
        type="time"
        required
        value={form.time}
        disabled={frozen}
        onChange={(e) => set({ time: e.target.value })}
      />
      <select
        aria-label="Length"
        value={form.minutes}
        disabled={frozen}
        onChange={(e) => set({ minutes: Number(e.target.value) })}
      >
        {DURATIONS.map((m) => (
          <option key={m} value={m}>
            {m} min
          </option>
        ))}
      </select>
    </div>
  )
}

interface NoteProps {
  state: AdmissionState<SessionCreate, RoomSession>
  clash: RoomSession | null
  onRetry: () => void
}

/**
 * The form's one line: a refusal or no answer (with its retry), or what was just put on the calendar and an overlap
 * before it happens, both when both are true (scheduleLines).
 */
function ScheduleNote({ state, clash, onRetry }: NoteProps) {
  const now = useNow()
  if (state.status === 'rejected' || state.status === 'unknown')
    return <AdmissionNote state={state} onRetry={onRetry} />
  return scheduleLines(state.status === 'done' ? state.result : null, clash, now).join(' ') || null
}

interface ListProps {
  sessions: readonly RoomSession[]
  token: string
  editable: boolean
  onChange: () => void
}

function SessionList({ sessions, token, editable, onChange }: ListProps) {
  const [failed, setFailed] = useState<string | null>(null)
  const now = useNow()
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
