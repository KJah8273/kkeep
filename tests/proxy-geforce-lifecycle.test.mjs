import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const origin = 'https://kkeep.test';
const prefix = '/gfn/browse/launcher/';
const frame = origin + prefix + 'frame/';
const epic = frame + encodeURIComponent('https://www.epicgames.com/id/login');
const moduleUrl = frame + encodeURIComponent('https://static-assets-prod.unrealengine.com/account-portal/static/assets/login.js') + '?$module=module';
const source = readFileSync(new URL('../public/gfn/engine/controller.sw.js', import.meta.url), 'utf8');

function worker({ expireFast = false, onWake = () => {} } = {}) {
  const events = new Map(), timers = new Set(), calls = [], wakes = [], waits = [], errors = [];
  const timeout = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, expireFast && ms === 8000 ? 25 : ms);
    timers.add(id); return id;
  };
  const client = { url: origin + '/gfn/index.html', postMessage(message) { wakes.push(message); onWake(message); } };
  const context = vm.createContext({
    URL, Request, Response, ReadableStream, MessageChannel, MessagePort, ArrayBuffer, Uint8Array,
    location: new URL(origin + '/gfn/proxy-sw.js?v=2'),
    console: { log() {}, error(...values) { errors.push(values); } },
    clients: { matchAll: async () => [client], get: async () => ({ url: epic }) },
    addEventListener(name, fn) { const listeners = events.get(name) || []; listeners.push(fn); events.set(name, listeners); },
    setTimeout: timeout, clearTimeout(id) { timers.delete(id); clearTimeout(id); }, skipWaiting() {},
  });
  context.self = context;
  vm.runInContext(source, context);
  const message = (data, ports = []) => {
    for (const fn of events.get('message') || []) fn({ data, ports, waitUntil: p => waits.push(p) });
  };
  const register = (id = 'launcher', respond = args => ({ body: 'module loaded', status: 200, statusText: 'OK', headers: [['Content-Type', 'text/javascript']] })) => {
    const port = { postMessage(data) {
      const packet = data['tabchannel-' + id];
      if (!packet || packet.$type !== 'request') return;
      calls.push({ id, method: packet.$method, args: packet.$args });
      Promise.resolve().then(async () => {
        const result = packet.$method === 'request' ? await respond(packet.$args) : undefined;
        port.onmessage({ data: { ['tabchannel-' + id]: { $type: 'response', $token: packet.$token, $data: result } } });
      });
    } };
    message({ $controller$init: { id, prefix: '/gfn/browse/' + id + '/' } }, [port]);
  };
  const route = (url = moduleUrl, init = {}) => {
    const request = new Request(url, init);
    return context.$scramjetController.route({ request, clientId: 'popup', resultingClientId: '' });
  };
  return { context, calls, errors, waits, wakes, register, route, message,
    claims: url => context.$scramjetController.shouldRoute({ request: new Request(url) }),
    close() { for (const timer of timers) clearTimeout(timer); },
  };
}

test('cold GeForce worker claims only its own proxy routes before its launcher reconnects', () => {
  const h = worker();
  try {
    assert.equal(h.claims(moduleUrl), true);
    assert.equal(h.claims(epic), true);
    for (const url of [origin + '/browse/launcher/frame/url', origin + '/api/relay', origin + '/gfn/index.html', 'https://elsewhere.test' + prefix + 'frame/url']) assert.equal(h.claims(url), false);
  } finally { h.close(); }
});

test('Epic modules wait for a restarted controller and concurrent requests are dispatched once', async () => {
  const h = worker();
  try {
    const requests = [h.route(), h.route(epic), h.route(moduleUrl + '&variant=2')];
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 0, 'No requests may escape to the hosting server');
    assert.equal(h.wakes.length, 1);
    assert.deepEqual(Array.from(h.wakes[0].$controller$swrevive.registered), []);
    h.register();
    const responses = await Promise.all(requests);
    assert.deepEqual(responses.map(r => r.status), [200, 200, 200]);
    assert.equal(await responses[0].text(), 'module loaded');
    assert.equal(h.calls.filter(c => c.method === 'request').length, 3);
    assert.equal(h.errors.length, 0);
  } finally { h.close(); }
});

