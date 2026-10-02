// An image is drawn only from bytes whose SHA-256 matches its record: what is on screen is the asset the record
// names, never a stand-in. The bytes come through a port, so the read is bound once S1-06 says where they live. Each
// asset is read and checked once while the gallery is open, and only once it is wanted: a tile near the screen, or
// the candidate opened up close.
import { useEffect, useState } from 'react'
import type { ImageAsset } from './direction.ts'

export type ReadBytes = (asset: ImageAsset) => Promise<ArrayBuffer>

export type Shown =
  { kind: 'checking' } | { kind: 'shown'; url: string } | { kind: 'mismatch' } | { kind: 'unreadable' }

type Checked = Exclude<Shown, { kind: 'checking' }>

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const keyOf = (asset: ImageAsset) => `${asset.id}:${asset.sha256}`

/**
 * One check per asset, shared by its tile and its detail; `dispose` drops them all and frees their pictures. A read
 * that failed isn't kept: the next check of that asset (opening it, or its Try again) reads again, and every view of
 * that asset hears how it went. Nothing reads any other asset meanwhile. A mismatch is kept: those bytes won't change.
 */
export class VerifiedImages {
  private readonly checks = new Map<string, Promise<Checked>>()
  private readonly views = new Map<string, Set<(checked: Checked) => void>>()
  private readonly urls = new Set<string>()
  /** Moves on each dispose: a check that settles after it keeps no picture. */
  private generation = 0
  /** A release waits a tick: a remount right away (React's strict mode) keeps what was read. */
  private releasing: ReturnType<typeof setTimeout> | undefined
  private readonly read: ReadBytes

  constructor(read: ReadBytes) {
    this.read = read
  }

  check(asset: ImageAsset): Promise<Checked> {
    const key = keyOf(asset)
    const known = this.checks.get(key)
    if (known) return known
    const started = this.verify(asset, this.generation)
    this.checks.set(key, started)
    void started.then((done) => {
      if (this.checks.get(key) !== started) return
      if (done.kind === 'unreadable') this.checks.delete(key)
      for (const view of this.views.get(key) ?? []) view(done)
    })
    return started
  }

  /** Hears every check of this asset that settles from now on, whichever view asked; returns the way to stop. */
  watch(asset: ImageAsset, view: (checked: Checked) => void): () => void {
    const key = keyOf(asset)
    const views = this.views.get(key) ?? new Set()
    views.add(view)
    this.views.set(key, views)
    return () => views.delete(view)
  }

  hold(): void {
    clearTimeout(this.releasing)
  }

  release(): void {
    this.releasing = setTimeout(() => this.dispose(), 0)
  }

  dispose(): void {
    this.generation += 1
    this.checks.clear()
    for (const url of this.urls) URL.revokeObjectURL(url)
    this.urls.clear()
  }

  private async verify(asset: ImageAsset, generation: number): Promise<Checked> {
    try {
      const bytes = await this.read(asset)
      if ((await sha256Hex(bytes)) !== asset.sha256) return { kind: 'mismatch' }
      if (generation !== this.generation) return { kind: 'unreadable' }
      const url = URL.createObjectURL(new Blob([bytes], { type: asset.mime }))
      this.urls.add(url)
      return { kind: 'shown', url }
    } catch {
      return { kind: 'unreadable' }
    }
  }
}

/** The shared checks for one open gallery, freed when it closes. */
export function useVerifiedImages(read: ReadBytes): VerifiedImages {
  const [images] = useState(() => new VerifiedImages(read))
  useEffect(() => {
    images.hold()
    return () => images.release()
  }, [images])
  return images
}

/**
 * `wanted`: read the bytes now; until then the image waits, unread. Once wanted, this view also hears any later check
 * of the same asset: a tile shows what its detail read, and both show a Try again's outcome.
 */
export function useVerifiedImage(asset: ImageAsset | null, images: VerifiedImages, wanted: boolean): Shown | null {
  const [shown, setShown] = useState<Shown>({ kind: 'checking' })
  useEffect(() => {
    if (!asset || !wanted) return undefined
    const run = { live: true }
    const stop = images.watch(asset, (next) => run.live && setShown(next))
    setShown({ kind: 'checking' })
    void images.check(asset).then((next) => run.live && setShown(next))
    return () => {
      run.live = false
      stop()
    }
  }, [asset, images, wanted])
  return asset ? shown : null
}
