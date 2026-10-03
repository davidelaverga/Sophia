// A report's PDF on screen (plan §2.8.1, §2.8.3). pdf.js 6.3.289, pinned as dsh's document preview pins it, in its
// legacy build: the modern one calls JavaScript a current Chromium and Safari lack (Map's getOrInsertComputed), so its
// pages would never draw. With its
// hardened options (no XFA, no worker fetch, stop at errors) and one more (no WebAssembly, so the CSP needs no
// 'wasm-unsafe-eval'; pdf.js 6 evaluates no code), a same-origin worker, and only bytes the pane already checked
// against the rendition's hash. Fit-width
// by default, zoom 25–400 %. Every page is laid out at its size but drawn only near the view (the pages on screen
// and one either side), at most at twice the device pixels, and released once it scrolls away; a text layer keeps
// its text selectable and findable. A pager, and in the full page a rail of page numbers. The document is destroyed
// when the view goes.
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
// oxlint-disable-next-line import/default -- Vite's `?url` import (typed by vite/client): the worker's same-origin asset URL
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { fitScale, MAX_ZOOM, MIN_ZOOM, zoomStep } from './pdf-zoom.ts'

GlobalWorkerOptions.workerSrc = workerUrl

const MAX_DPR = 2

interface Size {
  width: number
  height: number
}

interface Props {
  /** The PDF, already checked against its rendition's sha256. */
  bytes: Uint8Array<ArrayBuffer>
  /** The full page adds the rail of page numbers. */
  full: boolean
}

type Opened = { doc: PDFDocumentProxy; sizes: Size[] } | { error: string } | null

/** The document and each page's size at 100 %, or why it could not be opened. */
function useDocument(bytes: Uint8Array<ArrayBuffer>): Opened {
  const [opened, setOpened] = useState<Opened>(null)
  useEffect(() => {
    let live = true
    // pdf.js moves the buffer it is given to its worker: a copy keeps the pane's checked bytes for the download.
    const task = getDocument({
      data: bytes.slice(),
      enableXfa: false,
      useWorkerFetch: false,
      stopAtErrors: true,
      useWasm: false,
    })
    const open = async () => {
      const doc = await task.promise
      const sizes: Size[] = []
      for (let n = 1; n <= doc.numPages; n += 1) {
        const v = (await doc.getPage(n)).getViewport({ scale: 1 })
        sizes.push({ width: v.width, height: v.height })
      }
      if (live) setOpened({ doc, sizes })
    }
    open().catch(() => {
      if (live) setOpened({ error: 'This PDF couldn’t be shown here. Download it to read it.' })
    })
    return () => {
      live = false
      void task.destroy()
    }
  }, [bytes])
  return opened
}

/** The element's content width, kept current. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** The pages on screen, by number; `observe` registers a page element (data-page) as it mounts. */
function useVisiblePages() {
  const [visible, setVisible] = useState<ReadonlySet<number>>(() => new Set([1]))
  const observer = useRef<IntersectionObserver | null>(null)
  const seen = useRef(new Set<number>())
  const observe = useCallback((el: HTMLElement | null) => {
    if (!el) return
    observer.current ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number(e.target.getAttribute('data-page'))
        if (e.isIntersecting) seen.current.add(n)
        else seen.current.delete(n)
      }
      setVisible(new Set(seen.current))
    })
    observer.current.observe(el)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return { visible, observe }
}

interface PageProps {
  doc: PDFDocumentProxy
  n: number
  size: Size
  scale: number
  /** On screen or next to it: drawn. Elsewhere: an empty frame of the page's size. */
  near: boolean
  observe: (el: HTMLElement | null) => void
}

/**
 * Draw one page and its text layer at `scale`, each time on a canvas and a layer of its own, removed when the page
 * leaves the view or the scale changes: a render still being cancelled never shares a canvas with the next one.
 */
function usePageDrawing(props: PageProps, onDrawn: (drawn: boolean) => void) {
  const { doc, n, scale, near } = props
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!near || !el) return undefined
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    const text = document.createElement('div')
    text.className = 'textLayer'
    el.append(canvas, text)
    // Read through a function: the flag changes while the drawing awaits, which a narrowed variable would hide.
    const run = { cancelled: false }
    const stopped = () => run.cancelled
    let task: RenderTask | null = null
    let layer: TextLayer | null = null
    const draw = async () => {
      const page = await doc.getPage(n)
      if (stopped()) return
      const viewport = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      task = page.render({ canvas, viewport, ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] }) })
      await task.promise
      if (stopped()) return
      layer = new TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport })
      await layer.render()
      if (!stopped()) onDrawn(true)
    }
    // A render cancelled by a scroll or a zoom rejects; that is not an error to show.
    draw().catch((error: unknown) => {
      if (!stopped() && !CANCELLED.has(error instanceof Error ? error.name : '')) onDrawn(false)
    })
    return () => {
      run.cancelled = true
      task?.cancel()
      layer?.cancel()
      canvas.width = 0
      canvas.height = 0
      canvas.remove()
      text.remove()
    }
    // onDrawn only sets the page's state: a setter, stable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, n, scale, near])
  return host
}

/** How a render that was stopped on purpose (a scroll, a zoom, the view closing) ends: not a failure. */
const CANCELLED: ReadonlySet<string> = new Set(['RenderingCancelledException', 'AbortException'])

