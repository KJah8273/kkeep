// RPC stays inside this origin's browser session. Never send account requests to
// the public asset gateway, and never replay a join after an ambiguous failure.
export function sessionClient(scope, origin) {
  if (scope.__kkeepSessionClient) return;
  scope.__kkeepSessionClient = true;
  const KEY = 'kkeep:jar:v4';
  const VERSION = 'join19';
  const nativeFetch = scope.fetch.bind(scope);
  const limit = 2 * 1024 * 1024;
  // These inspected POST endpoints read JSON needed while the game joins.
  // Owned engine workers cannot rely on native fetch interception on Safari.
  // Keep binary delivery and unrelated account routes outside this bridge.
  const readPosts = {
    'assetdelivery.roblox.com':'/v3/assets/batch',
    'thumbnails.roblox.com':'/v1/batch',
    'users.roblox.com':'/v1/users'
  };
  let ready;
  // A worker upgrade replaces the message recipient. Keep in-flight requests
  // single-shot, but prepare the new worker for subsequent calls.
  scope.navigator?.serviceWorker?.addEventListener?.('controllerchange', () => { ready = null; });
  function target(raw, method) {
    try {
      const u = new URL(raw, origin);
      if (u.origin !== origin) return false;
      if (u.pathname.startsWith('/_rbx/api/')) return true;
      const m = /^\/_\/([A-Za-z0-9_-]+)(\/.*)$/.exec(u.pathname);
      if (!m) return false;
      const host = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
      return /^(gamejoin|apis|economy)\.roblox\.com$/.test(host) ||
        String(method).toUpperCase() === 'POST' && readPosts[host] === m[2];
    } catch { return false; }
  }
  function exchange(worker, data, timeout = 45000, signal) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const finish = (error, result) => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        channel.port1.close(); channel.port2.close();
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new DOMException('Request cancelled', 'AbortError'));
      const timer = setTimeout(() => finish(new TypeError('session-timeout')), timeout);
      channel.port1.onmessage = e => e.data?.error ? finish(new TypeError(['client-origin','client-path'].includes(e.data.error)?e.data.error:'session-request')) : finish(null, e.data);
      channel.port1.onmessageerror = () => finish(new TypeError('Browser session response failed'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, {once:true});
      try { worker.postMessage({key:KEY, ...data}, [channel.port2]); }
      catch (error) { finish(error); }
    });
  }
  function session() {
    if (!ready) ready = (async () => {
      const sw = scope.navigator?.serviceWorker;
      if (!sw) throw new TypeError('Service worker unavailable');
      let registerTimer;
      const registration = await Promise.race([
        // Keep one script URL across compatible builds. Otherwise an older
        // open tab and a new tab can repeatedly replace each other's worker.
        sw.register('/_jar/sw.js?kk=join18', {scope:'/', updateViaCache:'none'}),
        new Promise((_, reject) => { registerTimer = setTimeout(() => reject(new TypeError('Session setup timed out')), 15000); })
      ]).finally(() => clearTimeout(registerTimer));
      return await new Promise((resolve, reject) => {
        const started = Date.now(); let reason = 'session-inactive', updateRequested = false;
        const check = async () => {
          try {
            const active = registration.active;
            if (active && (!active.state || active.state === 'activated')) {
              const pong = await exchange(active, {op:'ping'}, 1200);
              if (pong.revision === VERSION) return resolve(active);
              reason = 'session-version';
              // register() may return an unchanged registration without
              // checking its script. With a stable URL an older compatible
              // worker therefore needs one explicit update request. Keep the
              // bounded activation deadline: a failed/hung update cannot stall startup
              // or allow any account request through the obsolete worker.
              if (!updateRequested && typeof registration.update === 'function') {
                updateRequested = true;
                Promise.resolve().then(() => registration.update()).catch(() => {});
              }
            }
          } catch (error) { reason = error.message; }
          // An explicit update must download and activate the newer script.
          // Give that confirmed revision transition a bounded grace period;
          // ordinary inactive/missing-worker failures keep the short deadline.
          if (Date.now() - started > (updateRequested ? 45000 : 15000)) return reject(new TypeError('Browser session is not ready (' + reason + ')'));
          setTimeout(check, 100);
        };
        check();
      });
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  // The menu's API bridge can use an active worker before this document is
  // controlled. Scramjet sign-in additionally needs fetch interception. Never
  // use serviceWorker.ready/reload loops: ready can wait forever in an embed.
  if (scope.document) scope.__kkeepSessionReady = async (controlled = false) => {
    const active = await session();
    if (!controlled) return active;
    const sw = scope.navigator.serviceWorker;
    await exchange(active, {op:'claim'}, 5000);
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const controller = sw.controller;
      if (controller) {
        try {
          const pong = await exchange(controller, {op:'ping'}, 1200);
          if (pong.revision === VERSION) return controller;
        } catch { /* A controller can be replaced while activation finishes. */ }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new TypeError('Browser session could not control this page');
  };
  async function dispatch(data, port) {
    try {
      if (scope.document) (await session()).postMessage(data, [port]);
      else scope.postMessage(data, [port]);
    } catch { port.postMessage({error:true}); port.close(); }
  }
  // Listen only on workers that this page/worker created, never window messages
  // from another iframe. Nested engine workers forward through their owner.
  const Worker = scope.Worker;
  if (typeof Worker === 'function') scope.Worker = class extends Worker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        if (event.data?.key !== KEY || !event.ports[0]) return;
        event.stopImmediatePropagation();
        dispatch(event.data, event.ports[0]);
      });
    }
  };
  scope.fetch = async function(input, init) {
    const raw = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (!target(raw, method)) return nativeFetch(input, init);
    const req = new Request(input instanceof Request ? input : new URL(raw, origin), init);
    if (req.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
    const body = ['GET','HEAD'].includes(req.method) ? null : await req.arrayBuffer();
    if (body?.byteLength > limit) throw new TypeError('Session request too large');
    const data = {op:'fetch', url:req.url, method:req.method, headers:[...req.headers], body};
    const worker = scope.document ? await session() : {postMessage:(value, ports) => scope.postMessage(value, ports)};
    const result = await exchange(worker, data, 45000, req.signal);
    const response = new Response(result.body, {status:result.status, statusText:result.statusText, headers:result.headers});
    Object.defineProperty(response, 'url', {value:req.url});
    return response;
  };
  // Emscripten uses XMLHttpRequest for its game HTTP requests. A Safari game
  // frame (or an engine worker) may not be controlled by the jar service worker,
  // so the URL rewrite alone cannot deliver those requests to the session.
  // Keep asset XHR native and send only the same API targets through this RPC.
  const NativeXHR = scope.XMLHttpRequest;
  if (typeof NativeXHR === 'function') {
    const sessionFetch = scope.fetch;
    const states = new WeakMap();
    const EventClass = scope.Event || Event;
    const ProgressClass = scope.ProgressEvent || (typeof ProgressEvent === 'function' ? ProgressEvent : null);
    const emit = (xhr, type, progress) => {
      const event = progress && ProgressClass ? new ProgressClass(type, progress) : new EventClass(type);
      if (progress && !ProgressClass) for (const [key, value] of Object.entries(progress)) Object.defineProperty(event, key, {value});
      xhr.dispatchEvent(event);
    };
    const current = (xhr, state, generation) => states.get(xhr) === state && state.generation === generation;
    const cancel = state => {
      clearTimeout(state.timer);
      state.timer = null;
      state.controller?.abort();
      state.controller = null;
    };
    const resetResponse = state => {
      state.status = 0; state.statusText = ''; state.responseURL = '';
      state.responseHeaders = null; state.bytes = null; state.text = ''; state.response = null;
    };
    const fail = (xhr, state, generation, type) => {
      if (!current(xhr, state, generation) || !state.sent) return;
      state.sent = false;
      cancel(state);
      resetResponse(state);
      state.readyState = 4;
      emit(xhr, 'readystatechange');
      if (!current(xhr, state, generation)) return;
      emit(xhr, type, {lengthComputable:false, loaded:0, total:0});
      if (!current(xhr, state, generation)) return;
      emit(xhr, 'loadend', {lengthComputable:false, loaded:0, total:0});
      if (type === 'abort' && current(xhr, state, generation)) state.readyState = 0;
    };
    const deadline = (xhr, state) => {
      clearTimeout(state.timer);
      if (!state.sent || !state.timeout) return;
      const generation = state.generation;
      state.timer = setTimeout(() => fail(xhr, state, generation, 'timeout'), Math.max(0, state.timeout - (Date.now() - state.started)));
    };
    scope.XMLHttpRequest = class extends NativeXHR {
      open(method, url, async = true, username, password) {
        const old = states.get(this);
        const responseType = this.responseType;
        const timeout = this.timeout;
        if (old) { old.generation++; old.sent = false; cancel(old); }
        if (!target(String(url), method)) {
          if (old) super.abort();
          states.delete(this);
          const wasOpened = super.readyState === 1;
          const result = super.open(...arguments);
          // An unsent native request can remain OPENED after abort. Its
          // virtual session response may already be DONE, so emit the newly
          // visible OPENED transition when reusing it for a native asset.
          if (old && old.readyState !== 1 && wasOpened) emit(this, 'readystatechange');
          return result;
        }
        const request = new Request(new URL(String(url), origin), {method});
        if (username != null || password != null) throw new DOMException('Session requests do not use URL credentials', 'NotSupportedError');
        const state = {generation:0, readyState:1, sent:false, async:async !== false,
          method:request.method, url:request.url, headers:new Headers(), responseType, timeout, mime:''};
        resetResponse(state);
        states.set(this, state);
        // Native open validates the request and provides normal EventTarget
        // semantics, but native send is never used for a session API request.
        const wasOpened = super.readyState === 1;
        super.open(request.method, request.url, true);
        if (wasOpened && (!old || old.readyState !== 1)) emit(this, 'readystatechange');
      }
      send(body = null) {
        const state = states.get(this);
        if (!state) return super.send(...arguments);
        if (state.readyState !== 1 || state.sent) throw new DOMException('The request is not open', 'InvalidStateError');
        if (!state.async) throw new DOMException('Synchronous session requests are unavailable', 'NotSupportedError');
        const generation = state.generation;
        const controller = new AbortController();
        // Request extracts the body immediately, including copying ArrayBuffer
        // views, before the caller can reuse an engine memory buffer.
        const request = new Request(state.url, {method:state.method, headers:state.headers,
          body:['GET','HEAD'].includes(state.method) ? null : body, signal:controller.signal});
        state.sent = true; state.started = Date.now(); state.controller = controller;
        deadline(this, state);
        emit(this, 'loadstart', {lengthComputable:false, loaded:0, total:0});
        // Capture the session fetch above: the provider installs another fetch
        // wrapper after this hook, and routing back through it would recurse.
        Promise.resolve().then(async () => {
          if (!current(this, state, generation) || !state.sent) return;
          const response = await sessionFetch(request);
          const bytes = await response.arrayBuffer();
          if (!current(this, state, generation) || !state.sent) return;
          state.status = response.status; state.statusText = response.statusText;
          state.responseURL = response.url || state.url; state.responseHeaders = response.headers;
          state.bytes = bytes;
          let encoding = /charset\s*=\s*["']?([^\s;"']+)/i.exec(state.mime || response.headers.get('content-type') || '')?.[1] || 'utf-8';
          try { state.text = new TextDecoder(encoding).decode(bytes); }
          catch { state.text = new TextDecoder().decode(bytes); }
          state.readyState = 2; emit(this, 'readystatechange');
          if (!current(this, state, generation) || !state.sent) return;
          state.readyState = 3; emit(this, 'readystatechange');
          if (!current(this, state, generation) || !state.sent) return;
          const progress = {lengthComputable:true, loaded:bytes.byteLength, total:bytes.byteLength};
          emit(this, 'progress', progress);
          if (!current(this, state, generation) || !state.sent) return;
          state.sent = false; clearTimeout(state.timer); state.controller = null;
          state.readyState = 4; emit(this, 'readystatechange');
          if (!current(this, state, generation)) return;
          emit(this, 'load', progress);
          if (current(this, state, generation)) emit(this, 'loadend', progress);
        }).catch(() => fail(this, state, generation, 'error'));
      }
      abort() {
        const state = states.get(this);
        if (!state) return super.abort();
        if (state.sent) fail(this, state, state.generation, 'abort');
        else { state.generation++; cancel(state); resetResponse(state); state.readyState = 0; }
      }
      setRequestHeader(name, value) {
        const state = states.get(this);
        if (!state) return super.setRequestHeader(name, value);
        if (state.readyState !== 1 || state.sent) throw new DOMException('The request is not open', 'InvalidStateError');
        super.setRequestHeader(name, value);
        // Match XHR's forbidden-header boundary; the local jar supplies its own
        // cookies and origin. Engine content type and application headers pass.
        if (/^(?:accept-charset|accept-encoding|access-control-request-(?:headers|method)|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|te|trailer|transfer-encoding|upgrade|via)$|^(?:proxy-|sec-)/i.test(String(name))) return;
        state.headers.append(name, value);
      }
      getResponseHeader(name) {
        const state = states.get(this);
        return state ? state.responseHeaders?.get(name) ?? null : super.getResponseHeader(name);
      }
      getAllResponseHeaders() {
        const state = states.get(this);
        if (!state) return super.getAllResponseHeaders();
        return state.responseHeaders ? [...state.responseHeaders].map(([name,value]) => name + ': ' + value + '\r\n').join('') : '';
      }
      overrideMimeType(mime) {
        const state = states.get(this);
        if (!state) return super.overrideMimeType(mime);
        if (state.readyState >= 3) throw new DOMException('The response has started', 'InvalidStateError');
        super.overrideMimeType(mime); state.mime = String(mime);
      }
      get readyState() { return states.get(this)?.readyState ?? super.readyState; }
      get status() { return states.get(this)?.status ?? super.status; }
      get statusText() { return states.get(this)?.statusText ?? super.statusText; }
      get responseURL() { return states.get(this)?.responseURL ?? super.responseURL; }
      get responseType() { return states.get(this)?.responseType ?? super.responseType; }
      set responseType(value) {
        const state = states.get(this);
        if (state?.readyState >= 3) throw new DOMException('The response has started', 'InvalidStateError');
        super.responseType = value;
        if (state) state.responseType = super.responseType;
      }
      get timeout() { return states.get(this)?.timeout ?? super.timeout; }
      set timeout(value) {
        super.timeout = value;
        const state = states.get(this);
        if (state) { state.timeout = super.timeout; deadline(this, state); }
      }
      get responseText() {
        const state = states.get(this);
        if (!state) return super.responseText;
        if (state.responseType && state.responseType !== 'text') throw new DOMException('The response is not text', 'InvalidStateError');
        return state.readyState >= 3 ? state.text : '';
      }
      get responseXML() { return states.has(this) ? null : super.responseXML; }
      get response() {
        const state = states.get(this);
        if (!state) return super.response;
        if (!state.responseType || state.responseType === 'text') return state.readyState >= 3 ? state.text : '';
        if (state.readyState !== 4 || !state.bytes) return null;
        if (state.responseType === 'arraybuffer') return state.bytes;
        if (state.responseType === 'json') { try { return state.response ??= JSON.parse(state.text); } catch { return null; } }
        if (state.responseType === 'blob') return state.response ??= new Blob([state.bytes], {type:state.mime || state.responseHeaders?.get('content-type') || ''});
        return null;
      }
    };
  }
}

export function sessionWorker(scope, viaJar, rbxApi) {
  const KEY = 'kkeep:jar:v4';
  // Match the client's narrow read-only POST list and revalidate on receipt.
  const readPosts = {
    'assetdelivery.roblox.com':'/v3/assets/batch',
    'thumbnails.roblox.com':'/v1/batch',
    'users.roblox.com':'/v1/users'
  };
  scope.addEventListener('message', event => {
    const data = event.data, port = event.ports?.[0];
    if (data?.key !== KEY || !port) return;
    const work = (async () => {
      // The readiness reply contains no account information.
      // Keep the existing wire protocol valid for already-open players. New
      // clients also require this build revision before using its recovery.
      if (data.op === 'ping') return {version:'join18',revision:'join19'};
      const source = new URL(event.source?.url || 'https://invalid.example');
      if (source.origin !== scope.location.origin) throw new Error('client-origin');
      // The bridge is for our app, sign-in and game shell, not proxied websites.
      if (!/^\/(?:_rbx\/(?:app(?:\/|$)|signin$)|_\/cGxheS5yb2Jsb3guY29t\/games\/start$)/.test(source.pathname)) throw new Error('client-path');
      if (data.op === 'claim') {
        await scope.clients.claim();
        return {version:'join18',revision:'join19'};
      }
      if (data.op !== 'fetch' || !['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(data.method)) throw new Error('Invalid request');
      const url = new URL(data.url);
      if (url.origin !== scope.location.origin || data.body?.byteLength > 2 * 1024 * 1024) throw new Error('Invalid request');
      const req = new Request(url, {method:data.method, headers:data.headers, body:data.body});
      let response;
      if (url.pathname.startsWith('/_rbx/api/')) response = await rbxApi(req, url);
      else {
        const m = /^\/_\/([A-Za-z0-9_-]+)(\/.*)$/.exec(url.pathname);
        if (!m) throw new Error('Invalid target');
        const host = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
        if (!/^(gamejoin|apis|economy)\.roblox\.com$/.test(host) &&
            !(data.method === 'POST' && readPosts[host] === m[2])) throw new Error('Invalid target');
        response = await viaJar(req, host, m[2] + url.search);
      }
      // These are JSON APIs, not engine/assets. Bound memory and never copy Wasm.
      const reader = response.body?.getReader(), chunks = []; let size = 0;
      if (reader) for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); }
        chunks.push(part.value);
      }
      let body = null;
      if (reader) { body = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; } body = body.buffer; }
      const headers = new Headers(response.headers);
      for (const key of ['set-cookie','authorization','content-length','content-encoding']) headers.delete(key);
      return {status:response.status, statusText:response.statusText, headers:[...headers], body};
    })();
    event.waitUntil(work.then(result => port.postMessage(result, result.body ? [result.body] : []), error => port.postMessage({error:['client-origin','client-path'].includes(error.message)?error.message:'session-request'})).finally(() => port.close()));
  });
}
