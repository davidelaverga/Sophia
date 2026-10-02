// One image direction in Explore (LFE-03): the brief a job ran on, its references and its candidates, and which one
// the team chose. Pure, so the words and rules are unit-tested. The shapes are the Studio's proposal for S1-06's read
// contract (B-IMAGES): the API has startImageJob only, and nothing yet reads jobs or candidates back.
import type { ImageRequest, Membership } from '@sophia/contracts'

export type ImageRoute = ImageRequest['modelRoute']

/** Where a candidate's job stands; only `ready` has bytes. `unknown`: sent, and whether it ran isn't known yet. */
export type CandidateState = 'queued' | 'running' | 'ready' | 'refused' | 'failed' | 'unknown'

/** The bytes a candidate kept, by their record: shown only once the bytes read back match `sha256`. */
export interface ImageAsset {
  id: string
  sha256: string
  mime: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
}

export interface Candidate {
  id: string
  jobId: string
  route: ImageRoute
  /** The model the provider says answered; null when it didn't say. */
  model: string | null
  state: CandidateState
  /** The provider's or the service's own words when it refused or failed. */
  reason: string | null
  asset: ImageAsset | null
}

export interface Reference {
  assetId: string
  label: string
  sha256: string
}

export interface Direction {
  id: string
  title: string
  /** The brief the jobs ran on: its source and revision. */
  brief: { sourceId: string; revision: number }
  references: Reference[]
  candidates: Candidate[]
  chosenId: string | null
  /** Moves with each choice: a choice names the revision it was made on. */
  revision: number
}

export const ROUTE: Record<ImageRoute, { provider: 'Google' | 'OpenAI'; label: string }> = {
  'image-google': { provider: 'Google', label: 'Google' },
  'image-google-pro': { provider: 'Google', label: 'Google Pro' },
  'image-openai': { provider: 'OpenAI', label: 'OpenAI' },
  'image-openai-flare': { provider: 'OpenAI', label: 'OpenAI Flare' },
}

type Tone = 'teal' | 'amber' | 'lav' | 'rose' | 'muted'

/** A state in words, with a tone that only reinforces it. */
export const STATE: Record<CandidateState, { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'muted' },
  running: { label: 'Generating', tone: 'lav' },
  ready: { label: 'Ready', tone: 'teal' },
  refused: { label: 'Refused', tone: 'rose' },
  failed: { label: 'Failed', tone: 'rose' },
  unknown: { label: 'Outcome unknown', tone: 'amber' },
}

/** What a candidate without a picture says in its place: never a stand-in image. */
export function stateLine(c: Candidate): string {
  if (c.state === 'ready') return ''
  if (c.reason) return c.reason
  if (c.state === 'unknown') return 'Sent, and not confirmed yet. It is checked before anything is sent again.'
  if (c.state === 'refused') return 'The provider refused this request.'
  if (c.state === 'failed') return 'This request failed.'
  return c.state === 'running' ? 'The provider is working on it.' : 'Waiting its turn.'
}

/** The facts behind a candidate, in reading order: what was asked, what answered, what was kept. */
export function provenance(c: Candidate, d: Direction): [string, string][] {
  const rows: [string, string][] = [
    ['Route', ROUTE[c.route].label],
    ['Model', c.model ?? 'Not reported'],
    ['Brief', `revision ${d.brief.revision}`],
    ['References', d.references.length ? d.references.map((r) => r.label).join(', ') : 'None'],
  ]
  if (c.asset) {
    rows.push(['Asset', c.asset.id], ['SHA-256', c.asset.sha256])
    rows.push(['Size', `${c.asset.width} × ${c.asset.height}`])
  }
  return rows
}

export type Choice = { can: true } | { can: false; why: string }

/**
 * Whether this person may choose this candidate: an editor or admin, a ready image whose bytes matched their record
 * (`verified`), not the one already chosen.
 */
export function choice(role: Membership['role'] | undefined, c: Candidate, d: Direction, verified: boolean): Choice {
  if (d.chosenId === c.id) return { can: false, why: 'This is the chosen one.' }
  if (role !== 'admin' && role !== 'editor') return { can: false, why: 'Editors and admins choose.' }
  if (c.state !== 'ready' || !c.asset) return { can: false, why: 'Only a ready image can be chosen.' }
  if (!verified) return { can: false, why: 'Only an image that matches its record can be chosen.' }
  return { can: true }
}

/** Roving focus over the tiles: arrows step, Home and End jump; null for any other key. */
export function nextTile(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(index + 1, count - 1)
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(index - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}
