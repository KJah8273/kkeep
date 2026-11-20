import {resolvePublicEngine} from './engine.js';

// Native engine requests for game content need the jar worker's fetch handler,
// including requests outside the small JSON RPC bridge. Claim the game page
// before starting the engine so its workers inherit that controlled session.
async function prepareBrowserSession() {
  let timeout;
  try {
    if (typeof window.__kkeepSessionReady !== 'function') throw new Error('Session bridge unavailable');
    const status = document.getElementById('status');
    if (status) status.textContent = 'Connecting to Roblox…';
    await Promise.race([
      window.__kkeepSessionReady(true),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Session setup timed out')), 45000);
      })
    ]);
  } catch {
    const error = new Error('The Roblox session could not connect. Please reload the page.');
    error.name = 'KkeepSessionError';
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// This function is serialized into the provider loader's private scope. Keep
// it independent of worker globals, credentials, channel tokens, and storage.
async function loadPublicProductionEngine(validate) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(new URL('/_rbx/engine', location.origin).href, {
          method: 'GET', credentials: 'omit', mode: 'same-origin',
          redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Public engine metadata unavailable');
        const engine = validate(await response.json());
        if (!engine) throw new Error('Invalid public engine metadata');
        return new URL(engine.basePath, location.origin).href;
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Public engine metadata timed out'));
        }, 8000);
      })
    ]);
  } catch {
    // The loader's existing catch displays its engine error. Do not resume a
    // stale cache/local-directory fallback or include response data in errors.
    throw new Error('The current public Roblox engine is unavailable. Please reload the page.');
  } finally {
    clearTimeout(timeout);
  }
}

function replaceOnce(text, from, to, contract) {
  if (text.split(from).length !== 2) throw new Error(contract);
  return text.replace(from, () => to);
}

// Serialized only into the inspected player's optional account-locale lookup.
// Keep its original request and fallback; a slow response or JSON body must
// not hold native startup indefinitely after flags and the asset index are ready.
async function fetchOptionalLocaleJson(url, options) {
  const controller = new AbortController();
  let timeout;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {...options, signal: controller.signal});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          // Settle the deadline before abort can settle the pending request.
          reject(new Error('Optional locale lookup timed out'));
          controller.abort();
        }, 12000);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export function transformPlayerLocaleDeadline(text) {
  const original = 'async function Pt(e,t){let n=yt(e),o=t?t.url(n):n;try{let r=await fetch(o,{credentials:"include",...t?{headers:t.authHeaders()}:{}});if(!r.ok)throw new Error(`HTTP ${r.status}`);let i=await r.json(),d=';
  const replacement = 'async function Pt(e,t){let n=yt(e),o=t?t.url(n):n;try{let i=await (' +
    fetchOptionalLocaleJson.toString() + ')(o,{credentials:"include",...t?{headers:t.authHeaders()}:{}}),d=';
  return replaceOnce(text, original, replacement, 'Engine optional locale lookup changed');
}

export function transformEngineLoader(text, path) {
  if (/^(?:\/[a-f0-9]{40})?\/assets\/webclient\/WasmLoader\.js$/.test(path)) {
    const contract = 'Provider engine version resolution changed';
    const declaration = '  async function resolveEngineBase(server, channel, proxy) {';
    const cache = '    if (!clientVersionUpload) {\n      const cached = getCachedClientVersion(server);';
    for (const required of [
      '  var WEB_CLIENT_BINARY_TYPE = "WebClientApp";',
      '    const { channelName, token } = channel;',
      '      const versionPath = isProductionChannel(channelName) ?',
      '    const userChannel = await resolveUserChannel(server, cdnProxy);',
      '    showEngineLoadError();'
    ]) if (!text.includes(required)) throw new Error(contract);
    text = replaceOnce(text, declaration,
      prepareBrowserSession.toString() + '\n' + resolvePublicEngine.toString() + '\n' + loadPublicProductionEngine.toString() + '\n' + declaration, contract);
    text = replaceOnce(text, cache,
      '    if (!clientVersionUpload && server === "prod" && isProductionChannel(channelName)) {\n' +
      '      return await loadPublicProductionEngine(resolvePublicEngine);\n' +
      '    }\n' + cache, contract);
    text = replaceOnce(text,
      '  (async () => {\n    const context = await resolveLoaderContext();',
      '  (async () => {\n    await prepareBrowserSession();\n    const context = await resolveLoaderContext();', contract);
    text = replaceOnce(text,
      '  function showEngineLoadError() {\n    const message = "Failed to load engine. Please reload the page.";',
      '  function showEngineLoadError(message = "Failed to load engine. Please reload the page.") {', contract);
    return replaceOnce(text,
      '    console.error("[WasmLoader] Engine resolution failed", err);\n    showEngineLoadError();',
      '    console.error("[WasmLoader] Engine resolution failed", err);\n' +
      '    showEngineLoadError(err?.name === "KkeepSessionError" ? "The Roblox session could not connect. Please reload the page." : undefined);', contract);
  }

  // The observed play-page chunk overwrites a valid cache with an expired
  // public build on every launch. Remove only that exact, verified statement;
  // keep the subsequent signed-in check and all enrollment/authentication code.
  if (/^\/[a-f0-9]{40}\/_next\/static\/chunks\/[^/]+\.js$/.test(path) &&
      text.includes('name:"roblox-wasm-play-page"') && text.includes('"version-f4a4dba57f874ad0"')) {
    const contract = 'Provider play-page engine seed changed';
    const seed = 'let n="version-f4a4dba57f874ad0";n&&localStorage.setItem("clientVersion_".concat(e),JSON.stringify({clientVersionUpload:n,version:"",channelName:"",cachedAt:Date.now()})),';
    // Minifier names change between public releases. Verify the unchanged
    // authentication helper reached after this exact seed instead of pinning
    // its name. Only the seed is removed; all authentication bytes stay intact.
    const identifier = '[A-Za-z_$][\\w$]{0,63}';
    const seedAt = text.indexOf(seed);
    const continuation = text.slice(seedAt + seed.length).match(new RegExp(
      String.raw`^(${identifier})\(\)\.then\((${identifier})=>\{`));
    const authenticate = new RegExp(
      String.raw`async function (${identifier})\(\)\{try\{let (${identifier})=await fetch\(` +
      String.raw`"https://users\."\.concat\(${identifier}(?:\.${identifier})?,"/v1/users/authenticated"\),` +
      String.raw`\{credentials:"include"\}\);return 401===\2\.status\|\|403===\2\.status\}` +
      String.raw`catch\(${identifier}\)\{return!1\}\}`, 'g');
    const helpers = [...text.matchAll(authenticate)].filter(match => match[1] === continuation?.[1]);
    if (!text.includes('let e="prod";window.robloxWasmHostConfig={server:e,useCdnBinary:!0,workerStubUrl:') ||
        seedAt < 0 || !continuation || helpers.length !== 1) throw new Error(contract);
    return replaceOnce(text, seed, '', contract);
  }
  return text;
}
