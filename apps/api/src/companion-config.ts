// Who answers in the personal space, from the API's environment (server.ts):
// - SOPHIA_COMPANION unset: no companion; personal messages are refused and the space says Sophia can't answer here.
// - rehearse: the keyless scripted rehearsal, for development only (a production start refuses it).
// - live: the live companion (companion-live.ts), only with its complete settings in SOPHIA_PERSONAL_COMPANION, the
//   credential its route names present in this environment (only that it is set is checked; its value is never read
//   here), and its payer admitted in the database (0073). Anything missing stops the start: live never falls back to
//   the rehearsal, another route or no accounting.
import { personalCompanionAdmitted } from '@sophia/persistence'
import type pg from 'pg'
import type { Companion } from './companion.ts'
import { composePersonalLlm } from './companion-dsh.ts'
import { liveCompanion, liveSettings } from './companion-live.ts'
import { rehearsalCompanion } from './companion-rehearsal.ts'

export interface ConfiguredCompanion {
  readonly companion: Companion | null
  dispose(): Promise<void>
}

const none: ConfiguredCompanion = { companion: null, dispose: () => Promise.resolve() }

export async function personalCompanionFrom(
  env: Readonly<Record<string, string | undefined>>,
  pool: pg.Pool,
): Promise<ConfiguredCompanion> {
  const mode = env.SOPHIA_COMPANION?.trim() || undefined
  if (!mode) return none
  if (mode === 'rehearse') {
    if (env.NODE_ENV === 'production') throw new Error('The rehearsal companion is for development only')
    return { companion: rehearsalCompanion(), dispose: () => Promise.resolve() }
  }
  if (mode !== 'live') throw new Error('SOPHIA_COMPANION is rehearse, live or unset')
  const settings = liveSettings(env.SOPHIA_PERSONAL_COMPANION)
  const reference = settings.credentialRef
  if (!env[reference]?.trim()) throw new Error(`personal companion: its credential reference ${reference} is not set`)
  if (!(await personalCompanionAdmitted(pool, settings.payer, settings.owner))) {
    throw new Error('personal companion: its payer is not admitted for its owner (0073)')
  }
  const service = await composePersonalLlm(settings)
  return { companion: liveCompanion(settings, service.llm, pool), dispose: () => service.dispose() }
}
