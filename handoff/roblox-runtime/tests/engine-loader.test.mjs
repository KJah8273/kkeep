import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformEngineLoader} from '../worker/engine-loader.js';
import worker from '../worker/index.js';

const origin = 'https://runtime.example';
const build = '/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a';
const loaderPath = build + '/assets/webclient/WasmLoader.js';
const shellPath = build + '/_next/static/chunks/918-0935162cc5291a5b.js';
const loader = readFileSync(new URL('./fixtures/WasmLoader.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./fixtures/play-page-chunk.js', import.meta.url), 'utf8');
const currentBuild = '/6536749aa05e452da9c4d6ed4b464613ff9ba84a';
const currentShellPath = currentBuild + '/_next/static/chunks/51-e67dc1acff0bee27.js';
// Public shell asset fetched without cookies or account requests on 2026-11-20.
const currentShell = readFileSync(new URL('./fixtures/play-page-chunk-51.js', import.meta.url), 'utf8');
const shellFixtures = [
  {source: shell, path: shellPath, build, entry: 1918},
  {source: currentShell, path: currentShellPath, build: currentBuild, entry: 8051}
];
const current = 'version-1ef59424f70d4932';
const stale = 'version-f4a4dba57f874ad0';
const basePath = version => '/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/' + version + '-RobloxWebClient';
const metadata = {version: current, files: [basePath(current) + '/WebClient.wasm']};
const tick = () => new Promise(resolve => setImmediate(resolve));

async function replay(options = {}) {
  const requests = [], scripts = [], timers = new Map(), cleared = [], sessionCalls = [];
  let nextTimer = 0;
  const cache = new Map([['clientVersion_prod', JSON.stringify({
    clientVersionUpload: options.cachedVersion ?? stale,
    channelName: options.cachedChannel ?? '', version: 'cached'
  })]]);
  const status = {textContent: ''}, title = {}, message = {}, panel = {hidden: true};
  const overlay = {querySelector: () => panel, classList: {add() {}}, setAttribute() {}};
  const nodes = {'status': status, 'loading-overlay': overlay, 'loading-error-title': title, 'loading-error-message': message};
  class Script { constructor() { this.src = origin + loaderPath; } }
  const context = vm.createContext({
    URL, AbortController, HTMLScriptElement: Script, location: new URL(origin + '/games/start'),
    robloxWasmHostConfig: {server: options.server ?? 'prod'},
    __kkeepSessionReady: options.noSessionBridge ? undefined : async controlled => {
      sessionCalls.push(controlled);
      return options.sessionReady?.(controlled);
    },
    document: {currentScript: new Script(), createElement: () => new Script(),
      body: {appendChild: script => scripts.push(script)}, getElementById: id => nodes[id] ?? null},
    localStorage: {getItem(key) {if (options.storageDenied) throw new Error('Storage unavailable'); return cache.get(key) ?? null;},
      setItem(key, value) {if (options.storageDenied) throw new Error('Storage unavailable'); cache.set(key, value);}},
    console: {log() {}, warn() {}, error() {}},
    setTimeout(fn, ms) {const id = ++nextTimer; timers.set(id, {fn, ms}); return id;},
    clearTimeout(id) {cleared.push(id); timers.delete(id);},
    fetch: async (raw, init = {}) => {
      const url = new URL(String(raw)); requests.push({url, init});
      if (url.pathname === '/v2/user-channel') {
        return Response.json({channelName: options.channel ?? '', token: options.token ?? ''});
      }
      if (url.pathname.startsWith('/v2/client-version/')) {
        if (options.versionThrows) throw new TypeError('Version lookup unavailable');
        return options.version ? Response.json({clientVersionUpload: options.version, version: 'normal'}) : new Response(null, {status: 503});
      }
      if (url.href === origin + '/_rbx/engine') {
        if (options.hang) return new Promise(() => {});
        if (options.bodyHangs) return {ok: true, json: () => new Promise(() => {})};
        if (options.metadataStatus) return new Response(null, {status: options.metadataStatus});
        return Response.json(options.metadata ?? metadata);
      }
      throw new Error('Unexpected test request');
    }
  });
  context.window = context;
  vm.runInContext(transformEngineLoader(loader.replaceAll('https://api.spf50krem.com', origin), loaderPath), context);
  await tick();
  return {context, requests, scripts, timers, cleared, status, panel, message, cache, sessionCalls};
}

