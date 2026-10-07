// One way to say when (docs/plans/time-words.md): pure words for a time, given `now`, in the Studio's English. Units
// are short and spaced («40 s», «12 min», «3 h»); days are spelled («1 day», «2 days»). What happened is rounded down,
// never claiming more time than has passed, and is said in days from a day on; what is ahead is rounded to the nearest,
// as an estimate, and is said in hours up to two days (a reset in 36 h matters to the hour).

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const days = (n: number) => `${String(n)} ${n === 1 ? 'day' : 'days'}`

/**
 * When something happened: «just now», «12 min ago», «3 h ago», «2 days ago». With `seconds`, for live readings that
 * tick fast: «6 s ago» under a minute («just now» under a second).
 */
export function ago(at: string, now: number, options: { seconds?: boolean } = {}): string {
  const passed = Math.max(0, now - Date.parse(at))
  if (options.seconds === true && passed >= SECOND && passed < MINUTE) {
    return `${String(Math.floor(passed / SECOND))} s ago`
  }
  return passed < MINUTE ? 'just now' : `${roughly(passed)} ago`
}

/** How long, in its largest unit, rounded down, for a tight place: «under a minute», «20 min», «3 h», «2 days». */
export function roughly(ms: number): string {
  const passed = Math.max(0, ms)
  if (passed < MINUTE) return 'under a minute'
  if (passed < HOUR) return `${String(Math.floor(passed / MINUTE))} min`
  if (passed < DAY) return `${String(Math.floor(passed / HOUR))} h`
  return days(Math.floor(passed / DAY))
}

/** How long something took or has taken: «under a minute», «38 min», «1 h 12 min», «3 h», «2 days». */
export function lasted(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${String(minutes)} min`
  if (ms < DAY) {
    const hours = Math.floor(minutes / 60)
    return minutes % 60 === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes % 60)} min`
  }
  return days(Math.floor(ms / DAY))
}

/** About how long, an estimate to the nearest: «12 min», «36 h», «3 days» (at least «1 min»). */
export function about(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.round(ms / HOUR)
  if (hours < 48) return `${String(hours)} h`
  return days(Math.round(ms / DAY))
}

/** How long until: «in a moment», «in 12 min», «in 3 h», «in 2 days». */
export function inTime(at: string, now: number): string {
  const left = Date.parse(at) - now
  return left < MINUTE ? 'in a moment' : `in ${about(left)}`
}

// Dates and clocks: the viewer's own zone, in English, a 24-hour clock.
const DAY_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' })

const dateOf = (at: string | Date) => (typeof at === 'string' ? new Date(at) : at)
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** A time that isn't one (a malformed record) says nothing, rather than breaking the page. */
const invalid = (d: Date) => Number.isNaN(d.getTime())

/** Its date: «Oct 6», with the year when it isn't this one («Dec 31, 2025»). */
export function dayOf(at: string | Date, now: number): string {
  const date = dateOf(at)
  if (invalid(date)) return ''
  return (date.getFullYear() === new Date(now).getFullYear() ? DAY_MONTH : DAY_MONTH_YEAR).format(date)
}

/** Its time on a 24-hour clock: «09:05», «21:40». */
export function clock(at: string | Date): string {
  const date = dateOf(at)
  return invalid(date) ? '' : CLOCK.format(date)
}

/** Whether two times fall on the same day, in the viewer's zone. */
export const sameDay = (a: string | Date, b: string | Date): boolean => startOfDay(dateOf(a)) === startOfDay(dateOf(b))

/** Its date and time: «Oct 6, 09:12». */
export const when = (at: string | Date, now: number): string => `${dayOf(at, now)}, ${clock(at)}`

/**
 * A day in a list, either way from today: «Today», «Yesterday», «Tomorrow», a weekday within the week, then the date.
 * With `past`, for what has happened: a time a little past now (another device's clock) is today, never ahead.
 */
export function dayLabel(at: string | Date, now: number, options: { past?: boolean } = {}): string {
  const given = dateOf(at)
  if (invalid(given)) return ''
  const date = options.past === true && given.getTime() > now ? new Date(now) : given
  const away = Math.round((startOfDay(date) - startOfDay(new Date(now))) / DAY)
  if (away === 0) return 'Today'
  if (away === -1) return 'Yesterday'
  if (away === 1) return 'Tomorrow'
  if (Math.abs(away) < 7) return WEEKDAY.format(date)
  return dayOf(date, now)
}

/** The same inside a sentence: «used yesterday», «today at 16:00», «Friday at 16:00». */
export function dayInSentence(at: string | Date, now: number, options: { past?: boolean } = {}): string {
  const label = dayLabel(at, now, options)
  return label === 'Today' || label === 'Yesterday' || label === 'Tomorrow' ? label.toLowerCase() : label
}
