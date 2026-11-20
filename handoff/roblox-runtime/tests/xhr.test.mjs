import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MessageChannel} from 'node:worker_threads';
import {sessionClient, sessionWorker} from '../worker/session.js';

const origin = 'https://runtime.example';
const join = origin + '/_/' + btoa('gamejoin.roblox.com').replace(/=+$/, '') + '/v1/join-game';
const globals = {URL, Request, Response, Headers, MessageChannel, DOMException, AbortController,
  Event, TextDecoder, Blob, atob, setTimeout, clearTimeout};
const tick = () => new Promise(resolve => setTimeout(resolve, 8));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; }

function setup(handler = () => Response.json({joined:true}, {headers:{'x-result':'ok', 'set-cookie':'private=hidden'}})) {
  const calls = [], native = [], listeners = {};
  class NativeXHR extends EventTarget {
    static UNSENT = 0; static OPENED = 1; static HEADERS_RECEIVED = 2; static LOADING = 3; static DONE = 4;
    constructor() {
      super(); this._state = 0; this._type = ''; this._timeout = 0; this._status = 0;
      this._statusText = ''; this._url = ''; this._response = null; this._sent = false;
      this.withCredentials = false;
    }
    dispatchEvent(event) { const value = super.dispatchEvent(event); this['on' + event.type]?.call(this, event); return value; }
    open(method, url, async = true, username, password) {
      const changed = this._state !== 1;
      this._state = 1; this._method = method; this._url = String(url); this._async = async;
      this._username = username; this._password = password; this._sent = false; this._headers = new Headers();
      if (changed) this.dispatchEvent(new Event('readystatechange'));
    }
    send(body) {
      this._sent = true; native.push({method:this._method, url:this._url, async:this._async, body, headers:[...this._headers]});
      this._state = 4; this._status = 206; this._statusText = 'Partial Content';
      this._response = this._type === 'arraybuffer' ? new Uint8Array([1,2,3]).buffer : 'native asset';
      this.dispatchEvent(new Event('readystatechange'));
      this.dispatchEvent(new Event('load'));
      this.dispatchEvent(new Event('loadend'));
    }
    abort() { if(this._state!==1||this._sent)this._state = 0; this._sent = false; }
    setRequestHeader(name, value) {
      if (this._state !== 1 || this._sent) throw new DOMException('not opened', 'InvalidStateError');
      this._headers.append(name, value);
    }
    overrideMimeType(value) { this._mime = value; }
    getResponseHeader(name) { return name.toLowerCase() === 'x-native' ? 'yes' : null; }
    getAllResponseHeaders() { return 'x-native: yes\r\n'; }
    get readyState() { return this._state; }
    get status() { return this._status; }
    get statusText() { return this._statusText; }
    get responseURL() { return this._url; }
    get response() { return this._response; }
    get responseText() { return this._response || ''; }
    get responseXML() { return 'native xml'; }
    get responseType() { return this._type; }
    set responseType(value) { if (['','text','json','arraybuffer','blob','document'].includes(value)) this._type = value; }
    get timeout() { return this._timeout; }
    set timeout(value) { this._timeout = Number(value) >>> 0; }
  }
  const sw = {location:{origin}, clients:{claim:async () => {}}, addEventListener:(type, fn) => { listeners[type] = fn; }};
  const viaJar = async (request, host, path) => {
    const body = new Uint8Array(await request.arrayBuffer());
    calls.push({host, path, method:request.method, headers:[...request.headers], body});
    return handler(request, calls.length);
  };
  vm.runInNewContext('(' + sessionWorker.toString() + ')(self,viaJar,rbxApi)', {
    ...globals, self:sw, viaJar, rbxApi:async () => Response.json({loggedIn:true})
  });
  const active = {postMessage:(data,ports) => listeners.message({data,ports,
    source:{url:origin + '/_/cGxheS5yb2Jsb3guY29t/games/start'}, waitUntil:p => p.catch(() => {})})};
  const page = {document:{}, navigator:{serviceWorker:{register:async () => ({active})}},
    XMLHttpRequest:NativeXHR, fetch:async () => { throw new Error('Unexpected asset fetch'); }};
  vm.runInNewContext('(' + sessionClient.toString() + ')(scope,origin)', {...globals, scope:page, origin});
  return {page, calls, native, NativeXHR, xhr:() => new page.XMLHttpRequest()};
}
function completed(xhr) { return new Promise(resolve => xhr.addEventListener('loadend', resolve, {once:true})); }

