// Labelled fixture data for Explore's direction checks (e2e/explore.spec.ts): one direction whose four jobs went four
// ways, two of them with simulated images (fixtures/images: plain gradients drawn for this fixture, not by any
// provider). Nothing here is live, and the fixture page says so on screen.
import type { Direction } from '../src/features/explore/direction.ts'

const id = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`

const candidates: Direction['candidates'] = [
  {
    id: id(10),
    jobId: id(20),
    route: 'image-google',
    model: 'gemini-3.1-flash-image',
    state: 'ready',
    reason: null,
    asset: {
      id: id(30),
      sha256: 'e8b52a695e063f17310dcd97cb8d3c5d12a10beadefd02a8ffd0e2b9a45cb0bc',
      mime: 'image/png',
      width: 256,
      height: 256,
    },
  },
  {
    id: id(11),
    jobId: id(21),
    route: 'image-openai',
    model: null,
    state: 'ready',
    reason: null,
    asset: {
      id: id(31),
      sha256: 'e6740bffe898e68ad277660121d1efa4925ebd66cba5ad84419be88dcd114811',
      mime: 'image/png',
      width: 256,
      height: 256,
    },
  },
  {
    id: id(12),
    jobId: id(22),
    route: 'image-google-pro',
    model: null,
    state: 'refused',
    reason: 'The provider declined this brief.',
    asset: null,
  },
  {
    id: id(13),
    jobId: id(23),
    route: 'image-openai-flare',
    model: null,
    state: 'unknown',
    reason: null,
    asset: null,
  },
]

/**
 * `many`: a direction whose retained alternatives run past the screen, 24 ready candidates over the two simulated
 * images, each its own candidate and asset.
 */
function manyCandidates(): Direction['candidates'] {
  const ready = candidates.filter((c) => c.asset !== null)
  // ids 40–63 for the assets and 64–87 for the candidates; their jobs are the two that returned images.
  return Array.from({ length: 24 }, (_, i) => {
    const from = ready[i % ready.length]
    if (!from?.asset) throw new Error('the fixture needs its ready images')
    return { ...from, id: id(64 + i), asset: { ...from.asset, id: id(40 + i) } }
  })
}

export const direction = (chosenId: string | null, many = false): Direction => ({
  id: id(1),
  title: 'Hero image for the landing page',
  brief: { sourceId: id(2), revision: 3 },
  references: [
    {
      assetId: id(3),
      label: 'Layout grid',
      sha256: 'e0fa5d747e986b5232dd312fe2e63327f2f601f1f7450a2bab943a4503e4d995',
    },
  ],
  candidates: many ? manyCandidates() : candidates,
  chosenId,
  revision: 1,
})

/** Where the simulated bytes behind each SHA-256 are served (fixtures/images). */
export const FILE: Record<string, string> = {
  e8b52a695e063f17310dcd97cb8d3c5d12a10beadefd02a8ffd0e2b9a45cb0bc: './images/candidate-a.png',
  e6740bffe898e68ad277660121d1efa4925ebd66cba5ad84419be88dcd114811: './images/candidate-b.png',
}
