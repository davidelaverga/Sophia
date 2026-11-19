// Stock-entry exposure only: enabling A48 does not register custody, qualify a route, grant funds or start research.
// Parse before creating the pool or companion so an invalid switch cannot partially start the API.
export function apiContributionsFromEnv(value: string | undefined): boolean {
  if (value === undefined || value === 'off') return false
  if (value === 'on') return true
  throw new Error('SOPHIA_API_CONTRIBUTIONS is on, off or unset')
}