test('uncontrolled async XHR preserves request bytes, headers and native response event order through one session RPC', async () => {
  const h = setup(() => new Response(new Uint8Array([0,255,128,65]), {status:201, statusText:'Created', headers:{'x-result':'ok'}}));
  const xhr = h.xhr(), states = [], events = [];
  xhr.onreadystatechange = () => states.push({state:xhr.readyState, status:xhr.status, url:xhr.responseURL, response:xhr.response});
  for (const event of ['loadstart','progress','load','error','loadend']) xhr.addEventListener(event, e => events.push([e.type,e.loaded,e.total]));
  xhr.open('POST', join); xhr.responseType = 'arraybuffer'; xhr.setRequestHeader('Content-Type','application/json');
  xhr.setRequestHeader('X-Join-Test','one'); xhr.setRequestHeader('X-Join-Test','two');
  xhr.setRequestHeader('Cookie','must-not-leave'); xhr.setRequestHeader('Sec-Fetch-Site','must-not-leave');
  const body = new TextEncoder().encode('{"placeId":123}'), expected = body.slice();
  const done = completed(xhr); xhr.send(body); body.fill(0); await done;
  assert.equal(h.native.length,0); assert.equal(h.calls.length,1); assert.deepEqual(h.calls[0].body,expected);
  assert.equal(h.calls[0].method,'POST'); assert.equal(h.calls[0].host,'gamejoin.roblox.com');
  const headers = new Headers(h.calls[0].headers);
  assert.equal(headers.get('x-join-test'),'one, two'); assert.equal(headers.get('cookie'),null); assert.equal(headers.get('sec-fetch-site'),null);
  assert.deepEqual(states.map(s => s.state),[1,2,3,4]);
  assert.equal(states[1].url,join); assert.equal(states[1].status,201); assert.equal(states[1].response,null); assert.equal(states[2].response,null);
  assert.deepEqual([...new Uint8Array(xhr.response)],[0,255,128,65]); assert.equal(xhr.statusText,'Created');
  assert.equal(xhr.getResponseHeader('x-result'),'ok');
  assert.deepEqual(events.map(e => e[0]),['loadstart','progress','load','loadend']); assert.deepEqual(events[1].slice(1),[4,4]);
  assert.throws(() => xhr.responseText,{name:'InvalidStateError'});
  assert.equal(h.page.XMLHttpRequest.DONE,4); assert.ok(xhr instanceof h.NativeXHR);
});

test('text, JSON and blob responses work and response headers omit session cookies', async () => {
  for (const type of ['', 'text', 'json', 'blob']) {
    const h = setup(), xhr = h.xhr(); xhr.open('GET',join); xhr.responseType = type;
    const done = completed(xhr); xhr.send('ignored GET body'); await done;
    assert.equal(h.calls[0].body.byteLength,0); assert.equal(xhr.getResponseHeader('set-cookie'),null);
    assert.match(xhr.getAllResponseHeaders(),/x-result: ok\r\n/);
    if (type === 'json') assert.equal(xhr.response.joined,true);
    else if (type === 'blob') assert.equal(await xhr.response.text(),'{"joined":true}');
    else assert.equal(xhr.responseText,'{"joined":true}');
  }
});

test('HTTP failure uses load with its real status and body and never replays the join', async () => {
  const h = setup(() => new Response('unavailable',{status:503,statusText:'Unavailable'})), xhr = h.xhr(), events=[];
  for (const type of ['load','error','timeout']) xhr.addEventListener(type, () => events.push(type));
  xhr.open('POST',join); const done=completed(xhr); xhr.send('{}'); await done;
  assert.equal(xhr.status,503); assert.equal(xhr.statusText,'Unavailable'); assert.equal(xhr.responseText,'unavailable');
  assert.deepEqual(events,['load']); assert.equal(h.calls.length,1); assert.equal(h.native.length,0);
});

test('captured session fetch survives provider fetch replacement', async () => {
  const h = setup(), xhr = h.xhr(); h.page.fetch = () => { throw new Error('Recursive provider wrapper'); };
  xhr.open('POST',join); const done=completed(xhr); xhr.send('{}'); await done;
  assert.equal(xhr.status,200); assert.equal(h.calls.length,1); assert.equal(h.native.length,0);
});

test('abort before dispatch sends nothing and emits one abort sequence before resetting UNSENT', async () => {
  const h = setup(), xhr = h.xhr(), events=[];
  for (const type of ['readystatechange','load','abort','error','loadend']) xhr.addEventListener(type, () => events.push([type,xhr.readyState]));
  xhr.open('POST',join); xhr.send('{}'); xhr.abort(); await tick();
  assert.equal(xhr.readyState,0); assert.equal(xhr.status,0); assert.equal(h.calls.length,0); assert.equal(h.native.length,0);
  assert.deepEqual(events,[['readystatechange',1],['readystatechange',4],['abort',4],['loadend',4]]);
});

