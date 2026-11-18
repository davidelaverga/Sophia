/** Raw, exact startup switch. Invalid values fail before database side effects. */
export function ownerRunnerResultsFromEnv(value: string | undefined): boolean {
  if (value === undefined || value === 'off') return false
  if (value === 'on') return true
  throw new Error('SOPHIA_OWNER_RUNNER_RESULTS is on, off or unset')
}
