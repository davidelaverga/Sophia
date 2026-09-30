// "Talk instead" in the personal composer (direction C): the field gives way to a listening line, and what was said
// lands in the field to edit or send. Only on-device recognition is used (the browser's `processLocally`), so the
// person's voice never leaves the device for a speech service; a browser that can't recognise speech on the device
// shows no microphone at all.
import { useEffect, useRef, useState } from 'react'

interface Alternative {
  transcript: string
}
interface ResultEvent extends Event {
  results: ArrayLike<ArrayLike<Alternative> & { isFinal: boolean }>
}
interface Recognition extends EventTarget {
  lang: string
  interimResults: boolean
  continuous: boolean
  processLocally: boolean
  start(): void
  stop(): void
  abort(): void
}
interface RecognitionClass {
  new (): Recognition
  available(options: { langs: string[]; processLocally: boolean }): Promise<string>
  install(options: { langs: string[]; processLocally: boolean }): Promise<boolean>
}

function recognitionClass(): RecognitionClass | null {
  const found: unknown = Reflect.get(globalThis, 'SpeechRecognition')
  if (typeof found !== 'function') return null
  if (typeof Reflect.get(found, 'available') !== 'function' || typeof Reflect.get(found, 'install') !== 'function') {
    return null
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked above: a constructor with the on-device statics
  return found as RecognitionClass
}

const language = () => navigator.language || 'en-US'

/** Whether this browser can recognise speech on the device, for the person's language. */
async function onDevice(Recognizer: RecognitionClass): Promise<boolean> {
  try {
    const state = await Recognizer.available({ langs: [language()], processLocally: true })
    return state === 'available' || state === 'downloadable'
  } catch {
    return false
  }
}

const isResult = (e: Event): e is ResultEvent => 'results' in e

const transcriptOf = (e: ResultEvent) =>
  Array.from(e.results)
    .map((r) => r[0]?.transcript ?? '')
    .join(' ')
    .trim()

export function useDictation(onText: (text: string) => void) {
  const [available, setAvailable] = useState(false)
  const [listening, setListening] = useState(false)
  const current = useRef<Recognition | null>(null)
  const deliver = useRef(onText)
  useEffect(() => {
    deliver.current = onText
  })
  useEffect(() => {
    const Recognizer = recognitionClass()
    if (Recognizer) void onDevice(Recognizer).then(setAvailable)
    return () => current.current?.abort()
  }, [])

  const start = async () => {
    const Recognizer = recognitionClass()
    if (!Recognizer || current.current) return
    const options = { langs: [language()], processLocally: true }
    if ((await Recognizer.available(options)) === 'downloadable') await Recognizer.install(options)
    const r = new Recognizer()
    Object.assign(r, { lang: language(), interimResults: false, continuous: false, processLocally: true })
    let heard = ''
    r.addEventListener('result', (e) => {
      if (isResult(e)) heard = transcriptOf(e)
    })
    r.addEventListener('error', () => r.abort())
    r.addEventListener('end', () => {
      current.current = null
      setListening(false)
      if (heard) deliver.current(heard)
    })
    current.current = r
    setListening(true)
    r.start()
  }
  return {
    available,
    listening,
    start: () => void start().catch(() => setListening(false)),
    stop: () => current.current?.stop(),
  }
}
