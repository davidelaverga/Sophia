// When something happened, the way a list says it: "Today", "Yesterday", "3 days ago", then the date.

/** "Today", "Yesterday", "3 days ago", then the date. */
export function openedLabel(openedAt: number, now: number): string {
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(openedAt).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(openedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
