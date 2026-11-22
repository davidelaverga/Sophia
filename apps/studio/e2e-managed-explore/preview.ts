import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

/** Synthetic demonstration bytes, delivered from a separate loopback origin to the ordinary Studio. */
const contentSecurityPolicy =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors http://127.0.0.1:5276"

export function prototype(version: number) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fleet review</title><style>
    body{margin:0;background:#f4f7f8;color:#112930;font:16px/1.4 system-ui}main{padding:24px;max-width:510px;margin:auto}
    small{color:#276060;font-weight:700}h1{font-size:26px;margin:8px 0 16px}.record{border-radius:12px;padding:16px;border:1px solid #c9dadf;background:#fff}
    .record p{margin:0 0 12px}label{display:block;margin-bottom:5px}textarea{width:94%;padding:7px;border:1px solid #8aa7ac;border-radius:6px}
    button{margin:10px 8px 8px 0;border:0;border-radius:8px;padding:9px 12px;color:white;background:#245757}button:disabled{background:#425c60;opacity:.55}
    #status{margin-top:8px;color:#276060;font-weight:700}
    </style></head><body><main><small>FLEET OPERATIONS · DEMO DATA</small><h1>Weekly energy review</h1><div class="record"><p><strong>MV Tern</strong> · Week 46 · 8.4% above baseline</p>
    ${version === 2 ? '<label for="explanation">Chief engineer explanation</label><textarea id="explanation" rows="2"></textarea>' : ''}
    <button id="respond" ${version === 2 ? 'disabled' : ''}>${version === 2 ? 'Submit explanation' : 'Acknowledge exception'}</button>
    <button id="assign" disabled>Assign follow-up</button><div id="status" role="status">Waiting for vessel</div></div></main>
    <script>
      const respond = document.getElementById('respond');
      const assign = document.getElementById('assign');
      const explanation = document.getElementById('explanation');
      const status = document.getElementById('status');
      if (explanation) explanation.addEventListener('input', () => respond.disabled = !explanation.value.trim());
      respond.onclick = () => { assign.disabled = false; status.textContent = 'Ready for shore'; };
      assign.onclick = () => { status.textContent = 'Follow-up assigned'; };
    </script></body></html>`
}

export const entryHash = (version: number) => createHash('sha256').update(prototype(version)).digest('hex')

if (import.meta.main)
  createServer((request, response) => {
    if (request.url === '/health') return response.end('ok')
    const match = /^\/v1\/previews\/synthetic-(missing-|wrong-hash-)?v([12])\/index\.html$/u.exec(request.url ?? '')
    const allowed = request.headers.origin === 'http://127.0.0.1:5276'
    if (request.method === 'HEAD' && allowed) {
      response.setHeader('access-control-allow-origin', 'http://127.0.0.1:5276')
      response.setHeader('access-control-expose-headers', 'X-Sophia-Preview-Entry-SHA256')
    }
    if (!match || match[1] === 'missing-') return response.writeHead(404).end()
    const version = Number(match[2])
    const headers = {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': contentSecurityPolicy,
      'referrer-policy': 'no-referrer',
      'cache-control': 'private, no-store',
    }
    if (request.method === 'HEAD') {
      const digest = match[1] === 'wrong-hash-' ? '0'.repeat(64) : entryHash(version)
      return response.writeHead(200, { ...headers, 'x-sophia-preview-entry-sha256': digest }).end()
    }
    return response.writeHead(200, headers).end(prototype(version))
  }).listen(5277, 'localhost')