function PdfPage(props: PageProps) {
  const { n, size, scale, observe } = props
  const [failed, setFailed] = useState(false)
  // Whether the latest drawing failed: a page drawn again at another zoom, or once back in view, loses the mark.
  const host = usePageDrawing(props, (drawn) => setFailed(!drawn))
  const style = {
    width: `${size.width * scale}px`,
    height: `${size.height * scale}px`,
    '--scale-factor': scale,
    '--total-scale-factor': scale,
  } as React.CSSProperties
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      host.current = el
      observe(el)
    },
    [host, observe],
  )
  return (
    <div className="pdf-page" data-page={n} ref={ref} style={style}>
      {failed && <p className="pdf-page-failed">This page couldn’t be drawn. Download the PDF to read it.</p>}
    </div>
  )
}

/** The page the reader is on: the first one on screen. */
const currentOf = (visible: ReadonlySet<number>) => (visible.size === 0 ? 1 : Math.min(...visible))

export function PdfView({ bytes, full }: Props) {
  const opened = useDocument(bytes)
  if (opened === null) return <p className="muted">Opening the PDF…</p>
  if ('error' in opened) {
    return (
      <p className="muted" role="alert">
        {opened.error}
      </p>
    )
  }
  return <OpenedPdf doc={opened.doc} sizes={opened.sizes} full={full} />
}

/** An opened document: its pages, the pager and zoom, and in the full page the rail. */
function OpenedPdf({ doc, sizes, full }: { doc: PDFDocumentProxy; sizes: Size[]; full: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const width = useWidth(scroller)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const { visible, observe } = useVisiblePages()
  const opened = { doc, sizes }
  const widest = Math.max(...opened.sizes.map((s) => s.width))
  const fit = fitScale(width, widest)
  const scale = zoom === 'fit' ? fit : zoom
  const current = currentOf(visible)
  const go = (n: number) =>
    scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return (
    <div className="pdf-view" data-full={full || undefined}>
      {full && <PageRail count={opened.sizes.length} current={current} onGo={go} />}
      <div className="pdf-main">
        <PdfToolbar
          current={current}
          count={opened.sizes.length}
          scale={scale}
          fit={zoom === 'fit'}
          onGo={go}
          onZoom={setZoom}
        />
        <div className="pdf-pages" ref={scroller} tabIndex={0} aria-label="PDF pages">
          {width > 0 &&
            opened.sizes.map((size, i) => (
              <PdfPage
                key={i + 1}
                doc={opened.doc}
                n={i + 1}
                size={size}
                scale={scale}
                near={[i, i + 1, i + 2].some((p) => visible.has(p))}
                observe={observe}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

interface ToolbarProps {
  current: number
  count: number
  scale: number
  fit: boolean
  onGo: (n: number) => void
  onZoom: (zoom: 'fit' | number) => void
}

/** A press that does nothing at a limit: the button stays focusable (aria-disabled, never disabled under the focus). */
const unless = (atLimit: boolean, run: () => void) => () => {
  if (!atLimit) run()
}

function PdfToolbar({ current, count, scale, fit, onGo, onZoom }: ToolbarProps) {
  const first = current <= 1
  const last = current >= count
  const smallest = scale <= MIN_ZOOM
  const largest = scale >= MAX_ZOOM
  return (
    <div className="pdf-toolbar" role="toolbar" aria-label="PDF">
      <button
        type="button"
        className="round has-tip pdf-prev"
        aria-label="Previous page"
        aria-disabled={first || undefined}
        onClick={unless(first, () => onGo(current - 1))}
      >
        <Icon name="chevron" />
        <Tip label="Previous page" side="bottom" />
      </button>
      <span className="pdf-pager" aria-live="polite">
        Page {current} of {count}
      </span>
      <button
        type="button"
        className="round has-tip"
        aria-label="Next page"
        aria-disabled={last || undefined}
        onClick={unless(last, () => onGo(current + 1))}
      >
        <Icon name="chevron" />
        <Tip label="Next page" side="bottom" />
      </button>
      <span className="pdf-zoom">
        <button
          type="button"
          className="round has-tip"
          aria-label="Zoom out"
          aria-disabled={smallest || undefined}
          onClick={unless(smallest, () => onZoom(zoomStep(scale, false)))}
        >
          <Icon name="minus" />
          <Tip label="Zoom out" side="bottom" />
        </button>
        <span className="pdf-scale">{Math.round(scale * 100)} %</span>
        <button
          type="button"
          className="round has-tip"
          aria-label="Zoom in"
          aria-disabled={largest || undefined}
          onClick={unless(largest, () => onZoom(zoomStep(scale, true)))}
        >
          <Icon name="plus" />
          <Tip label="Zoom in" side="bottom" />
        </button>
        <button type="button" className="ghost" aria-pressed={fit} onClick={() => onZoom('fit')}>
          Fit width
        </button>
      </span>
    </div>
  )
}

function PageRail({ count, current, onGo }: { count: number; current: number; onGo: (n: number) => void }) {
  return (
    <nav className="pdf-rail" aria-label="Pages">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i + 1}
          type="button"
          aria-current={current === i + 1 ? 'page' : undefined}
          aria-label={`Page ${i + 1}`}
          onClick={() => onGo(i + 1)}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  )
}
