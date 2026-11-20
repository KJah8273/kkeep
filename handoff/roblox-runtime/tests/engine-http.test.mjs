import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {sessionWorker} from '../worker/session.js';
import {transformText} from '../worker/gateway.js';
import publicGateway from '../worker/index.js';

// Replay the actual inspected engine's HTTP adapter, without running the rest
// of the game or making any network request. All bodies and memory are synthetic.
const engine = readFileSync(new URL('./fixtures/WebClient-1ef.js', import.meta.url), 'utf8');
const hook = readFileSync(new URL('./fixtures/hook.js', import.meta.url), 'utf8');
const start = engine.indexOf('function Ft(e,r,n,t,a){');
const end = engine.indexOf('var ye=', start);
assert.ok(start >= 0 && end > start, 'the inspected engine HTTP adapter must exist');
const engineHttp = engine.slice(start, end);
assert.ok(engineHttp.includes('M=new XMLHttpRequest'));
assert.ok(engineHttp.includes('M.send(un)'));

const origin = 'https://runtime.example';
const source = origin + '/_/cGxheS5yb2Jsb3guY29t/games/start';
const upstreamJoin = 'https://gamejoin.roblox.com/v1/join-game';
const encodedJoin = origin + '/_/' + btoa('gamejoin.roblox.com').replace(/=+$/, '') + '/v1/join-game';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const bindings = {
  URL, Request, Response, Headers, MessageChannel, DOMException, Event,
  EventTarget, AbortController, TextEncoder, TextDecoder, Uint8Array, Uint16Array,
  Uint32Array, ArrayBuffer, Blob, setTimeout, clearTimeout, atob, btoa,
};

function hookInstall(patched) {
  const text = patched ? transformText(hook, '/hook.js', origin) : hook;
  const begin = text.indexOf('function install(scope, origin) {');
  const finish = text.indexOf('\n\n  const reroute = install(', begin);
  assert.ok(begin >= 0 && finish > begin, 'provider worker-install contract changed');
  return '(' + text.slice(begin, finish).trim() + ')(globalThis, origin);';
}

