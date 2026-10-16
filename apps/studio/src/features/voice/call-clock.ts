// How long the call has run (docs/plans/room-basics.md): «12:04», or «1:02:05» past an hour, and the same in words for
// a screen reader. Pure, so the words are unit-tested.

const two = (n: number) => String(n).padStart(2, '0')

/** «0:00», «1:05», «1:02:05». */
export function callClock(ms: number): string {
  const all = Math.max(0, Math.floor(ms / 1000))
  const [h, m, s] = [Math.floor(all / 3600), Math.floor((all % 3600) / 60), all % 60]
  return h > 0 ? `${String(h)}:${two(m)}:${two(s)}` : `${String(m)}:${two(s)}`
}

const counted = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`

/** «In the call for 12 minutes», «… for 1 hour 2 minutes», «… for less than a minute». */
export function callClockWords(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  if (h === 0 && m === 0) return 'In the call for less than a minute'
  const parts = [h > 0 ? counted(h, 'hour') : null, m > 0 || h === 0 ? counted(m, 'minute') : null]
  return `In the call for ${parts.filter(Boolean).join(' ')}`
}
