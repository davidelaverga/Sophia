// Explore's fixture page for the direction checks (e2e/explore.spec.ts): the real DirectionGallery over labelled
// simulated data. Its two ports are the fixture's own: the bytes are read from fixtures/images, and a choice is
// recorded and applied here. No image service, provider or API is reached, and the page says so on screen. The query
// string picks the scenario: `role=viewer` (who may not choose), `tamper=<asset id>` (bytes that don't match),
// `many=1` (24 candidates, past the screen), `slow=1` (a choice is saved only once a check settles it),
// `flaky=<asset id>,…` (their reads fail, as a network would, until a check heals it).
// `window.explore` lets a check read what was asked.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Membership } from '@sophia/contracts'
import { DirectionGallery } from '../src/features/explore/DirectionGallery.tsx'
import type { ImageAsset } from '../src/features/explore/direction.ts'
import '../src/app/theme.css'
import { direction, FILE } from './explore-data.ts'
import { bootTheme } from '../src/app/theme.ts'

interface ExploreFixture {
  /** What the page was asked, in order: `read:<asset>`, `choose:<candidate>@<revision>`. */
  asked: readonly string[]
  /** `slow=1`: lets the choice being saved finish. */
  settle: () => void
  /** `flaky=…`: the network comes back. */
  heal: () => void
}

declare global {
  interface Window {
    explore?: ExploreFixture
  }
}

const query = new URLSearchParams(window.location.search)
bootTheme(query.get('theme'))
const role: Membership['role'] = query.get('role') === 'viewer' ? 'viewer' : 'editor'
const tampered = query.get('tamper')
const flaky = new Set((query.get('flaky') ?? '').split(',').filter(Boolean))
const asked: string[] = []
let settling: (() => void) | null = null
window.explore = {
  asked,
  settle: () => {
    settling?.()
    settling = null
  },
  heal: () => flaky.clear(),
}

async function read(asset: ImageAsset): Promise<ArrayBuffer> {
  asked.push(`read:${asset.id}`)
  if (flaky.has(asset.id)) throw new Error('the network dropped the read')
  const file = FILE[asset.sha256]
  if (!file) throw new Error(`no simulated bytes for ${asset.id}`)
  const bytes = await (await fetch(file)).arrayBuffer()
  if (tampered === asset.id) {
    const view = new Uint8Array(bytes)
    view[100] = (view[100] ?? 0) ^ 0xff
  }
  return bytes
}

function Explore() {
  const [current, setCurrent] = useState(() => direction(null, query.get('many') === '1'))
  const choose = async (candidateId: string, expectedRevision: number) => {
    asked.push(`choose:${candidateId}@${expectedRevision}`)
    if (query.get('slow') === '1') await new Promise<void>((done) => (settling = done))
    else await Promise.resolve()
    setCurrent((d) => ({ ...d, chosenId: candidateId, revision: d.revision + 1 }))
  }
  return <DirectionGallery direction={current} role={role} read={read} onChoose={choose} />
}

const root = document.getElementById('root')
if (!root) throw new Error('explore.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — no image service
    </p>
    <main className="fixture-explore">
      <Explore />
    </main>
  </StrictMode>,
)
