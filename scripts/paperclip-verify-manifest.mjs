// WBC-02: copied into the image build context as verify-manifest.mjs by scripts/paperclip-build.mjs, and run inside the
// image build (deploy/paperclip/Dockerfile) and by scripts/paperclip-service-probe.mjs. The packages must be the ones
// scripts/paperclip-build.mjs built against the pin from a clean Sophia commit: every recorded file present with its
// sha256. The Dockerfile itself is recorded for reference and not copied into the image.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, pin] = process.argv.slice(2)
if (!dir || !pin) throw new Error('usage: verify-manifest.mjs <dir> <paperclip pin>')
const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'))
if (manifest.paperclipPin !== pin) throw new Error(`built against paperclip ${manifest.paperclipPin}, expected ${pin}`)
if (manifest.sophiaTreeDirty !== false) throw new Error(`built from Sophia ${manifest.sophiaCommit} with uncommitted changes`)
let checked = 0
for (const [file, sha] of Object.entries(manifest.files)) {
  if (file === 'Dockerfile') continue
  const actual = createHash('sha256').update(readFileSync(join(dir, file))).digest('hex')
  if (actual !== sha) throw new Error(`${file}: sha256 ${actual}, recorded ${sha}`)
  checked += 1
}
console.log(`sophia packages verified: ${checked} files, Sophia ${manifest.sophiaCommit}, paperclip ${pin}`)