test('actual loader waits for controlled session readiness before channel lookup or engine startup', async () => {
  let claim;
  const result = await replay({version: current, sessionReady: () => new Promise(resolve => {claim = resolve;})});
  assert.deepEqual(result.sessionCalls, [true], 'Request control, not just an active worker');
  assert.equal(result.requests.length, 0);
  assert.equal(result.scripts.length, 0);
  assert.equal(result.context.__wasmLoaderContext, undefined);
  assert.equal(result.status.textContent, 'Connecting to Roblox…');
  claim(); await tick();
  assert.equal(result.requests.length, 2);
  assert.equal(result.scripts.length, 1);
  assert.equal(result.scripts[0].src, origin + basePath(current) + '/WasmPlayer.js');
  assert.equal(result.timers.size, 0);
});

test('missing or rejected session readiness shows a session error without starting or retrying the engine', async () => {
  for (const options of [{noSessionBridge: true}, {sessionReady: async () => {throw new Error('synthetic private session detail');}}]) {
    const result = await replay(options);
    assert.equal(result.requests.length, 0); assert.equal(result.scripts.length, 0);
    assert.equal(result.panel.hidden, false);
    assert.equal(result.message.textContent, 'The Roblox session could not connect. Please reload the page.');
    assert.equal(result.timers.size, 0);
    assert.ok(result.sessionCalls.length <= 1);
  }
});

test('a stalled control claim is bounded and late readiness cannot resume the failed launch', async () => {
  let claim;
  const result = await replay({sessionReady: () => new Promise(resolve => {claim = resolve;})});
  assert.equal(result.timers.size, 1);
  const [timer] = result.timers.values(); assert.equal(timer.ms, 45000);
  timer.fn(); await tick();
  assert.equal(result.panel.hidden, false);
  assert.equal(result.message.textContent, 'The Roblox session could not connect. Please reload the page.');
  assert.equal(result.requests.length, 0); assert.equal(result.scripts.length, 0);
  claim(); await tick();
  assert.equal(result.requests.length, 0); assert.equal(result.scripts.length, 0);
  assert.equal(result.timers.size, 0);
});

test('real loader replaces the expired seeded build with validated current public metadata after version failure', async () => {
  for (const versionThrows of [false, true]) {
    const result = await replay({versionThrows, token: 'synthetic-channel-token'});
    assert.equal(result.scripts.length, 1);
    assert.equal(result.scripts[0].src, origin + basePath(current) + '/WasmPlayer.js');
    assert.equal(result.context.__wasmLoaderContext.channel, '');
    assert.equal(result.requests.length, 3);
    const fallback = result.requests[2];
    assert.equal(fallback.url.href, origin + '/_rbx/engine');
    assert.equal(fallback.init.method, 'GET');
    assert.equal(fallback.init.credentials, 'omit');
    assert.equal(fallback.init.mode, 'same-origin');
    assert.equal(fallback.init.redirect, 'error');
    assert.equal(fallback.init.referrerPolicy, 'no-referrer');
    assert.equal(fallback.init.cache, 'no-store');
    assert.equal(fallback.init.headers, undefined);
    assert.equal(fallback.init.body, undefined);
    assert.equal(fallback.init.signal.aborted, false);
    assert.equal(result.timers.size, 0);
    assert.equal(result.panel.hidden, true);
  }
});

test('invalid or unavailable public metadata shows a visible error without loading the expired or local engine', async () => {
  for (const options of [
    {metadata: {version: current, files: ['https://other.example/WebClient.wasm']}},
    {metadata: {version: current, files: [basePath(stale) + '/WebClient.wasm']}},
    {metadata: {version: '../other', files: []}},
    {metadataStatus: 503}
  ]) {
    const result = await replay(options);
    assert.equal(result.scripts.length, 0);
    assert.equal(result.panel.hidden, false);
    assert.equal(result.message.textContent, 'Failed to load engine. Please reload the page.');
    assert.equal(result.requests.length, 3);
    assert.equal(result.timers.size, 0);
  }
});

