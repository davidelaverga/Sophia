/**
 * TEST ONLY — SMC-M02 G3: the synthetic preset's one plugin. It registers no
 * tool, prompt section, skill or service; it only announces each activation,
 * so a test can see the registry mount a preset's composition when an
 * attempt is created or resumed. Never part of a profile.
 */

export const name = 'sophia-test-inert-preset'

export function apply(ctx, config) {
  const label = typeof config?.label === 'string' ? config.label : 'inert'
  process.stderr.write(`[${name}] mounted ${label}\n`)
  ctx.effect(() => () => process.stderr.write(`[${name}] released ${label}\n`))
}

export default { name, apply }
