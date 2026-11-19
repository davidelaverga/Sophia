// Enrollment is independent from maintenance and from every execution/result switch.
export function ownerHostEnrollmentFromEnv(value: string | undefined): boolean {
  const mode = value
  if (mode === undefined || mode === 'off') return false
  if (mode === 'on') return true
  throw new Error('SOPHIA_OWNER_HOST_ENROLLMENT is on, off or unset')
}