test('fallback deadline bounds both a stalled response and a stalled JSON body without retries', async () => {
  for (const options of [{hang: true}, {bodyHangs: true}]) {
    const result = await replay(options);
    assert.equal(result.timers.size, 1);
    const [timer] = result.timers.values();
    assert.equal(timer.ms, 8000);
    timer.fn();
    await tick();
    assert.equal(result.requests[2].init.signal.aborted, true);
    assert.equal(result.scripts.length, 0);
    assert.equal(result.panel.hidden, false);
    assert.equal(result.requests.length, 3);
    assert.equal(result.timers.size, 0);
  }
});

test('successful production and named-channel lookups preserve enrollment, tokens, and their chosen engine', async () => {
  for (const channel of ['', 'production', 'private-test']) {
    const version = 'version-0123456789abcdef';
    const result = await replay({channel, token: 'synthetic-enrollment-token', version});
    assert.equal(result.requests.length, 2);
    assert.equal(result.requests[0].init.credentials, 'include');
    assert.equal(result.requests[1].init.headers['Roblox-Channel-Token'], 'synthetic-enrollment-token');
    assert.equal(result.requests[1].url.pathname, '/v2/client-version/WebClientApp' + (channel === 'private-test' ? '/channel/private-test' : ''));
    assert.equal(result.scripts[0].src, origin + basePath(version) + '/WasmPlayer.js');
    assert.equal(result.context.__wasmLoaderContext.channel, channel === 'private-test' ? channel : '');
    assert.equal(result.timers.size, 0);
  }
});

test('named-channel cached fallback and non-production environment remain unchanged', async () => {
  const named = await replay({channel: 'private-test', cachedChannel: 'private-test', cachedVersion: 'version-0123456789abcdef'});
  assert.equal(named.requests.length, 2);
  assert.equal(named.context.__wasmLoaderContext.channel, 'private-test');
  assert.equal(named.scripts[0].src, origin + basePath('version-0123456789abcdef') + '/WasmPlayer.js');
  const staging = await replay({server: 'st1'});
  assert.equal(staging.requests.length, 2);
  assert.equal(staging.scripts[0].src, origin + build + '/assets/webclient/WasmPlayer.js');
});

test('public fallback remains usable with unavailable local storage', async () => {
  const result = await replay({storageDenied: true});
  assert.equal(result.scripts[0].src, origin + basePath(current) + '/WasmPlayer.js');
  assert.equal(result.panel.hidden, true);
});

async function replayShell(source, {status = 200, entry = 1918} = {}) {
  const effects = [], requests = [], scripts = [], redirects = [], writes = [];
  const cached = JSON.stringify({clientVersionUpload: current, channelName: '', version: 'current'});
  const storage = new Map([['clientVersion_prod', cached]]);
  const location = new URL(origin + '/games/start');
  location.replace = value => redirects.push(value);
  const jsx = () => null;
  const imports = {
    7876: {jsx, jsxs: jsx}, 4232: {useEffect: fn => effects.push(fn), Fragment: 'fragment'},
    9099: {useRouter: () => ({isReady: false, query: {}})}, 5873: {uW: 'query'},
    2781: {Vc: 'redirect', fO: {SIGNED_OUT: 'signed_out'}},
    5364: {env: {NEXT_PUBLIC_SENTRY_UPLOAD_PERCENTAGE: '0'}}, 7418: {l: 'metric'},
    7657: {_: class {sendEvent() {}}}, 525: {e: 'visit'},
    6845: {w: () => ({})}, 5852: {Z: () => ({})}, 9792: {dQ: {}}, 7426: {$: {}}, 3934: {zO: {}}
  };
  const context = vm.createContext({URLSearchParams, location,
    document: {getElementById: () => ({classList: {remove() {}}}), createElement: () => ({}), body: {appendChild: script => scripts.push(script)}},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem(key, value) {writes.push(key); storage.set(key, value);}},
    fetch: async (url, init) => {requests.push({url, init}); return new Response(null, {status});}
  });
  context.window = context; context.self = context;
  vm.runInContext(source, context);
  const factories = context.webpackChunk_N_E[0][1], modules = new Map();
  const require = id => {
    if (imports[id]) return imports[id];
    if (modules.has(id)) return modules.get(id).exports;
    assert.ok(factories[id], 'Expected fixture module ' + id);
    const module = {exports: {}};
    modules.set(id, module);
    factories[id](module, module.exports, require);
    return module.exports;
  };
  require.r = () => {};
  require.d = (exports, getters) => Object.defineProperties(exports, Object.fromEntries(Object.entries(getters).map(([key, get]) => [key, {get}])));
  require(entry).default(); effects[1]();
  await tick();
  return {storage, cached, writes, requests, scripts, redirects, context};
}

