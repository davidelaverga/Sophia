import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../api/base.ts'
import { READ_TIMEOUT_MS } from '../../api/timeouts.ts'
import { boundedFetch } from '../../app/bounded-fetch.ts'
import { bindPreviewFrame, type CheckDisplayedPreview } from './preview-frame-proof.ts'
import { parsePreviewUrl, previewAddress, type PreviewPermit } from './preview-address.ts'

interface Props {
  version: Pick<PreviewPermit, 'entrySha256' | 'manifestSha256'> & { id: string; number: number }
  mint: (signal: AbortSignal) => Promise<PreviewPermit & { versionId: string }>
  contentOrigin: string
  onFrame: (check: CheckDisplayedPreview | null) => void
}

const MAX_VIEW_MS = 10 * 60_000
const headFetch = boundedFetch(READ_TIMEOUT_MS)

interface OpenPreview {
  status: 'ready'
  url: URL
  showUntil: number
  signal: AbortSignal
}

type Preview = { status: 'loading' | 'expired' | 'unavailable' } | OpenPreview

function usePreview({ version, mint, contentOrigin, onFrame }: Props, attempt: number) {
  const [state, setState] = useState<{ mint: Props['mint']; preview: Preview }>()
  useEffect(() => {
    const controller = new AbortController()
    const show = (preview: Preview) => setState({ mint, preview })
    let expiry: ReturnType<typeof setTimeout> | undefined
    show({ status: 'loading' })
    onFrame(null)
    void mint(controller.signal).then(
      async (permit) => {
        const apiOrigin = parsePreviewUrl(API_BASE || '/', location.origin)?.origin ?? ''
        const url =
          permit.versionId === version.id
            ? previewAddress(permit, version, { contentOrigin, studioOrigin: location.origin, apiOrigin })
            : null
        if (!url) {
          if (!controller.signal.aborted) show({ status: 'unavailable' })
          return
        }
        const confirmed = await confirmEntry(url, version.entrySha256, controller.signal)
        if (controller.signal.aborted) return
        if (!confirmed) {
          show({ status: 'unavailable' })
          return
        }
        // The content host checks expiry. Bound local display without comparing the browser's wall clock to the server's.
        show({ status: 'ready', url, showUntil: performance.now() + MAX_VIEW_MS, signal: controller.signal })
        expiry = setTimeout(() => {
          controller.abort()
          onFrame(null)
          show({ status: 'expired' })
        }, MAX_VIEW_MS)
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
  const preview: Preview = state?.mint === mint ? state.preview : { status: 'loading' }
  return { preview, reject: () => setState({ mint, preview: { status: 'unavailable' } }) }
}

async function confirmEntry(url: URL, expected: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await headFetch(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal,
    })
    return response.status === 200 && response.headers.get('X-Sophia-Preview-Entry-SHA256') === expected
  } catch {
    return false
  }
}

function ConfirmedFrame({
  preview,
  version,
  onFrame,
  onUnavailable,
}: Pick<Props, 'version' | 'onFrame'> & { preview: OpenPreview; onUnavailable: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const shellLoaded = useRef<(() => void) | null>(null)
  const [listening, setListening] = useState(false)
  const unavailable = useRef(onUnavailable)
  useEffect(() => {
    unavailable.current = onUnavailable
  }, [onUnavailable])

  useEffect(() => {
    const binding = bindPreviewFrame(
      preview,
      () => frame.current?.contentWindow,
      onFrame,
      () => unavailable.current(),
    )
    shellLoaded.current = binding.load
    setListening(true)
    return () => {
      shellLoaded.current = null
      binding.disconnect()
    }
  }, [preview, onFrame])

  if (!listening)
    return (
      <div className="managed-prototype-message" aria-live="polite">
        Opening prototype…
      </div>
    )
  const shell = new URL('shell.html', preview.url)
  return (
    <iframe
      className="managed-prototype-frame"
      ref={frame}
      src={shell.href}
      title={`Interactive prototype, version ${String(version.number)}`}
      // oxlint-disable-next-line react/iframe-missing-sandbox -- Trusted shell on a distinct origin. Its generated child is opaque.
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      onLoad={() => shellLoaded.current?.()}
      allow="camera 'none'; microphone 'none'; display-capture 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
    />
  )
}

/** Preview grants stay in memory and the frame exists only for one exact version and grant. */
export function PrototypePreview(props: Props) {
  const [attempt, retry] = useState(0)
  const { preview, reject } = usePreview(props, attempt)
  if (preview.status === 'ready')
    return (
      <ConfirmedFrame
        key={attempt}
        preview={preview}
        version={props.version}
        onFrame={props.onFrame}
        onUnavailable={reject}
      />
    )
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