function harness({patched = true, inWorker = false, status = 200, fail = false, payload} = {}) {
  const jarCalls = [], nativeCalls = [], messageCalls = [], retainedWork = [];
  const responseBody = payload ?? JSON.stringify(status === 200
    ? {status: 2, jobId: 'synthetic-game-server', joinScript: {test: true}}
    : {message: 'synthetic upstream failure'});
  const listeners = new Map();
  const sw = {
    location: {origin}, clients: {claim: async () => {}},
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const viaJar = async (request, host, path) => {
    jarCalls.push({host, path, method: request.method,
      body: await request.text(), headers: Object.fromEntries(request.headers)});
    if (fail) throw new TypeError('synthetic relay unavailable');
    return new Response(responseBody, {status, statusText: status === 200 ? 'OK' : 'Service Unavailable',
      headers: {'content-type': 'application/json', 'set-cookie': 'synthetic=must-not-escape'}});
  };
  vm.runInNewContext('(' + sessionWorker.toString() + ')(self, viaJar, rbxApi)', {
    ...bindings, self: sw, viaJar,
    rbxApi: () => { throw new Error('Engine join must use viaJar, not the menu API'); },
  });
  const active = {postMessage(data, ports) {
    messageCalls.push(data.op);
    listeners.get('message')({data, ports, source: {url: source},
      waitUntil(work) { retainedWork.push(work.catch(() => {})); }});
  }};

  function nativeClass() {
    // Property handlers are dispatched by native XHR; Node's EventTarget alone
    // does not implement those onload/onreadystatechange properties.
    return class NativeXHR extends EventTarget {
      constructor() {
        super(); this._state = 0; this._status = 0; this._statusText = '';
        this._response = null; this._url = ''; this._type = ''; this._timeout = 0;
        this.withCredentials = false; this.upload = new EventTarget();
        this.headers = new Headers();
      }
      dispatchEvent(event) {
        const result = super.dispatchEvent(event);
        this['on' + event.type]?.call(this, event);
        return result;
      }
      get readyState() { return this._state; }
      get status() { return this._status; }
      get statusText() { return this._statusText; }
      get response() { return this._response; }
      get responseText() { return this._response ? decoder.decode(this._response) : ''; }
      get responseXML() { return null; }
      get responseURL() { return this._url; }
      get responseType() { return this._type; }
      set responseType(value) { this._type = value; }
      get timeout() { return this._timeout; }
      set timeout(value) { this._timeout = value; }
      open(method, url, async = true) {
        this.method = method; this._url = String(url); this.async = async;
        this._state = 1; this.dispatchEvent(new Event('readystatechange'));
      }
      setRequestHeader(name, value) { this.headers.append(name, value); }
      overrideMimeType() {}
      getResponseHeader(name) { return this.responseHeaders?.get(name) ?? null; }
      getAllResponseHeaders() { return [...(this.responseHeaders ?? [])].map(([k,v]) => k + ': ' + v + '\r\n').join(''); }
      abort() { this.dispatchEvent(new Event('abort')); }
      send(body) {
        nativeCalls.push({method: this.method, url: this._url,
          body: body ? decoder.decode(body) : '', headers: Object.fromEntries(this.headers)});
        // Exercise the real gateway guard to reproduce the reported local404.
        const work = publicGateway.fetch(new Request(this._url, {
          method: this.method, headers: this.headers, body,
        }), {}, {}).then(async response => {
          this._status = response.status; this._statusText = response.statusText;
          this.responseHeaders = response.headers;
          this._state = 2; this.dispatchEvent(new Event('readystatechange'));
          this._response = await response.arrayBuffer();
          this._state = 3; this.dispatchEvent(new Event('readystatechange'));
          this._state = 4; this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load')); this.dispatchEvent(new Event('loadend'));
        });
        retainedWork.push(work);
      }
    };
  }
  class OwnedWorker extends EventTarget {}
  const page = vm.createContext({...bindings, origin,
    document: {}, navigator: {serviceWorker: {register: async () => ({active})}},
    XMLHttpRequest: nativeClass(), Worker: OwnedWorker,
    fetch: async () => { throw new Error('Unexpected native fetch'); },
  });
  vm.runInContext(hookInstall(patched), page);
  let context = page;
  if (inWorker) {
    const owned = new page.Worker('synthetic-worker.js');
    context = vm.createContext({...bindings, origin, navigator: {},
      XMLHttpRequest: nativeClass(), fetch: async () => { throw new Error('Unexpected worker fetch'); },
      postMessage(data, ports) {
        const event = new Event('message');
        Object.defineProperties(event, {data: {value: data}, ports: {value: ports}});
        owned.dispatchEvent(event);
      },
    });
    vm.runInContext(hookInstall(patched), context);
  }
  return {context, page, jarCalls, nativeCalls, messageCalls, responseBody, retainedWork};
}

async function runEngine(h, {body = JSON.stringify({placeId: 123, gameId: 'synthetic-choice'}), url = upstreamJoin, method = 'POST'} = {}) {
  const memory = new ArrayBuffer(65536), W = new Uint8Array(memory);
  const m = new Uint32Array(memory), ne = new Uint16Array(memory);
  let cursor = 2048;
  const allocate = size => { const pointer = cursor; cursor = (cursor + size + 3) & ~3; assert.ok(cursor < W.length); return pointer; };
  const putString = text => { const bytes = encoder.encode(text); const pointer = allocate(bytes.length + 1); W.set(bytes, pointer); return pointer; };
  const T = pointer => { let finish = pointer; while (W[finish]) finish++; return decoder.decode(W.subarray(pointer, finish)); };
  const P = (text, pointer, limit) => { const bytes = encoder.encode(text).subarray(0, limit - 1); W.set(bytes, pointer); W[pointer + bytes.length] = 0; };
  const e = 256, s = e + 108, xhrs = new Map();
  m[(e + 8) >>> 2] = putString(url);
  P(method, s, 32);
  m[(s + 52) >>> 2] = 1; // EMSCRIPTEN_FETCH_LOAD_TO_MEMORY; asynchronous.
  m[(s + 56) >>> 2] = 1000;
  W[s + 60] = 1;
  const headerPairs = allocate(24);
  m[headerPairs >>> 2] = putString('Content-Type');
  m[(headerPairs + 4) >>> 2] = putString('application/json');
  m[(headerPairs + 8) >>> 2] = putString('X-Synthetic-Test');
  m[(headerPairs + 12) >>> 2] = putString('engine-http');
  m[(s + 76) >>> 2] = headerPairs;
  const payload = encoder.encode(body), payloadPointer = allocate(payload.length);
  W.set(payload, payloadPointer);
  m[(s + 84) >>> 2] = payloadPointer; m[(s + 88) >>> 2] = payload.length;
  Object.assign(h.context, {m, ne, W, T, P,
    ae: {xhrs: {allocate(xhr) { const id = xhrs.size + 1; xhrs.set(id, xhr); return id; }, has: id => xhrs.has(id)}},
    Vr: (_old, size) => allocate(size), be: putString, _e: () => {},
    ye: (pointer, value) => { m[pointer >>> 2] = value; m[(pointer + 4) >>> 2] = Math.floor(value / 4294967296); },
  });
  vm.runInContext(engineHttp, h.context);
  const callbacks = [], states = [];
  let deadline;
  await new Promise((resolve, reject) => {
    deadline = setTimeout(() => reject(new Error('Actual engine HTTP adapter did not finish')), 2000);
    const finish = kind => { callbacks.push(kind); clearTimeout(deadline); resolve(); };
    h.context.Ft(e, () => finish('success'), () => finish('error'),
      () => callbacks.push('progress'), () => states.push(ne[(e + 40) >>> 1]));
  }).finally(() => clearTimeout(deadline));
  await Promise.all(h.retainedWork);
  const responsePointer = m[(e + 12) >>> 2], responseLength = m[(e + 16) >>> 2];
  return {body, callbacks, states, status: ne[(e + 42) >>> 1],
    readyState: ne[(e + 40) >>> 1], responseLength,
    response: decoder.decode(W.subarray(responsePointer, responsePointer + responseLength)),
    responseURL: m[(e + 200) >>> 2] ? T(m[(e + 200) >>> 2]) : '',
  };
}

test('actual engine XHR reproduces join404 at the public gateway without the session bridge', async () => {
  const h = harness({patched: false}), result = await runEngine(h);
  assert.equal(result.status, 404); assert.equal(result.response, 'Not found');
  assert.deepEqual(result.callbacks, ['error']);
  assert.equal(h.jarCalls.length, 0); assert.equal(h.nativeCalls.length, 1);
  assert.equal(h.nativeCalls[0].url, encodedJoin);
  assert.equal(h.nativeCalls[0].method, 'POST'); assert.equal(h.nativeCalls[0].body, result.body);
});

for (const inWorker of [false, true]) test('actual engine XHR joins once through the browser jar from ' + (inWorker ? 'an owned engine worker' : 'an uncontrolled page'), async () => {
  const h = harness({inWorker}), result = await runEngine(h);
  assert.equal(h.page.navigator.serviceWorker.controller, undefined);
  assert.equal(h.nativeCalls.length, 0); assert.equal(h.jarCalls.length, 1);
  assert.equal(h.messageCalls.filter(op => op === 'fetch').length, 1);
  assert.deepEqual(h.jarCalls[0], {host: 'gamejoin.roblox.com', path: '/v1/join-game',
    method: 'POST', body: result.body,
    headers: {'content-type': 'application/json', 'x-synthetic-test': 'engine-http'}});
  assert.equal(result.status, 200); assert.equal(result.readyState, 4);
  assert.equal(result.response, h.responseBody);
  assert.equal(result.responseLength, encoder.encode(h.responseBody).length);
  assert.equal(result.responseURL, encodedJoin);
  assert.equal(result.callbacks.filter(value => value === 'success').length, 1);
  assert.equal(result.callbacks.includes('error'), false);
  assert.ok(result.states.includes(2)); assert.ok(result.states.includes(4));
});

test('actual engine preserves upstream HTTP failure and body without replaying the join', async () => {
  const h = harness({status: 503, inWorker: true}), result = await runEngine(h);
  assert.equal(result.status, 503); assert.equal(result.response, h.responseBody);
  assert.equal(result.callbacks.filter(value => value === 'error').length, 1);
  assert.equal(result.callbacks.includes('success'), false);
  assert.equal(h.jarCalls.length, 1); assert.equal(h.nativeCalls.length, 0);
});

test('actual engine reports a session transport rejection as an error and never falls back or retries', async () => {
  const h = harness({fail: true, inWorker: true}), result = await runEngine(h);
  assert.equal(result.status, 0); assert.equal(result.responseLength, 0);
  assert.equal(result.callbacks.filter(value => value === 'error').length, 1);
  assert.equal(result.callbacks.includes('success'), false);
  assert.equal(h.jarCalls.length, 1); assert.equal(h.nativeCalls.length, 0);
});

test('actual engine content batches reproduce unbridged worker404 and use one browser-local request after routing', async () => {
  for (const [host, path] of [
    ['assetdelivery.roblox.com', '/v3/assets/batch'],
    ['thumbnails.roblox.com', '/v1/batch'],
    ['users.roblox.com', '/v1/users']
  ]) {
    const url = 'https://' + host + path, body = '{"synthetic":"content-read"}';
    const before = harness({patched: false, inWorker: true});
    const failed = await runEngine(before, {url, body});
    assert.equal(failed.status, 404); assert.equal(failed.response, 'Not found');
    assert.equal(before.jarCalls.length, 0); assert.equal(before.nativeCalls.length, 1);

    const payload = '{"data":[{"synthetic":"preserved-content"}]}';
    const after = harness({inWorker: true, payload});
    const result = await runEngine(after, {url, body});
    assert.equal(after.nativeCalls.length, 0); assert.equal(after.jarCalls.length, 1);
    assert.equal(after.messageCalls.filter(op => op === 'fetch').length, 1);
    assert.deepEqual(after.jarCalls[0], {host, path, method: 'POST', body,
      headers: {'content-type': 'application/json', 'x-synthetic-test': 'engine-http'}});
    assert.equal(result.status, 200); assert.equal(result.response, payload);
    assert.equal(result.responseLength, encoder.encode(payload).length);
    assert.equal(result.responseURL, origin + '/_/' + btoa(host).replace(/=+$/, '') + path);
    assert.equal(result.callbacks.filter(value => value === 'success').length, 1);
    assert.equal(result.callbacks.includes('error'), false);
  }
});

test('actual engine content routing preserves server failure and never sends wrong methods or unrelated paths through the jar', async () => {
  const url = 'https://assetdelivery.roblox.com/v3/assets/batch';
  const unavailable = harness({inWorker: true, status: 503});
  const failure = await runEngine(unavailable, {url});
  assert.equal(failure.status, 503); assert.equal(failure.response, unavailable.responseBody);
  assert.equal(unavailable.jarCalls.length, 1); assert.equal(unavailable.nativeCalls.length, 0);
  for (const options of [
    {url, method: 'PUT'},
    {url: url + '/other'},
    {url: 'https://users.roblox.com/v1/users/123/delete'}
  ]) {
    const h = harness({inWorker: true}), result = await runEngine(h, options);
    assert.equal(result.status, 404);
    assert.equal(h.jarCalls.length, 0); assert.equal(h.nativeCalls.length, 1);
    assert.equal(h.messageCalls.filter(op => op === 'fetch').length, 0);
  }
});
