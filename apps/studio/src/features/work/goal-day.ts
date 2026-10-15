// A calendar date as the Studio says it (goal-owner-date.md): «30 Oct 2026», read as the day it names, whatever the
// viewer's zone.

export const dayOf = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
