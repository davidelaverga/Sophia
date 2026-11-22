import { prototypeBootstrapOffset } from '@sophia/design'

/** The shell runs only on the dedicated preview origin. The retained document has an opaque origin. */
export function previewContentPolicy(ancestors: string, frameSrc = "'none'", opaque = true): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    `frame-src ${frameSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${ancestors}`,
    opaque ? 'sandbox allow-scripts' : 'sandbox allow-scripts allow-same-origin',
  ].join('; ')
}

function scriptValue(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

const shellRuntime = `(documentUrl, studioOrigin) => {
  const frame = document.createElement('iframe');
  frame.title = 'Retained interactive prototype';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  let port, hasLoaded = false, invalid = false, ready = false, pending, readinessTimer;
  const tell = (kind, id) => parent.postMessage({kind, id}, studioOrigin);
  const invalidate = () => {
    if (invalid) return;
    invalid = true;
    clearTimeout(readinessTimer);
    clearTimeout(pending?.timer);
    port?.close();
    frame.remove();
    tell('preview-invalid');
  };
  const challenge = (id) => {
    if (!port || invalid || !hasLoaded || pending) return;
    const nonce = crypto.randomUUID();
    pending = {id, nonce, timer: setTimeout(invalidate, 3000)};
    port.postMessage(nonce);
  };
  addEventListener('message', (event) => {
    if (invalid) return;
    if (event.source === parent && event.origin === studioOrigin) {
      const data = event.data;
      if (ready && data?.kind === 'preview-check' && typeof data.id === 'string') challenge(data.id);
      return;
    }
    // The bootstrap is the first script and its first message from this WindowProxy transfers the capability.
    if (port || event.origin !== 'null' || event.source !== frame.contentWindow) return;
    if (event.data !== 'preview-channel' || event.ports.length !== 1) {
      invalidate();
      return;
    }
    port = event.ports[0];
    port.onmessage = ({data}) => {
      if (invalid) return;
      if (data === 'preview-left' || !pending || data !== pending.nonce) {
        invalidate();
        return;
      }
      clearTimeout(pending.timer);
      const {id} = pending;
      pending = undefined;
      if (id) tell('preview-checked', id);
      else {
        clearTimeout(readinessTimer);
        ready = true;
        tell('preview-ready');
      }
    };
    if (hasLoaded) challenge();
  });
  frame.addEventListener('load', () => {
    if (hasLoaded) {
      if (!ready || pending) {
        invalidate();
        return;
      }
      // WebKit can emit load on a same-document fragment jump.
      // Only the original port can revalidate. pagehide disables its answering end.
      ready = false;
      tell('preview-rechecking');
    }
    hasLoaded = true;
    readinessTimer = setTimeout(invalidate, 3000);
    challenge();
  });
  frame.src = documentUrl;
  document.body.append(frame);
}`

export function previewShell(documentUrl: string, studioOrigin: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Prototype preview</title>
<style>html,body{margin:0;width:100%;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style>
</head><body><script>(${shellRuntime})(${scriptValue(documentUrl)},${scriptValue(studioOrigin)})</script></body></html>`
}

/** Insert trusted code before any source script. The original bytes and hash remain the export identity. */
export function previewDocument(source: string, previewOrigin: string): string {
  const offset = prototypeBootstrapOffset(source)
  return `${source.slice(0, offset)}<script>
(() => {
  const channel = new MessageChannel();
  const send = channel.port1.postMessage.bind(channel.port1);
  // Do not look up an overridable MessageEvent property after the retained script starts.
  const readData = Function.call.bind(Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'data').get);
  let loaded = false, left = false;
  addEventListener('load', (event) => { if (event.isTrusted) loaded = true; }, {once: true});
  addEventListener('pagehide', (event) => {
    if (!event.isTrusted) return;
    left = true;
    send('preview-left');
  }, true);
  channel.port1.onmessage = (event) => {
    if (!loaded || left) return;
    const data = readData(event);
    if (typeof data === 'string') send(data);
  };
  document.currentScript.remove();
  parent.postMessage('preview-channel', ${scriptValue(previewOrigin)}, [channel.port2]);
})();
</script>${source.slice(offset)}`
}
