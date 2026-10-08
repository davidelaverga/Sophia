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

/** "Thursday, September 25 · 10:00 – 11:00 Colombia Time", in the session's own time zone, named the way people say it. */
export function sessionWhen(s: SessionTimes): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone, weekday: 'long', month: 'long', day: 'numeric' })
  const time = (iso: string, zone?: 'shortGeneric') =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: s.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: zone,
    }).format(new Date(iso))
  return `${day.format(new Date(s.startsAt))} · ${time(s.startsAt)} – ${time(s.endsAt, 'shortGeneric')}`
}

interface Words {
  subject: string
  /** The sentence for the text version and the calendar entry. */
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
      lead: `Join as ${role}, with Sophia. Sign in with ${input.email}, the address this invitation is for.`,
      action: 'Accept the invitation',
      note: 'We send a sign-in code to that address. Nothing changes until you accept.',
    }
  }
  return {
    subject: `${who} invited you to a room in Sophia`,
    headline: `${who} invited you to the room ${project}`,
    lead: 'A room where people and Sophia think together. No account needed: say your name, and someone lets you in.',
    action: 'Join the room',
    note: 'You join the call only; the project’s work stays with its members.',
  }
}

const SANS = `'Geist',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`
const MONO = `'Geist Mono',ui-monospace,Menlo,Consolas,monospace`
// Solid inks over the void (#050408), so clients that drop rgba (Outlook's Word engine) keep the same greys.
const INK = { text: '#edeaf2', bright: '#f4f0ff', two: '#acaab0', three: '#7e7c82', four: '#626066', warm: '#f1dcc7' }

/** Where the link goes, when it is a web address: its origin (for the mark) and what the reader sees of it. */
export function siteOf(url: string): { origin: string; shown: string } | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? { origin: u.origin, shown: `${u.host}${u.pathname}` }
      : null
  } catch {
    return null
  }
}

/** The Umbral mark, served by the Studio the link points at (mail clients do not draw SVG); null off the web. */
export const markUrl = (url: string): string | null => {
  const site = siteOf(url)
  return site && `${site.origin}/brand/umbral-mark.png`
}

function brandRow(url: string): string {
  const mark = markUrl(url)
  const img = mark
    ? `<td style="padding:0 10px 0 0;vertical-align:middle"><img src="${escapeHtml(mark)}" width="24" height="24" alt="" style="display:block;border:0"></td>`
    : ''
  return `<tr><td style="padding:0 0 40px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${img}<td style="vertical-align:middle;font:600 15px/1 ${SANS};color:${INK.text};letter-spacing:0.01em">Sophia</td></tr></table></td></tr>`
}

/** Who invites, as the Studio shows a person at the door: their initial in a warm ring, then their name. */
function inviterRow(name: string): string {
  return `<tr><td style="padding:0 0 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="30" height="30" align="center" style="width:30px;height:30px;border:1px solid #6e655e;border-radius:50%;font:600 13px/30px ${SANS};color:${INK.warm}">${escapeHtml(name.charAt(0))}</td><td style="padding:0 0 0 12px;font:400 14px/1.4 ${SANS};color:${INK.two}"><span style="font-weight:500;color:${INK.text}">${escapeHtml(name)}</span> invited you</td></tr></table></td></tr>`
}

function sessionBlock(session: SessionTimes | null): string {
  if (!session) return ''
  // A soft plane with a warm rule at its edge, not a boxed card: the time is the one fact to keep.
  return `<tr><td style="padding:0 0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0e12;border-left:2px solid ${INK.warm};border-radius:0 8px 8px 0"><tr><td style="padding:14px 18px;font:500 15px/1.5 ${SANS};color:${INK.text}">${escapeHtml(session.title)}<br><span style="font-weight:400;font-size:14px;color:${INK.two}">${escapeHtml(sessionWhen(session))}</span><br><span style="font-weight:400;font-size:12px;color:${INK.three}">The calendar invitation is attached.</span></td></tr></table></td></tr>`
}

/** The address under the button: its site and path, linked; the whole link when it is not a web one. */
function linkRow(url: string): string {
  const site = siteOf(url)
  const shown = escapeHtml(site ? site.shown : url)
  return `<tr><td style="padding:0 0 40px;font:400 12px/1.6 ${SANS};color:${INK.four};word-break:break-all">Or open <a href="${escapeHtml(url)}" style="font:400 12px/1.6 ${MONO};color:${INK.three};text-decoration:none;word-break:break-all">${shown}</a></td></tr>`
}

function renderHtml(input: InviteEmailInput, w: Words): string {
  const url = escapeHtml(input.url)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escapeHtml(w.subject)}</title><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@500&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#050408">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#050408" style="background:#050408;background-image:radial-gradient(ellipse at 50% 0%,rgba(156,130,245,0.24),rgba(5,4,8,0) 62%)"><tr><td align="center" style="padding:48px 20px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
${brandRow(input.url)}
${inviterRow(personName(input.inviterName))}
<tr><td style="padding:0 0 12px;font:600 28px/1.2 ${SANS};letter-spacing:-0.02em;color:${INK.bright}">${escapeHtml(input.projectTitle)}</td></tr>
<tr><td style="padding:0 0 28px;font:400 15px/1.6 ${SANS};color:${INK.two}">${escapeHtml(w.lead)}</td></tr>
${sessionBlock(input.session)}
<tr><td style="padding:0 0 24px"><a href="${url}" style="display:inline-block;background:${INK.bright};color:#050408;font:600 14px/1 ${SANS};text-decoration:none;padding:13px 20px;border-radius:6px">${escapeHtml(w.action)}</a></td></tr>
<tr><td style="padding:0 0 8px;font:400 13px/1.55 ${SANS};color:${INK.three}">${escapeHtml(w.note)}</td></tr>
${linkRow(input.url)}
<tr><td style="border-top:1px solid #1d1c21;padding:18px 0 0;font:400 12px/1.55 ${SANS};color:${INK.four}">Sent by Sophia for ${escapeHtml(personName(input.inviterName))}. If you were not expecting this invitation, you can ignore it: nothing happens unless the link is opened.</td></tr>
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
