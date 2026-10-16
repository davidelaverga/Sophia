// The live personal companion's model service: the installed dsh one, composed in this process as its package documents
// ("mount the service and at least one adapter"): @deepseek-ai/dsh-llm's LlmRuntime and the pinned pi-ai adapter, with
// the one provider route the configuration names. No other dsh service is mounted, so nothing here has a session, an
// agent, tools, files or a home. The adapter resolves the route's credential by its reference (apiKeyEnv) from this
// process's environment when a call is made; nothing here reads or keeps its value. No call is made by composing.
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import * as piAi from '@deepseek-ai/dsh-llm-pi-ai'
import type { LiveCompanionSettings, PersonalLlm } from './companion-live.ts'

export interface PersonalModelService {
  readonly llm: PersonalLlm
  dispose(): Promise<void>
}

/** The composed service for `settings`' one route, or an error if dsh does not register exactly that route. */
export async function composePersonalLlm(settings: LiveCompanionSettings): Promise<PersonalModelService> {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(piAi, { providers: { [settings.call.provider]: { ...settings.profile } } })
    const routes = ctx.llm.listProviders().map((p) => p.id)
    if (routes.length !== 1 || routes[0] !== settings.call.provider) {
      throw new Error('personal companion: the model service did not register exactly its route')
    }
  } catch (err: unknown) {
    await ctx.fiber.dispose()
    throw err
  }
  return {
    llm: { prepareCall: (config, signal) => ctx.llm.prepareCall(config, signal) },
    dispose: async () => {
      await ctx.fiber.dispose()
    },
  }
}
