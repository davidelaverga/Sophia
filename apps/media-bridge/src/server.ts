// The media bridge process (S1-05A Checkpoint C). It holds the Gemini API key and the media-bridge capability;
// neither is logged, and neither reaches a browser. It needs the API's private base URL, not a public one.
//
//   SOPHIA_SERVICE_URL          the API, e.g. http://127.0.0.1:8787
//   SOPHIA_MEDIA_BRIDGE_TOKEN   the media-bridge capability (the API holds only its SHA-256)
//   GEMINI_API_KEY              Gemini API (never Vertex); only on an authorized execution host
//   SOPHIA_LIVE_MODEL           default gemini-3.8-live
//   SOPHIA_LIVE_MODE            `rehearse` for local development: no Google call, no key, never live evidence
//   SOPHIA_GUIDE_VERSION        the guide to run: v1.2 (default; adds research) or v1.1 (M01's six operations). The
//                               API must serve the same version's surface; roll the bridge back before the API
//   SOPHIA_BRIDGE_INSTANCE      a name for this host in presence reports (default: the host name); each process adds
//                               a random suffix, so two overlapping processes (a rolling restart) stay distinct and
//                               each must confirm a guest's quiesce request (0013)
//   SOPHIA_LIVE_CAPTIONS        `off` (or false, 0, no; any case) sends the members present no live captions of what
//                               is said aloud (CX-0023); unset, on, true, 1 or yes, they are on. Any other value is
//                               read as off and logged (`bridge.setting_not_understood`). Off, words only cut a
//                               reply, as before. `bridge.start` shows the effective `liveCaptions`
//
// One bridge instance serves all rooms: two instances would both join as `sophia` and replace each other.
//
// The guide (src/content/mission-guide/) is loaded and checked before anything else: a missing or altered asset
// stops the process, so a deploy that cannot activate the new guide fails instead of running without it.
import { randomBytes } from 'node:crypto'
import { hostname } from 'node:os'
import { MediaBridge } from './bridge.ts'
import { GUIDE_DIR, guideIdentity, guideVersionOf, loadMissionGuide } from './guide.ts'
import { liveCaptionsSetting } from './captions.ts'
import { connectGeminiLive } from './live-session.ts'
import { connectRehearsal, REHEARSAL_BANNER } from './rehearsal.ts'
import { joinLiveKitRoom } from './rtc.ts'
import { httpMediaService } from './service.ts'
import { TOOL_SETS } from './tools.ts'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const host = (process.env.SOPHIA_BRIDGE_INSTANCE ?? hostname()).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 48)
const instance = `${host}-${randomBytes(4).toString('hex')}`

const version = guideVersionOf(process.env.SOPHIA_GUIDE_VERSION)
const guide = loadMissionGuide(TOOL_SETS[version].names, GUIDE_DIR, version)
console.log(JSON.stringify({ at: new Date().toISOString(), event: 'guide.loaded', ...guideIdentity(guide) }))

const captions = liveCaptionsSetting(process.env.SOPHIA_LIVE_CAPTIONS)
if (!captions.understood) {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      event: 'bridge.setting_not_understood',
      name: 'SOPHIA_LIVE_CAPTIONS',
      readAs: 'off',
    }),
  )
}

const rehearse = process.env.SOPHIA_LIVE_MODE === 'rehearse'
const model = rehearse ? 'rehearsal' : (process.env.SOPHIA_LIVE_MODEL ?? 'gemini-3.8-live')

const bridge = new MediaBridge({
  service: httpMediaService(required('SOPHIA_SERVICE_URL'), required('SOPHIA_MEDIA_BRIDGE_TOKEN')),
  joinRoom: joinLiveKitRoom,
  connectLive: rehearse ? connectRehearsal : connectGeminiLive,
  apiKey: rehearse ? '' : required('GEMINI_API_KEY'),
  model,
  guide,
  bridgeInstanceId: instance,
  liveCaptions: captions.on,
  now: Date.now,
  log: (event, detail) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...detail })),
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    bridge.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  })
}

console.log(
  JSON.stringify({
    event: 'bridge.start',
    instance,
    model,
    liveCaptions: captions.on,
    ...(rehearse ? { banner: REHEARSAL_BANNER } : {}),
  }),
)
await bridge.run()
