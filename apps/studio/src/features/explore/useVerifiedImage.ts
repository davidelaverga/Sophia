// An image is drawn only from bytes whose SHA-256 matches its record: what is on screen is the asset the record
// names, never a stand-in. The bytes come through a port, so the read is bound once S1-06 says where they live.
import { useEffect, useState } from 'react'
import type { ImageAsset } from './direction.ts'

export type ReadBytes = (asset: ImageAsset) => Promise<ArrayBuffer>

export type Shown =
  { kind: 'checking' } | { kind: 'shown'; url: string } | { kind: 'mismatch' } | { kind: 'unreadable' }

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Reads, checks and shows one asset's bytes; a later asset (or unmounting) drops what an earlier read brings back. */
async function verify(asset: ImageAsset, read: ReadBytes, run: { live: boolean; url: string | null }): Promise<Shown> {
  const bytes = await read(asset)
  if ((await sha256Hex(bytes)) !== asset.sha256) return { kind: 'mismatch' }
  if (!run.live) return { kind: 'checking' }
  run.url = URL.createObjectURL(new Blob([bytes], { type: asset.mime }))
  return { kind: 'shown', url: run.url }
}

export function useVerifiedImage(asset: ImageAsset | null, read: ReadBytes): Shown | null {
  const [shown, setShown] = useState<Shown | null>(null)
  useEffect(() => {
    if (!asset) return undefined
    const run = { live: true, url: null as string | null }
    setShown({ kind: 'checking' })
    verify(asset, read, run).then(
      (next) => run.live && setShown(next),
      () => run.live && setShown({ kind: 'unreadable' }),
    )
    return () => {
      run.live = false
      if (run.url) URL.revokeObjectURL(run.url)
    }
  }, [asset, read])
  return asset ? shown : null
}