test('an early Epic popup transport is held alive until the controller can receive its port', async () => {
  const h = worker();
  const port = { close() { assert.fail('The live popup transport was closed'); } };
  try {
    h.message({ $sw$initRemoteTransport: { prefix: frame, port } });
    assert.equal(h.waits.length, 1, 'The message event must keep the worker alive');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 0);
    h.register();
    await Promise.all(h.waits);
    const connects = h.calls.filter(c => c.method === 'initRemoteTransport');
    assert.equal(connects.length, 1);
    assert.equal(connects[0].args, port);
    assert.equal(h.errors.length, 0);
  } finally { h.close(); }
});

test('reconnect preserves an OAuth POST body and never replays it', async () => {
  const h = worker(); let received;
  try {
    const body = 'code=example-code&state=example-state';
    const response = h.route(epic, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    h.register('launcher', async args => {
      received = { method: args.method, body: await new Response(args.body).text(), url: args.rawUrl };
      return { status: 303, statusText: 'See Other', headers: [['Location', 'https://kkeep.test/gfn/browse/launcher/frame/return']], body: null };
    });
    assert.equal((await response).status, 303);
    assert.deepEqual(received, { method: 'POST', body, url: epic });
    assert.equal(h.calls.filter(c => c.method === 'request').length, 1);
  } finally { h.close(); }
});

test('different GeForce launchers cannot receive each other’s queued requests', async () => {
  const h = worker();
  try {
    let completed = false;
    const response = h.route().then(r => { completed = true; return r; });
    h.register('other-launcher');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    assert.equal(h.calls.filter(c => c.method === 'request').length, 0);
    h.register();
    assert.equal((await response).status, 200);
    assert.equal(h.calls.find(c => c.method === 'request').id, 'launcher');
  } finally { h.close(); }
});

test('orphaned sessions time out cleanly instead of hanging or fetching an original site', async () => {
  const h = worker({ expireFast: true }); let closed = 0;
  try {
    const response = h.route();
    h.message({ $sw$initRemoteTransport: { prefix: frame, port: { close() { closed++; } } } });
    const result = await response;
    await Promise.all(h.waits);
    assert.equal(result.status, 410);
    assert.equal(result.headers.get('X-Kkeep-Session'), 'expired');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(closed, 1);
    assert.equal(h.calls.length, 0);
  } finally { h.close(); }
});

test('an aborted sign-in request is not submitted after the launcher reconnects', async () => {
  const h = worker(); const cancel = new AbortController();
  try {
    const response = h.route(epic, { method: 'POST', body: 'cancelled', signal: cancel.signal });
    cancel.abort(); h.register();
    assert.equal((await response).status, 500);
    assert.equal(h.calls.filter(c => c.method === 'request').length, 0);
  } finally { h.close(); }
});

test('the actual GeForce API repairs a missing controller inside the old guard without replacing live ports', () => {
  const api = readFileSync(new URL('../public/gfn/engine/controller.api.js', import.meta.url), 'utf8');
  const start = api.indexOf('if(e.data.$controller$swrevive){');
  const end = api.indexOf('}})}setupMessagePort()', start);
  assert.ok(start > 0 && end > start);
  const onRevive = vm.runInNewContext('(function(e){' + api.slice(start, end + 1) + '})');
  let reconnects = 0;
  const controller = { id: 'launcher', guardServiceWorkerRevive: true, setupMessagePort() { reconnects++; } };
  onRevive.call(controller, { data: { $controller$swrevive: { registered: [] } } });
  assert.equal(reconnects, 1);
  onRevive.call(controller, { data: { $controller$swrevive: { registered: ['launcher'] } } });
  assert.equal(reconnects, 1);
  onRevive.call(controller, { data: { $controller$swrevive: {} } });
  assert.equal(reconnects, 1, 'Older workers retain their startup guard');
  controller.guardServiceWorkerRevive = false;
  onRevive.call(controller, { data: { $controller$swrevive: {} } });
  assert.equal(reconnects, 2);
});
