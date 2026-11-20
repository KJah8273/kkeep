// Public, immutable files from the exact engine inspected by this runtime.
// The account/session proxy is deliberately outside this delivery path.
const PUBLIC_ENGINE_PREFIX = '/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const PUBLIC_ENGINE_CDN = 'https://setup.rbxcdn.com/webclient/version-1ef59424f70d4932-RobloxWebClient/';
const PUBLIC_ENGINE_SCRIPTS = {
  // Hashes are of the inspected provider fixtures, before Kkeep transforms.
  'WasmPlayer.js': '1a873b3bb94f63465bfb1f6f864cce7a2e4ec59e63cc5c313313bff4b69162ad',
  'WebClient.js': 'b4dc7434dec6998c3fbf91e7eac93c2b4a1f4ab0f7d37c434f19c3dbe9f2d3a3',
  'audio-processor-fast.js': '6b75b80b356febfff0f1d223963673d87b3c8564a276de560c473641c6c06cef'
};

export function publicEngineAsset(url, method = 'GET') {
  if (!['GET', 'HEAD'].includes(method) || url.search || url.hash || !url.pathname.startsWith(PUBLIC_ENGINE_PREFIX)) return null;
  const file = url.pathname.slice(PUBLIC_ENGINE_PREFIX.length);
  if (!file || !file.split('/').every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))) return null;
  const script = Object.hasOwn(PUBLIC_ENGINE_SCRIPTS, file);
  const data = file === 'WebClient.fsindex.txt' || file === 'WebClient.wasm' ||
    /^(?:content|ExtraContent|PlatformContent|shaders)\//.test(file) && !/\.(?:js|mjs|cjs|html?|css)$/i.test(file);
  if (!script && !data) return null;
  return {file, script, url: PUBLIC_ENGINE_CDN + file};
}

function assetDeadline(promise, milliseconds, abort) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => {
      // Reject first: canceling a pending read can resolve it as done:true.
      // A stalled download must fail, not look like a successful short file.
      reject(new Error('Public engine asset timed out'));
      abort();
    }, milliseconds);
  })]).finally(() => clearTimeout(timer));
}

// Keep a live large download streaming. Bound a stalled response or stalled
// reader instead of buffering the 100 MB engine or imposing a total download
// deadline on slower iPads. Cancellation releases the upstream connection.
export async function fetchEngineAssetResponse(target, options, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const cleanup = () => signal?.removeEventListener('abort', abort);
  if (signal?.aborted) throw new Error('Public engine asset canceled');
  signal?.addEventListener('abort', abort, {once: true});
  let upstream;
  try {
    const pending = fetch(target, {...options, redirect: 'manual', credentials: 'omit', signal: controller.signal});
    // Also dispose a late response if an implementation ignores cancellation.
    pending.then(response => {
      if (controller.signal.aborted) response.body?.cancel().catch(() => {});
    }, () => {});
    upstream = await assetDeadline(pending, 12000, abort);
  } catch (error) {
    abort();
    cleanup();
    throw error;
  }
  if (!upstream.body) {
    cleanup();
    return upstream;
  }
  const reader = upstream.body.getReader();
  const stop = () => { abort(); cleanup(); reader.cancel().catch(() => {}); };
  const body = new ReadableStream({
    async pull(output) {
      try {
        const {done, value} = await assetDeadline(reader.read(), 20000, stop);
        if (done) { cleanup(); output.close(); }
        else output.enqueue(value);
      } catch (error) {
        stop();
        output.error(error);
      }
    },
    cancel() { stop(); }
  });
  return new Response(body, {status: upstream.status, statusText: upstream.statusText, headers: upstream.headers});
}

async function readEngineScript(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Public engine script has no body');
  const chunks = [];
  let length = 0;
  try {
    return await assetDeadline((async () => {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1024 * 1024) throw new Error('Public engine script is too large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    })(), 12000, () => { reader.cancel().catch(() => {}); });
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function verifyPublicEngineScript(text, file) {
  if (!Object.hasOwn(PUBLIC_ENGINE_SCRIPTS, file)) return null;
  if (file === 'WasmPlayer.js') {
    // The provider changes this one public CDN literal. Require the original
    // occurrence count, then prove full byte equivalence with its saved script.
    const from = 'https://setup.rbxcdn.com';
    if (text.split(from).length !== 2) return null;
    text = text.replace(from, 'https://api.spf50krem.com/_/c2V0dXAucmJ4Y2RuLmNvbQ');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return hash === PUBLIC_ENGINE_SCRIPTS[file] ? text : null;
}

export async function fetchPublicEngineAsset(asset, request) {
  const headers = new Headers();
  // Scripts must be checked as complete files, never as an unchecked range.
  for (const key of asset.script ? ['accept'] : ['accept', 'range', 'if-range']) {
    if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  }
  let response;
  try {
    response = await fetchEngineAssetResponse(asset.url,
      {method: asset.script ? 'GET' : request.method, headers}, request.signal);
    if (!response.ok || asset.script && response.status !== 200) {
      await response.body?.cancel();
      return null;
    }
    if (!asset.script) {
      // An upstream error page must not become an unchecked same-origin script
      // through the gateway's generic text transformation path.
      const type = response.headers.get('content-type') || '';
      if (/html|javascript|ecmascript|jscript|livescript|text\/css/i.test(type)) {
        await response.body?.cancel();
        return null;
      }
      return response;
    }
    const text = await verifyPublicEngineScript(await readEngineScript(response), asset.file);
    if (text === null) return null;
    const out = new Headers(response.headers);
    for (const key of ['content-length', 'content-encoding', 'etag', 'last-modified']) out.delete(key);
    out.set('Content-Type', 'text/javascript; charset=utf-8');
    return new Response(request.method === 'HEAD' ? null : text, {status: 200, headers: out});
  } catch {
    await response?.body?.cancel().catch(() => {});
    return null;
  }
}
