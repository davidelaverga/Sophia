// Where the terms and the privacy notice live (docs/plans/terms-privacy.md): their own addresses, open to anyone,
// signed in or not, as /join is.
import type { LegalDoc } from './legal-text.ts'

export function legalDoc(pathname: string): LegalDoc | null {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/terms') return 'terms'
  return path === '/privacy' ? 'privacy' : null
}