test('abort and reuse suppress stale RPC completion without replaying either request', async () => {
  const first = deferred(), entered = deferred();
  const h = setup(async (_request,index) => { if (index===1) { entered.resolve(); return first.promise; } return new Response('second'); });
  const xhr=h.xhr(), outcomes=[]; xhr.onload=()=>outcomes.push(xhr.responseText); xhr.onerror=()=>outcomes.push('error');
  xhr.open('POST',join); xhr.send('first'); await entered.promise; xhr.abort();
  xhr.open('POST',join); const done=completed(xhr); xhr.send('second'); await done;
  first.resolve(new Response('stale')); await tick();
  assert.equal(xhr.responseText,'second'); assert.deepEqual(outcomes,['second']);
  assert.equal(h.calls.length,2); assert.equal(h.native.length,0);
});

test('timeout cancels local waiting once and ignores a late session response', async () => {
  const delayed=deferred(), h=setup(()=>delayed.promise), xhr=h.xhr(), events=[];
  for (const type of ['readystatechange','load','timeout','error','loadend']) xhr.addEventListener(type, () => events.push([type,xhr.readyState]));
  xhr.open('POST',join); xhr.timeout=20; const done=completed(xhr); xhr.send('{}'); await done;
  delayed.resolve(new Response('late')); await tick();
  assert.equal(xhr.readyState,4); assert.equal(xhr.status,0); assert.equal(xhr.responseURL,'');
  assert.deepEqual(events,[['readystatechange',1],['readystatechange',4],['timeout',4],['loadend',4]]);
  assert.equal(h.calls.length,1); assert.equal(h.native.length,0);
});

test('reentrant abort at HEADERS_RECEIVED prevents progress and successful completion', async () => {
  const h=setup(), xhr=h.xhr(), events=[];
  xhr.onreadystatechange=()=>{ if(xhr.readyState===2) xhr.abort(); };
  for(const type of ['progress','load','abort','loadend']) xhr.addEventListener(type,()=>events.push(type));
  xhr.open('POST',join); const done=completed(xhr); xhr.send('{}'); await done; await tick();
  assert.equal(xhr.readyState,0); assert.deepEqual(events,['abort','loadend']); assert.equal(h.calls.length,1);
});

test('reentrant open at DONE suppresses old completion events', async () => {
  const h=setup(), xhr=h.xhr(), events=[], reopened=deferred(); let once=false;
  xhr.onreadystatechange=()=>{ if(xhr.readyState===4&&!once){ once=true; xhr.open('POST',join); reopened.resolve(); } };
  for(const type of ['progress','load','loadend']) xhr.addEventListener(type,()=>events.push(type));
  xhr.open('POST',join); xhr.send('{}'); await reopened.promise; await tick();
  assert.equal(xhr.readyState,1); assert.deepEqual(events,['progress']); assert.equal(h.calls.length,1);
});

test('synchronous session requests fail explicitly with no native fallback', () => {
  const h=setup(), xhr=h.xhr(); xhr.open('POST',join,false);
  assert.throws(()=>xhr.send('{}'),{name:'NotSupportedError'});
  assert.equal(h.calls.length,0); assert.equal(h.native.length,0);
});

test('asset XHR stays native including synchronous mode, headers and binary response', async () => {
  const h=setup(), xhr=h.xhr(); xhr.open('POST',join); const first=completed(xhr); xhr.send('{}'); await first;
  const states=[]; xhr.onreadystatechange=()=>states.push(xhr.readyState);
  xhr.open('GET',origin+'/_/cdn/WebClient.wasm',false); xhr.responseType='arraybuffer'; xhr.setRequestHeader('Range','bytes=0-2');
  xhr.send(null);
  assert.equal(h.calls.length,1); assert.equal(h.native.length,1); assert.equal(h.native[0].async,false);
  assert.equal(xhr.status,206); assert.deepEqual([...new Uint8Array(xhr.response)],[1,2,3]);
  assert.equal(xhr.getResponseHeader('x-native'),'yes'); assert.equal(xhr.getAllResponseHeaders(),'x-native: yes\r\n');
  assert.deepEqual(states,[1,4]);
});

test('RPC body bounds remain enforced before a session request is sent', async () => {
  const h=setup(), xhr=h.xhr(), errors=[]; xhr.onerror=()=>errors.push(xhr.status);
  xhr.open('POST',join); const done=completed(xhr); xhr.send(new Uint8Array(2*1024*1024+1)); await done;
  assert.deepEqual(errors,[0]); assert.equal(h.calls.length,0); assert.equal(h.native.length,0);
});

test('network rejection is an error with status zero and no automatic fallback', async () => {
  const h=setup(()=>Promise.reject(new Error('private details must not escape'))), xhr=h.xhr(), errors=[];
  xhr.onerror=e=>errors.push([e.type,xhr.status,xhr.responseURL]);
  xhr.open('POST',join); const done=completed(xhr); xhr.send('{}'); await done;
  assert.deepEqual(errors,[['error',0,'']]); assert.equal(h.calls.length,1); assert.equal(h.native.length,0);
});
