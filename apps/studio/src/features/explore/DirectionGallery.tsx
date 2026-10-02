// Explore's direction gallery (LFE-03.1): every candidate a direction's jobs returned, in job order, each with its
// state in words; one opens up close, and an editor chooses one there. Nothing here starts a job.
import { useRef, useState } from 'react'
import type { Membership } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { CandidateImage } from './CandidateImage.tsx'
import { DirectionDetail } from './DirectionDetail.tsx'
import { nextTile, ROUTE, STATE, type Candidate, type Direction } from './direction.ts'
import { useNearScreen } from './useNearScreen.ts'
import { useSerialChoice, type Choose } from './useSerialChoice.ts'
import { useVerifiedImage, useVerifiedImages, type ReadBytes, type VerifiedImages } from './useVerifiedImage.ts'
import './explore.css'

interface Props {
  direction: Direction
  role: Membership['role'] | undefined
  read: ReadBytes
  onChoose: Choose
}

interface TileProps {
  candidate: Candidate
  n: number
  chosen: boolean
  focusable: boolean
  images: VerifiedImages
  onOpen: () => void
  onKey: (e: React.KeyboardEvent) => void
  tile: (el: HTMLButtonElement | null) => void
}

function CandidateTile({ candidate, n, chosen, focusable, images, onOpen, onKey, tile }: TileProps) {
  const state = STATE[candidate.state]
  const [watch, near] = useNearScreen()
  const shown = useVerifiedImage(candidate.asset, images, near)
  return (
    <li>
      <button
        ref={(el) => {
          tile(el)
          watch(el)
        }}
        type="button"
        className="candidate-tile"
        tabIndex={focusable ? 0 : -1}
        aria-label={`Candidate ${n}, ${ROUTE[candidate.route].label}, ${state.label}${chosen ? ', chosen' : ''}`}
        onClick={onOpen}
        onKeyDown={onKey}
      >
        <CandidateImage candidate={candidate} n={n} shown={shown} />
        <span className="candidate-foot">
          <span className="candidate-route">{ROUTE[candidate.route].label}</span>
          <Tag tone={state.tone}>{state.label}</Tag>
          {chosen && <Tag tone="teal">Chosen</Tag>}
        </span>
      </button>
    </li>
  )
}

function DirectionHead({ direction }: { direction: Direction }) {
  const references = direction.references.length
  return (
    <header className="direction-head">
      <span className="eyebrow">Direction</span>
      <h2 id="direction-title">{direction.title}</h2>
      <p className="direction-meta">
        Brief revision {direction.brief.revision} · {references} reference{references === 1 ? '' : 's'}
      </p>
    </header>
  )
}

/** Roving focus over the tiles: one in the tab order, arrows move it, and a tile can take it back (after Back). */
function useRovingTiles(count: number) {
  const [focus, setFocus] = useState(0)
  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => (e: React.KeyboardEvent) => {
    const next = nextTile(e.key, i, count)
    if (next === null) return
    e.preventDefault()
    setFocus(next)
    tiles.current[next]?.focus()
  }
  const refocus = (i: number) => requestAnimationFrame(() => tiles.current[i]?.focus({ preventScroll: true }))
  return { focus, setFocus, tiles, move, refocus }
}

export function DirectionGallery({ direction, role, read, onChoose }: Props) {
  const images = useVerifiedImages(read)
  const serial = useSerialChoice(direction.revision, onChoose)
  const [open, setOpen] = useState<string | null>(null)
  const { candidates } = direction
  const { focus, setFocus, tiles, move, refocus } = useRovingTiles(candidates.length)
  const opened = candidates.findIndex((c) => c.id === open)
  const detail = candidates[opened]
  const back = () => {
    setOpen(null)
    refocus(opened)
  }
  return (
    <div className="direction">
      <section className="direction-gallery" hidden={detail !== undefined} aria-labelledby="direction-title">
        <DirectionHead direction={direction} />
        <ul className="direction-tiles" aria-label="Candidates">
          {candidates.map((c, i) => (
            <CandidateTile
              key={c.id}
              candidate={c}
              n={i + 1}
              chosen={direction.chosenId === c.id}
              focusable={i === focus}
              images={images}
              onOpen={() => {
                setFocus(i)
                setOpen(c.id)
              }}
              onKey={move(i)}
              tile={(el) => {
                tiles.current[i] = el
              }}
            />
          ))}
        </ul>
      </section>
      {detail && (
        <DirectionDetail
          direction={direction}
          candidate={detail}
          n={opened + 1}
          role={role}
          images={images}
          serial={serial}
          onBack={back}
        />
      )}
    </div>
  )
}
