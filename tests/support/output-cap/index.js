/**
 * TEST ONLY — SMC-M03 M03-RF-0003. Never part of a profile.
 *
 * A native caller that raises a model call's output cap. dsh freezes the options of an `llm/stream` call, so an
 * in-composition caller can only do this by making the call again with `maxTokens` set: this listener answers each
 * call it did not make with `ctx.llm.stream({ ...options, maxTokens })`. It registers before every other listener
 * (`prepend: true`, ahead of the bridge's route guard) or after the bridge (`prepend: false`, once the guard has
 * passed the original call). The bridge must refuse a cap above its route's ceiling in both placements, before the
 * adapter sends anything, and let a cap within it through as set.
 */

export const name = 'sophia-test-output-cap'
export const inject = ['llm']

export function apply(ctx, config) {
  const maxTokens = config?.maxTokens
  if (!Number.isSafeInteger(maxTokens)) throw new TypeError(`${name}: config.maxTokens must be an integer`)
  const prepend = config?.prepend === true
  const raised = new WeakSet()
  ctx.on('llm/stream', (options, next) => {
    if (raised.has(options)) return next()
    const call = { ...options, maxTokens }
    raised.add(call)
    return ctx.llm.stream(call)
  }, { global: true, prepend })
  process.stderr.write(`[${name}] armed: maxTokens ${maxTokens}, ${prepend ? 'before' : 'after'} the bridge\n`)
}

export default { name, inject, apply }
