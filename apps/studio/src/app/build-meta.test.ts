import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'
import studioConfig from '../../vite.config.ts'
import { buildIdentity, buildMeta } from './build-meta.ts'

const COMMIT = '0f4e47d249f8c52f9761efbc6aeae71b073a385e'

/** What the plugin adds to the page, for a build whose environment holds `env`: its two hooks, as Vite calls them. */
function tagsFor(env: Record<string, string>) {
  const plugin = buildIdentity()
  const resolved = plugin.configResolved as unknown as (config: ResolvedConfig) => void
  resolved({ env } as unknown as ResolvedConfig)
  const transform = plugin.transformIndexHtml as unknown as () => unknown
  return transform()
}

const names = (option: PluginOption): string[] =>
  Array.isArray(option) ? option.flatMap(names) : option && 'name' in option ? [(option as Plugin).name] : []

describe('the Studio’s build identity (sophia-build)', () => {
  it('a commit of 40 hex is one meta tag in the head, naming it', () => {
    assert.deepEqual(buildMeta(COMMIT), [
      { tag: 'meta', attrs: { name: 'sophia-build', content: COMMIT }, injectTo: 'head' },
    ])
    assert.deepEqual(tagsFor({ VITE_SOPHIA_COMMIT: COMMIT, MODE: 'production' }), buildMeta(COMMIT))
  })

  it('no commit, or anything that is not one, is no tag at all', () => {
    for (const value of [
      undefined,
      null,
      '',
      COMMIT.slice(0, 39),
      `${COMMIT}0`,
      COMMIT.toUpperCase(),
      ` ${COMMIT}`,
      `${COMMIT}\n`,
      'main',
      `${COMMIT.slice(0, 39)}g`,
      `"><script>`,
    ]) {
      assert.deepEqual(buildMeta(value), [], String(value))
    }
    assert.deepEqual(tagsFor({ MODE: 'production' }), [])
    assert.deepEqual(tagsFor({ VITE_SOPHIA_COMMIT: 'abc123', MODE: 'production' }), [])
  })

  it('the Studio’s own build carries it', () => {
    const plugins = studioConfig.plugins ?? []
    assert.ok(plugins.flatMap(names).includes('sophia-build-identity'))
  })
})
