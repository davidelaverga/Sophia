/**
 * TEST ONLY — SMC-M02 M02-T10 fault injection. Never part of a profile.
 *
 * Makes the tool scheduler fail while an assistant step still has tool calls
 * pending. Every public tool seam of dsh is fail-closed (a throwing guard,
 * `tools/pre-execute`, `tools/post-execute` or concurrency classifier becomes
 * an error result, not a step failure), so no black-box input reaches the
 * failed-step path. This plugin uses the seam upstream's own test uses for
 * the same case (`packages/core/agent-loop/tests/tool-calls.spec.ts`, phase
 * `execution-mode`): it wraps the public `ctx.tools.executionMode` method so
 * that classifying a call whose arguments contain the configured marker
 * throws. It touches nothing else and changes no loop code.
 */

export const name = 'sophia-test-fault-tool-mode'
export const inject = ['tools']

export function apply(ctx, config) {
  const marker = config?.marker
  if (typeof marker !== 'string' || marker.length === 0) throw new TypeError(`${name}: config.marker must be a non-empty string`)
  const tools = ctx.tools
  const original = tools.executionMode
  tools.executionMode = function executionMode(exec) {
    if (JSON.stringify(exec.arguments ?? null).includes(marker)) {
      process.stderr.write(`[${name}] failing the scheduler at ${exec.name} ${exec.callId}\n`)
      throw new Error(`injected scheduler failure at ${exec.callId}`)
    }
    return original.call(this, exec)
  }
  process.stderr.write(`[${name}] armed for marker ${JSON.stringify(marker)}\n`)
  ctx.effect(() => () => { tools.executionMode = original })
}

export default { name, inject, apply }
