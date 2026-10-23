import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildVersion } from '../../build-version.ts'
import { VERSION_FILE } from './version-probe.ts'

// The build's own version (docs/plans/version-probe.md): any file the build wrote that changes gives a new id, even
// one whose name carries no hash of its contents (MediaPipe's model and wasm, emitted by name); two builds of one tree
// share it, whatever order the files come in and whichever separator their paths use.

const MODEL = 'assets/mediapipe-0.10.14/selfie_segmenter.tflite'
const PAGE = '<!doctype html><html><head><title>Sophia</title></head><body></body></html>'

/** A build's output as the bundler hands it over: scripts as chunks, the rest as assets. */
type Written = Readonly<Record<string, string | Uint8Array>>

/** The id the plugin writes into version.json for these files, and the page it names it in. */
function idOfBuild(files: Written): { id: string; page: string } {
  const bundle = Object.fromEntries(
    Object.entries(files).map(([fileName, source]) => [
      fileName,
      fileName.endsWith('.js') ? { type: 'chunk', fileName, code: source } : { type: 'asset', fileName, source },
    ]),
  )
  const hook = buildVersion().generateBundle
  const handler = typeof hook === 'function' ? hook : hook?.handler
  assert.ok(handler)
  let written = ''
  const plugin = {
    emitFile: (file: { fileName: string; source: string }) => {
      assert.equal(file.fileName, VERSION_FILE)
      written = file.source
      return file.fileName
    },
  }
  Reflect.apply(handler, plugin, [{}, bundle, false])
  const read: unknown = JSON.parse(written)
  const id: unknown = typeof read === 'object' && read !== null ? Reflect.get(read, 'version') : null
  assert.equal(typeof id, 'string')
  const page = bundle['index.html']
  return { id: String(id), page: page?.type === 'asset' ? String(page.source) : '' }
}

const build = (model: Uint8Array, order: 'as-built' | 'reversed' = 'as-built'): Written => {
  const files: [string, string | Uint8Array][] = [
    ['index.html', PAGE],
    ['assets/index-Bx1a2b3c.js', 'console.log("entry")'],
    ['assets/index-Dk4e5f6g.css', 'body{margin:0}'],
    [MODEL, model],
    ['assets/mediapipe-0.10.14/vision_wasm_internal.wasm', new Uint8Array([0, 97, 115, 109])],
  ]
  return Object.fromEntries(order === 'reversed' ? files.toReversed() : files)
}

describe('the build version', () => {
  it('changes when only a file whose name carries no hash changes its bytes', () => {
    const before = idOfBuild(build(new Uint8Array([1, 2, 3, 4])))
    const after = idOfBuild(build(new Uint8Array([1, 2, 3, 5])))
    assert.notEqual(after.id, before.id)
  })

  it('is the same for two builds of the same files', () => {
    assert.equal(idOfBuild(build(new Uint8Array([1, 2, 3]))).id, idOfBuild(build(new Uint8Array([1, 2, 3]))).id)
  })

  it('is the same whatever order the files come in', () => {
    const model = new Uint8Array([9, 8, 7])
    assert.equal(idOfBuild(build(model, 'reversed')).id, idOfBuild(build(model)).id)
  })

  it('is the same whichever separator a path uses', () => {
    const model = new Uint8Array([9, 8, 7])
    const windows = Object.fromEntries(
      Object.entries(build(model)).map(([name, source]) => [name.replaceAll('/', '\\'), source]),
    )
    assert.equal(idOfBuild(windows).id, idOfBuild(build(model)).id)
  })

  it('tells a file moved from one name to another, its bytes unchanged', () => {
    const model = new Uint8Array([9, 8, 7])
    const moved = Object.fromEntries(
      Object.entries(build(model)).map(([name, source]) => [name === MODEL ? `${MODEL}.old` : name, source]),
    )
    assert.notEqual(idOfBuild(moved).id, idOfBuild(build(model)).id)
  })

  it('names its id in the page it hashed', () => {
    const { id, page } = idOfBuild(build(new Uint8Array([1])))
    assert.match(id, /^[0-9a-f]{16}$/)
    assert.ok(page.includes(`<meta name="sophia-version" content="${id}" />`))
  })
})
