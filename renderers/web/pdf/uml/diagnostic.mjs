// Private trusted fixture. Calls the unchanged confinement module and its live judge.
import fs from 'node:fs'
import crypto from 'node:crypto'
import net from 'node:net'
import { probeHost } from '../host-probe.mjs'
import { launchConfined } from '../confine.mjs'
import { captureHtml } from '../capture-html.mjs'
const input = '/tmp/uml-fixture.html'
fs.writeFileSync(
  input,
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\'"><style>body{background:#fff;color:#111;font:18px/1.6 serif}section{margin:24px}</style><h1>Confined renderer test</h1><section>' +
    'Città, señal, naïve façade. Trusted fixture text. '.repeat(160) +
    '</section></html>',
  { mode: 0o644 },
)
const work = fs.mkdtempSync('/tmp/uml-browser-')
const started = performance.now()
/** @type {Awaited<ReturnType<typeof launchConfined>> | null} */
let browser = null
/** @type {{event:string,qualification:boolean,sourceBase:string,fixtureOnly:boolean,
 * localDiagnosticLaunchTimeoutMs:number,releaseLaunchBudgetMs:number,launchMs?:number,
 * releaseLaunchBudgetPass?:boolean,before?:import('../confine.mjs').SandboxVerdict,
 * after?:import('../confine.mjs').SandboxVerdict,captures?:Array<{height:number,bytes:number,sha256:string,ms:number}>,
 * pdf?:{bytes:number,header:string,sha256:string},functionalPass?:boolean,error?:string,totalMs?:number}} */
const result = {
  event: 'UML_FULL_DIAGNOSTIC',
  qualification: false,
  sourceBase: '872ba5a86a605a564063cd14ba59ef9aac9d4061',
  fixtureOnly: true,
  localDiagnosticLaunchTimeoutMs: 30000,
  releaseLaunchBudgetMs: 30000,
}
try {
  browser = await launchConfined({ workDir: work, timeoutMs: 30000 })
  result.launchMs = performance.now() - started
  result.releaseLaunchBudgetPass = result.launchMs <= 30000
  const page = await browser.context.newPage()
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto(`file://${input}`, { waitUntil: 'load', timeout: 30000 })
  result.before = browser.selfTest()
  if (!result.before.active) throw new Error(result.before.reasons.join('; '))
  const cdp = await browser.context.newCDPSession(page)
  result.captures = []
  for (const height of [768, 1600]) {
    const time = performance.now()
    const shot = /** @type {unknown} */ (
      await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1024, height, scale: 1 },
        captureBeyondViewport: true,
        fromSurface: true,
      })
    )
    if (typeof shot !== 'object' || shot === null) throw new Error('invalid screenshot response')
    const data = /** @type {unknown} */ (Reflect.get(shot, 'data'))
    if (typeof data !== 'string') throw new Error('invalid screenshot payload')
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('invalid PNG')
    result.captures.push({
      height,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      ms: performance.now() - time,
    })
    console.log(JSON.stringify({ event: 'UML_IMAGE', height, data }))
  }
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  result.pdf = {
    bytes: pdf.length,
    header: pdf.subarray(0, 5).toString(),
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
  }
  if (result.pdf.header !== '%PDF-') throw new Error('invalid PDF')
  result.after = browser.selfTest()
  if (!result.after.active) throw new Error(result.after.reasons.join('; '))
  result.functionalPass = true
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.functionalPass = false
} finally {
  if (browser) {
    const ownedBrowser = browser
    const timer = setTimeout(() => ownedBrowser.kill(), 5000)
    try {
      await browser.close()
    } catch {
      browser.kill()
    } finally {
      clearTimeout(timer)
    }
  }
  fs.rmSync(work, { recursive: true, force: true })
}
result.totalMs = performance.now() - started
console.log(JSON.stringify(result))
console.log('UML_FULL_DIAGNOSTIC_COMPLETE')
// Exercise the original production entry points and wrapper probes unchanged.
// The positive endpoint and token are synthetic and exist only in this guest.
fs.mkdirSync('/run/uml-private', { mode: 0o700 })
fs.writeFileSync('/run/uml-private/token', 'synthetic-not-a-capability', { mode: 0o600 })
fs.writeFileSync('/run/uml-private/sentinel', 'synthetic-not-a-secret', { mode: 0o600 })
const server = net.createServer((socket) => socket.end())
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(4321, '127.0.0.1', () => resolve(undefined))
})
/** @type {Awaited<ReturnType<typeof probeHost>> | undefined} */
let suite
try {
  suite = await probeHost({
    secrets: ['/run/uml-private/sentinel'],
    env: {
      ...process.env,
      SOPHIA_API_URL: 'http://127.0.0.1:4321',
      SOPHIA_RENDER_RUNNER_TOKEN_FILE: '/run/uml-private/token',
    },
  })
  console.log(
    JSON.stringify({
      event: 'UML_ORIGINAL_KERNEL_SUITE',
      qualification: false,
      syntheticApiPositive: true,
      releaseLaunchBudgetMs: 30000,
      widthSweepBudgetMs: 60000,
      checks: suite,
      passed: suite.every((check) => check.ok),
    }),
  )
} finally {
  await new Promise((resolve) => server.close(() => resolve(undefined)))
  fs.rmSync('/run/uml-private', { recursive: true, force: true })
}
// Preserve the original suite's failure. Its summary omits a check's detailed
// reason, so a failed capture gets one bounded diagnostic receipt with the same
// source fixture, targets, original kernel and normal deadlines.
if (suite.some((check) => check.check === 'capture_checks' && !check.ok)) {
  const source = fs.mkdtempSync('/tmp/uml-width-source-')
  const output = fs.mkdtempSync('/tmp/uml-width-output-')
  const fixture = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Probe</title>
<style>body{margin:0;font:18px/1.5 Georgia,serif;color:#222;background:#fafafa} section{padding:1rem 2rem;max-width:60rem;margin:auto}</style>
</head><body><main><h1>Verifica dell'host di cattura</h1>
<section data-section="s1"><p data-block="b1">${'Città, señal, naïve façade: àèéìòù. '.repeat(8)}</p></section>
<section data-section="s2"><ul><li data-block="b2">Uno.</li><li data-block="b3">Due.</li></ul></section></main></body></html>
`
  try {
    fs.chmodSync(source, 0o755)
    fs.chmodSync(output, 0o777)
    fs.writeFileSync(`${source}/index.html`, fixture, { mode: 0o644 })
    const sha256 = crypto.createHash('sha256').update(fixture).digest('hex')
    const receipt = await captureHtml(
      {
        sourceRoot: source,
        outputDir: output,
        entry: { path: 'index.html', sha256 },
        language: 'it',
        targets: ['w390-light', 'w1280-light'],
      },
      { env: process.env },
    )
    console.log(
      JSON.stringify({
        event: 'UML_CAPTURE_FAILURE_DETAIL',
        qualification: false,
        diagnosticOnly: true,
        fixtureSha256: sha256,
        status: receipt.status,
        error: receipt.error,
        checks: receipt.checks,
        sandbox: receipt.sandbox,
        captureCount: receipt.captures.length,
      }),
    )
  } finally {
    fs.rmSync(source, { recursive: true, force: true })
    fs.rmSync(output, { recursive: true, force: true })
  }
}
process.exitCode = result.functionalPass && result.releaseLaunchBudgetPass && suite.every((check) => check.ok) ? 0 : 1
