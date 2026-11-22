import { useEffect, useState } from 'react'
import { API_BASE } from '../../api/base.ts'
import { previewAddress, type PreviewPermit } from './preview-address.ts'

interface Props {
  version: Pick<PreviewPermit, 'entrySha256' | 'manifestSha256'> & { id: string; number: number }
  mint: (signal: AbortSignal) => Promise<PreviewPermit & { versionId: string }>
  contentOrigin: string
  onFrame: (ready: boolean) => void
}

type Preview = { status: 'loading' | 'expired' | 'unavailable' } | { status: 'ready'; url: URL }

function usePreview({ version, mint, contentOrigin, onFrame }: Props, attempt: number): Preview {
  const [preview, show] = useState<Preview>({ status: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    let expiry: ReturnType<typeof setTimeout> | undefined
    show({ status: 'loading' })
    onFrame(false)
    void mint(controller.signal).then(
      (permit) => {
        if (controller.signal.aborted) return
        const now = Date.now()
        const apiOrigin = URL.parse(API_BASE || '/', location.origin)?.origin ?? ''
        const url =
          permit.versionId === version.id
            ? previewAddress(permit, version, { contentOrigin, studioOrigin: location.origin, apiOrigin, now })
            : null
        if (!url) {
          show({ status: 'unavailable' })
          return
        }
        show({ status: 'ready', url })
        expiry = setTimeout(
          () => {
            onFrame(false)
            show({ status: 'expired' })
          },
          Date.parse(permit.expiresAt) - now,
        )
      },
      () => {
        if (!controller.signal.aborted) show({ status: 'unavailable' })
      },
    )
    return () => {
      controller.abort()
      clearTimeout(expiry)
    }
  }, [attempt, contentOrigin, mint, onFrame, version])
  return preview
}

/** Preview grants stay in memory and the frame exists only for one exact version and grant. */
export function PrototypePreview(props: Props) {
  const [attempt, retry] = useState(0)
  const preview = usePreview(props, attempt)
  const { version, onFrame } = props
  if (preview.status === 'ready') {
    return (
      <iframe
        className="managed-prototype-frame"
        src={preview.url.href}
        title={`Interactive prototype, version ${String(version.number)}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        onLoad={() => onFrame(true)}
        allow="camera 'none'; microphone 'none'; display-capture 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
      />
    )
  }
  return (
    <div className="managed-prototype-message" aria-live="polite">
      {preview.status === 'loading' ? 'Opening prototype…' : null}
      {preview.status === 'expired' ? 'The preview expired.' : null}
      {preview.status === 'unavailable' ? 'This version’s preview couldn’t be opened.' : null}
      {preview.status !== 'loading' && (
        <button className="pill" type="button" onClick={() => retry((n) => n + 1)}>
          Reopen this version
        </button>
      )}
    </div>
  )
}