test('actual old and current play chunks preserve the engine cache and all authentication outcomes', async () => {
  for (const fixture of shellFixtures) {
    const original = await replayShell(fixture.source, {entry: fixture.entry});
    assert.equal(JSON.parse(original.storage.get('clientVersion_prod')).clientVersionUpload, stale);
    const transformed = transformEngineLoader(fixture.source, fixture.path);
    for (const status of [200, 401, 403]) {
      const signedOut = status !== 200;
      const result = await replayShell(transformed, {entry: fixture.entry, status});
      assert.equal(result.storage.get('clientVersion_prod'), result.cached);
      assert.equal(result.writes.length, 0);
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0].url, 'https://users.roblox.com/v1/users/authenticated');
      assert.equal(result.requests[0].init.credentials, 'include');
      assert.equal(result.scripts.length, signedOut ? 0 : 1);
      assert.equal(result.redirects.length, signedOut ? 1 : 0);
      if (signedOut) assert.ok(result.redirects[0].startsWith('https://www.roblox.com/login?returnUrl='));
      else assert.equal(result.scripts[0].src, fixture.build + '/assets/webclient/WasmLoader.js');
    }
  }
});

test('current public play chunk survives the complete asset gateway with only the verified seed removed', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({url, init});
    return new Response(currentShell, {headers: {'content-type': 'text/javascript'}});
  };
  try {
    const response = await worker.fetch(new Request(origin + currentShellPath));
    assert.equal(response.status, 200);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.spf50krem.com' + currentShellPath);
    const output = await response.text();
    const seed = 'let n="version-f4a4dba57f874ad0";n&&localStorage.setItem("clientVersion_".concat(e),JSON.stringify({clientVersionUpload:n,version:"",channelName:"",cachedAt:Date.now()})),';
    assert.equal(output, currentShell.replace(seed, ''), 'Authentication and every other statement stay byte-for-byte unchanged');
    assert.doesNotThrow(() => new vm.Script(output));
  } finally {
    global.fetch = originalFetch;
  }
});

test('play-page cleanup accepts an auth helper rename but rejects changed credentials, auth decisions, or seed shape', async () => {
  const renamed = currentShell.replaceAll('function V()', 'function $check2()').replaceAll('V().then(', '$check2().then(');
  const transformed = transformEngineLoader(renamed, currentShellPath);
  const result = await replayShell(transformed, {entry: 8051, status: 403});
  assert.equal(result.requests[0].init.credentials, 'include');
  assert.equal(result.scripts.length, 0);
  assert.equal(result.redirects.length, 1);
  for (const changed of [
    currentShell.replace('V().then(', 'unknown().then('),
    currentShell.replaceAll('credentials:"include"', 'credentials:"omit"'),
    currentShell.replace('return 401===e.status||403===e.status', 'return!1'),
    currentShell.replace('return 401===e.status||403===e.status', 'return 401===e.status'),
    currentShell.replace('channelName:"",cachedAt:', 'channelName:"new",cachedAt:'),
    currentShell + currentShell
  ]) assert.throws(() => transformEngineLoader(changed, currentShellPath), /engine seed changed/);
});

test('transforms only exact public asset routes and rejects changed seed or loader contracts', () => {
  assert.equal(transformEngineLoader(loader, '/other/WasmLoader.js'), loader);
  assert.equal(transformEngineLoader(shell, '/other/chunk.js'), shell);
  assert.throws(() => transformEngineLoader(loader.replace('const cached = getCachedClientVersion(server);', 'const cached = otherCache(server);'), loaderPath), /version resolution changed/);
  assert.throws(() => transformEngineLoader(shell.replace('channelName:"",cachedAt:', 'channelName:"new",cachedAt:'), shellPath), /engine seed changed/);
  assert.doesNotThrow(() => new vm.Script(transformEngineLoader(loader, '/assets/webclient/WasmLoader.js')));
});
