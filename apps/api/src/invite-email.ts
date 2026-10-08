// The invitation email (S1-04A): the same quiet, dark room as the Studio, readable in every client (tables,
// inline styles, system fallbacks for the fonts). Every user-supplied word is escaped. A session adds a
// calendar file, so the start lands in the invitee's calendar.

export interface SessionTimes {
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
}

export interface InviteEmailInput {
  invitationId: string
  inviterName: string | null
  projectTitle: string
  kind: 'guest' | 'member'
  role: 'editor' | 'viewer' | null
  email: string
  url: string
  session: SessionTimes | null
}

export interface InviteEmail {
  subject: string
  html: string
  text: string
  /** An iCalendar event for the session, or null without one. */
  ics: string | null
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)

/** A person's name from what the token carried: the first word of an email's local part, capitalized. */
export function personName(nameOrEmail: string | null): string {
  if (!nameOrEmail) return 'Someone'
  const local = nameOrEmail.split('@')[0] ?? nameOrEmail
  const word = local.split(/[.\-_+\s]/)[0] || local
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** "Thursday, September 25 · 10:00 – 11:00 (America/Bogota)", in the session's own time zone. */
export function sessionWhen(s: SessionTimes): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone, weekday: 'long', month: 'long', day: 'numeric' })
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: s.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `${day.format(new Date(s.startsAt))} · ${time.format(new Date(s.startsAt))} – ${time.format(new Date(s.endsAt))} (${s.timeZone})`
}

interface Words {
  subject: string
  headline: string
  lead: string
  action: string
  note: string
}

function wordsFor(input: InviteEmailInput): Words {
  const who = personName(input.inviterName)
  const project = `“${input.projectTitle}”`
  if (input.kind === 'member') {
    const role = input.role === 'viewer' ? 'a viewer' : 'an editor'
    return {
      subject: `${who} invited you to ${project} on Sophia`,
      headline: `${who} invited you to ${project}`,
      lead: `You would join as ${role}: the room, its goals and the work, with Sophia. Sign in with ${input.email}; the invitation is only for that address.`,
      action: 'Accept the invitation',
      note: 'You will get a sign-in code at this address. Nothing changes until you accept.',
    }
  }
  return {
    subject: `${who} invited you to a room in Sophia`,
    headline: `${who} invited you to the room`,
    lead: `${project} is a room where people and Sophia think together. You can come in without an account: say your name, and someone in the room lets you in.`,
    action: 'Join the room',
    note: 'The link opens the room’s lobby. You reach the call only, never the project’s records.',
  }
}

const SANS = `'Geist',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`
const MONO = `'Geist Mono',ui-monospace,Menlo,Consolas,monospace`

function sessionBlock(session: SessionTimes | null): string {
  if (!session) return ''
  // A soft plane with a warm rule at its edge, not a boxed card: the time is the one fact to keep.
  return `<tr><td style="padding:0 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgba(237,234,242,0.04);border-left:2px solid #f1dcc7;border-radius:0 8px 8px 0"><tr><td style="padding:14px 18px;font:500 15px/1.5 ${SANS};color:#edeaf2">${escapeHtml(session.title)}<br><span style="font-weight:400;font-size:14px;color:rgba(237,234,242,0.64)">${escapeHtml(sessionWhen(session))}</span></td></tr></table></td></tr>`
}

/** The Umbral mark, served by the Studio the link points at: mail clients do not draw SVG. */
export const markUrl = (url: string) => `${new URL(url).origin}/brand/umbral-mark.png`

function renderHtml(input: InviteEmailInput, w: Words): string {
  const url = escapeHtml(input.url)
  const mark = escapeHtml(markUrl(input.url))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(w.subject)}</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#050408">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050408;background-image:radial-gradient(ellipse at 50% 0%,rgba(156,130,245,0.24),rgba(5,4,8,0) 62%)"><tr><td align="center" style="padding:48px 20px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 0 44px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:0 10px 0 0;vertical-align:middle"><img src="${mark}" width="24" height="24" alt="" style="display:block;border:0"></td><td style="vertical-align:middle;font:600 15px/1 ${SANS};color:#edeaf2;letter-spacing:0.01em">Sophia</td></tr></table></td></tr>
<tr><td style="padding:0 0 14px;font:600 26px/1.25 ${SANS};letter-spacing:-0.02em;color:#f4f0ff">${escapeHtml(w.headline)}</td></tr>
<tr><td style="padding:0 0 28px;font:400 15px/1.6 ${SANS};color:rgba(237,234,242,0.72)">${escapeHtml(w.lead)}</td></tr>
${sessionBlock(input.session)}
<tr><td style="padding:0 0 26px"><a href="${url}" style="display:inline-block;background:#f4f0ff;color:#050408;font:600 14px/1 ${SANS};text-decoration:none;padding:13px 20px;border-radius:6px">${escapeHtml(w.action)}</a></td></tr>
<tr><td style="padding:0 0 10px;font:400 13px/1.55 ${SANS};color:rgba(237,234,242,0.52)">${escapeHtml(w.note)}</td></tr>
<tr><td style="padding:0 0 40px;font:400 12px/1.6 ${SANS};color:rgba(237,234,242,0.4)">Or open this link:<br><a href="${url}" style="font:400 11.5px/1.6 ${MONO};color:rgba(237,234,242,0.48);text-decoration:none;word-break:break-all">${url}</a></td></tr>
<tr><td style="border-top:1px solid rgba(237,234,242,0.1);padding:18px 0 0;font:400 12px/1.55 ${SANS};color:rgba(237,234,242,0.4)">Sent by Sophia for ${escapeHtml(personName(input.inviterName))}. If you were not expecting this invitation, you can ignore it: nothing happens unless the link is opened.</td></tr>
</table></td></tr></table></body></html>`
}

function renderText(input: InviteEmailInput, w: Words): string {
  const when = input.session ? `\nWhen: ${input.session.title}, ${sessionWhen(input.session)}\n` : ''
  return `${w.headline}\n\n${w.lead}\n${when}\n${w.action}: ${input.url}\n\n${w.note}\n\nSent by Sophia for ${personName(input.inviterName)}. If you were not expecting this invitation, you can ignore it.\n`
}

const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const icsTime = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** RFC 5545 folding: lines over 75 characters continue on the next line after one space. */
const fold = (line: string) => line.match(/.{1,74}/g)?.join('\r\n ') ?? line

export function icsEvent(opts: {
  uid: string
  session: SessionTimes
  url: string
  description: string
  now?: Date
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sophia//Room invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${icsTime((opts.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsTime(opts.session.startsAt)}`,
    `DTEND:${icsTime(opts.session.endsAt)}`,
    `SUMMARY:${icsText(opts.session.title)}`,
    `DESCRIPTION:${icsText(opts.description)}`,
    `URL:${opts.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(fold).join('\r\n')}\r\n`
}

export function inviteEmail(input: InviteEmailInput): InviteEmail {
  const w = wordsFor(input)
  return {
    subject: w.subject,
    html: renderHtml(input, w),
    text: renderText(input, w),
    ics: input.session
      ? icsEvent({
          uid: `${input.invitationId}@sophia`,
          session: input.session,
          url: input.url,
          description: `${w.headline}. ${w.action}: ${input.url}`,
        })
      : null,
  }
}
