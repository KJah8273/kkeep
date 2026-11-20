// Inserted into the provider hook beside its unchanged RelayWT wire protocol.
// One connection attempt at a time; a native timeout and rejection must not
// open two relays for the same game session.
export function RbxWT(url, opts) {
  const self = this;
  let target, native, relay, timer, cancelled = false, relaying = false, settled = false;
  let resolveReady, rejectReady, resolveClosed, rejectClosed, resolveGate, rejectGate;
  self.ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  self.closed = new Promise((resolve, reject) => { resolveClosed = resolve; rejectClosed = reject; });
  const gate = new Promise((resolve, reject) => { resolveGate = resolve; rejectGate = reject; });
  self.ready.catch(() => {}); self.closed.catch(() => {}); gate.catch(() => {});
  // Closing an unselected candidate rejects its native closed promise too.
  // Observe it immediately: the engine worker rethrows unhandled rejections,
  // even if the fallback has already connected. Keep the original promise so
  // an adopted transport's failure still reaches the engine through closed.
  const observeClosed = t => { t.closed.catch(() => {}); return t; };
  const close = t => { try { t?.close(); } catch {} };
  const fail = error => {
    if (settled || cancelled) return;
    settled = true; clearTimeout(timer); close(native); close(relay);
    rejectReady(error); rejectGate(error); rejectClosed(error);
  };
  const adopt = (t, how) => {
    if (cancelled || settled || (how === 'native' && relaying)) { close(t); return; }
    settled = true; target = t; self.how = how; clearTimeout(timer);
    t.closed.then(resolveClosed, rejectClosed); resolveReady(); resolveGate(t);
    // The outer transport observer reports selection/readiness with current
    // connection ownership. Direct callbacks here could revive an old client.
    if (how === 'relay') modeDb('put', {mode:'relay', at:Date.now()});
  };
  const viaRelay = () => {
    if (relaying || settled || cancelled) return;
    relaying = true; clearTimeout(timer); close(native);
    try { relay = observeClosed(new RelayWT(url, opts)); } catch (error) { fail(error); return; }
    timer = setTimeout(() => fail(new Error('Relay connection timed out')), 15000);
    relay.ready.then(() => adopt(relay, 'relay'), fail);
  };
  (async () => {
    // A validated, explicit recovery choice is carried into owned workers.
    // Do not depend on IndexedDB completing before honoring this launch.
    if (globalThis.__kkeepForceRelay === true) return viaRelay();
    const choice = ['native','auto','relay'].includes(globalThis.__kkeepTransportChoice) ? globalThis.__kkeepTransportChoice : '';
    if (choice === 'relay') return viaRelay();
    let dbTimer;
    const saved = await Promise.race([modeDb('get'), new Promise(resolve => { dbTimer = setTimeout(resolve, 750); })]);
    clearTimeout(dbTimer);
    if (cancelled) return;
    const fresh = saved?.at && Date.now() - saved.at < REMEMBER_MS;
    const explicitNative = choice === 'native', explicitAuto = choice === 'auto';
    const forcedNative = explicitNative || (!explicitAuto && saved?.mode === 'native' && saved.forced && fresh);
    if (typeof Native !== 'function') return viaRelay();
    if (!explicitNative && !explicitAuto && saved?.mode === 'relay' && fresh) return viaRelay();
    // A ready Safari connection can stop delivering reliable game data without
    // closing. Prefer the existing relay on iPad, but retain explicit launch
    // choices and a fresh user-forced native preference. This boolean comes
    // from the owning page, never from a desktop-like worker user agent.
    if (globalThis.__kkeepPreferRelay === true && !forcedNative && !explicitAuto) return viaRelay();
    try { native = observeClosed(opts ? new Native(url, opts) : new Native(url)); }
    catch (error) { return forcedNative ? fail(error) : viaRelay(); }
    timer = setTimeout(() => forcedNative ? fail(new Error('Native connection timed out')) : viaRelay(), NATIVE_MS);
    native.ready.then(() => adopt(native, 'native'), error => {
      if (cancelled || settled || relaying) return;
      forcedNative ? fail(error) : viaRelay();
    });
  })().catch(fail);
  Object.defineProperty(self, 'datagrams', {get:() => target ? target.datagrams : {readable:undefined, writable:undefined, maxDatagramSize:0}});
  Object.defineProperty(self, 'incomingUnidirectionalStreams', {get:() => target?.incomingUnidirectionalStreams});
  Object.defineProperty(self, 'incomingBidirectionalStreams', {get:() => target?.incomingBidirectionalStreams});
  self.createBidirectionalStream = options => gate.then(t => t.createBidirectionalStream(options));
  self.createUnidirectionalStream = options => gate.then(t => t.createUnidirectionalStream(options));
  self.close = info => {
    if (cancelled) return;
    cancelled = true; clearTimeout(timer);
    try { if (target) target.close(info); else { close(native); close(relay); } } catch {}
    rejectReady(new Error('Connection closed')); rejectGate(new Error('Connection closed')); resolveClosed({});
  };
}

// Self-contained: install() and its owned worker bootstrap embed this function.
export function installTransportPreferences(scope) {
  let params;
  try { params = new URL(scope.location.href).searchParams; } catch {}
  const choices = params?.getAll('wt') || [];
  const valid = value => ['native','auto','relay'].includes(value);
  const choice = choices.length === 1 && valid(choices[0]) ? choices[0] :
    !scope.document && choices.length === 0 && valid(scope.__kkeepTransportChoice) ? scope.__kkeepTransportChoice : '';
  scope.__kkeepTransportChoice = choice;
  if (choice === 'relay') scope.__kkeepForceRelay = true;

  let preferRelay = false;
  if (scope.document) {
    try {
      const nav = scope.navigator;
      preferRelay = /iPad/i.test(nav.userAgent) || nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
    } catch {}
  } else {
    const defaults = params?.getAll('kkeepIpadRelay') || [];
    preferRelay = scope.__kkeepPreferRelay === true || defaults.length === 1 && defaults[0] === '1';
  }
  scope.__kkeepPreferRelay = preferRelay;
}
