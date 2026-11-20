// Recovery owns browser connectivity and loading UI, never the credentials,
// cookie jar or authentication decision. Only the proven failed initial login
// GET may be opened again; a form or challenge is never automatically replaced.
export function signinBootstrap(scope) {
  const document = scope.document;
  const targets = ['https://kkeep.fun', 'https://kkeep.kha971.chatgpt.site'];
  const MAX_RECOVERIES = 2;
  let failed = false, complete = false, stage = 'session';
  let prepared = false, connected = false, pageFailure = false, pageAttempt = null;
  let boundController = null, reconnecting = null;
  let automatic = true, pausedByUser = false, recoveryCount = 0, recovery = null, disposed = false, navigationCount = 0, readyFrame = null;
  const serviceWorker = scope.navigator?.serviceWorker;
  const notify = (state, detail = '', preserveForm = false) => {
    const message = {type:'kkeep:roblox-runtime', stage:state, detail};
    if (preserveForm && ['session-recovering','session-waiting'].includes(state)) message.preserveForm = true;
    if (scope.parent !== scope) for (const target of targets) {
      scope.parent.postMessage(message, target);
    }
  };
  let timer = setTimeout(() => fail(stage), 60000);
  function showLoading(text = 'Loading sign-in…') {
    const loading = document.getElementById('loading');
    loading?.classList.remove('done');
    const message = document.getElementById('msg');
    if (message) { message.className = ''; message.textContent = text; }
    const spinner = loading?.querySelector('.spin');
    if (spinner) spinner.style.display = '';
    document.getElementById('kkeep-signin-recovery')?.remove();
  }
  function showFailure(detail) {
    const show = () => {
      const loading = document.getElementById('loading');
      const message = document.getElementById('msg');
      if (!loading || !message) return;
      loading.classList.remove('done');
      message.className = 'err';
      message.textContent = detail === 'service-worker'
        ? "Roblox couldn't start its browser session. Try again, or continue in a new tab."
        : "The Roblox sign-in page didn't finish loading. Try again, or continue in a new tab.";
      const spinner = loading.querySelector('.spin');
      if (spinner) spinner.style.display = 'none';
      if (document.getElementById('kkeep-signin-recovery')) return;
      const actions = document.createElement('div');
      actions.id = 'kkeep-signin-recovery';
      actions.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;padding:12px';
      const retry = document.createElement('button');
      retry.textContent = 'Try again';
      retry.style.cssText = 'font:inherit;padding:12px 18px;border:0;border-radius:10px;background:#fff;color:#111';
      retry.onclick = () => scope.location.reload();
      const open = document.createElement('a');
      open.textContent = 'Open Roblox in a new tab';
      open.href = '/_rbx/app/'; open.target = '_blank'; open.rel = 'noopener noreferrer';
      open.style.cssText = 'font:inherit;padding:12px 18px;color:#c9d9ff';
      actions.append(retry, open); loading.append(actions);
    };
    if (document.getElementById('loading')) show();
    else document.addEventListener('DOMContentLoaded', show, {once:true});
  }
  function cancelRecovery() {
    const previous = recovery;
    recovery = null;
    clearTimeout(previous?.timer);
    previous?.resume?.(false);
  }
  function stopPage(attempt = pageAttempt) {
    if (!attempt) return;
    clearTimeout(attempt.timer); clearTimeout(attempt.poll);
    attempt.element.removeEventListener('load', attempt.check);
    for (const type of ['input','change','submit','pointerdown','keydown']) attempt.observed?.removeEventListener?.(type, attempt.interacted, true);
    if (pageAttempt === attempt) pageAttempt = null;
    if (recovery?.owner === attempt) cancelRecovery();
  }
  function fail(reason = 'session', attempt) {
    if (attempt && attempt !== pageAttempt) return;
    if (disposed || complete || (failed && (!pageFailure || attempt))) return;
    const frame = preservedFrame();
    if (frame) {
      clearTimeout(timer); cancelRecovery();
      revealPreserved(frame, pausedByUser ? 'session-paused' : 'session-help', pausedByUser ? 'user' : 'connection');
      return;
    }
    if (pausedByUser) { notify('session-paused', 'user'); showFailure(reason); return; }
    pageFailure = !!attempt;
    if (!pageFailure) stopPage();
    failed = true; clearTimeout(timer); cancelRecovery();
    const detail = ['service-worker','connection','session'].includes(reason) ? reason : 'session';
    notify('session-failed', detail); showFailure(detail);
  }
  function currentAttempt(attempt) {
    return !!attempt && pageAttempt === attempt && !disposed &&
      attempt.element === document.getElementById('frame') && attempt.element.isConnected && attempt.element.src === attempt.source;
  }
  function currentOwnedFrame(frame) {
    return !!frame && !disposed && (frame === readyFrame || frame === pageAttempt) &&
      frame.element === document.getElementById('frame') && frame.element.isConnected && frame.element.src === frame.source;
  }
  function preservedFrame() {
    if (currentOwnedFrame(readyFrame)) return readyFrame;
    return currentAttempt(pageAttempt) && pageAttempt.protected ? pageAttempt : null;
  }
  function revealPreserved(frame, state, detail = '') {
    if (!currentOwnedFrame(frame)) return;
    document.getElementById('loading')?.classList.add('done');
    notify(state, detail);
  }
  function finishPreserved(frame) {
    if (!currentOwnedFrame(frame)) return;
    connected = true; failed = false; pageFailure = false;
    if (frame === pageAttempt) {
      if (!currentForm(frame)) revealPreserved(frame, 'session-help', 'input');
    } else {
      // The form may have advanced into verification while its local port was
      // repaired. Preserve that document; this signal never asserts a login.
      complete = true;
      revealPreserved(frame, 'session-ready');
    }
  }
  function visible(control, current) {
    if (!control || control.ownerDocument !== current || !control.isConnected) return false;
    const box = control.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }
  function protectInteraction(attempt) {
    if (!currentAttempt(attempt)) return true;
    try {
      if (document.getElementById('signing')?.classList.contains('on')) attempt.protected = true;
      const current = attempt.element.contentDocument;
      if (!current || current === attempt.previous || current.URL === 'about:blank') return attempt.protected;
      if (current !== attempt.observed) {
        for (const type of ['input','change','submit','pointerdown','keydown']) attempt.observed?.removeEventListener?.(type, attempt.interacted, true);
        attempt.observed = current;
        attempt.interacted = () => { attempt.protected = true; };
        for (const type of ['input','change','submit','pointerdown','keydown']) current.addEventListener?.(type, attempt.interacted, true);
      }
      // This guard deliberately works before document.complete. Optional page
      // resources may stall while a login form or verification UI is usable.
      const controls = current.querySelectorAll?.('form,input,textarea,select,button,iframe,[contenteditable="true"]') || [];
      if ([...controls].some(control => visible(control, current))) attempt.protected = true;
      // Keep the same guard in small/document environments without selectors.
      if (visible(current.getElementById('login-username'), current) || visible(current.getElementById('login-password'), current)) attempt.protected = true;
    } catch { attempt.protected = true; }
    return attempt.protected;
  }
  function revealInteraction(attempt) {
    if (!currentAttempt(attempt)) return;
    clearTimeout(attempt.timer);
    if (recovery?.owner === attempt) cancelRecovery();
    failed = false; pageFailure = false;
    document.getElementById('loading')?.classList.add('done');
    if (!attempt.userRequired) { attempt.userRequired = true; notify('session-help', 'input'); }
  }
  function currentForm(attempt) {
    if (!attempt || pageAttempt !== attempt || !connected || complete || (failed && !pageFailure)) return false;
    if (!currentAttempt(attempt)) { stopPage(attempt); fail('connection'); return false; }
    protectInteraction(attempt);
    try {
      const current = attempt.element.contentDocument;
      if (!current || current === attempt.previous || current.URL === 'about:blank' || !['interactive','complete'].includes(current.readyState)) return false;
      const user = current.getElementById('login-username');
      const password = current.getElementById('login-password');
      if (!visible(user, current) || user.name !== 'username' || user.type !== 'text' || user.disabled || user.readOnly ||
          !visible(password, current) || password.name !== 'password' || password.type !== 'password' || password.disabled || password.readOnly) return false;
      const form = user.form;
      if (!form || password.form !== form || form.ownerDocument !== current) return false;
      const candidates = [...form.querySelectorAll('button[type="submit"]')];
      // Roblox's live login uses its explicit #login-button with type=button,
      // whose handler performs submission. Do not mistake that valid form for
      // a connection failure, or accept arbitrary unrelated page buttons.
      const loginButton = current.getElementById('login-button');
      if (loginButton?.tagName === 'BUTTON' && ['button','submit'].includes(loginButton.type)) candidates.push(loginButton);
      const submit = candidates.find(button => visible(button, current) && button.form === form);
      if (!submit || attempt.element.contentDocument !== current) return false;
      failed = false; pageFailure = false; complete = true;
      readyFrame = {element:attempt.element, source:attempt.source, document:current};
      clearTimeout(timer); stopPage(attempt); cancelRecovery();
      document.getElementById('loading')?.classList.add('done');
      notify('session-ready'); return true;
    } catch { return false; }
  }
  async function bounded(work, timeout) {
    let deadline;
    try {
      return await Promise.race([work(), new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new TypeError('Sign-in startup timed out')), timeout);
      })]);
    } finally { clearTimeout(deadline); }
  }
  function attachCurrentController() {
    const active = serviceWorker?.controller;
    if (!active || !boundController || typeof boundController.setupMessagePort !== 'function') return false;
    let script;
    try { script = new URL(active.scriptURL); } catch { return false; }
    if (script.origin !== scope.location.origin || script.pathname !== '/_jar/sw.js') return false;
    boundController.serviceWorkerController = active;
    boundController.setupMessagePort();
    return true;
  }
  function usableRecovery(work) {
    return recovery === work && automatic && !disposed && !complete && (!work.owner || currentAttempt(work.owner)) &&
      (!work.preservedFrame || currentOwnedFrame(work.preservedFrame));
  }
  function recoveryStatus(work, state, detail, text) {
    notify(state, detail, !!work.preservedFrame);
    if (work.preservedFrame) document.getElementById('loading')?.classList.add('done');
    else showLoading(text);
  }
  async function recover(detail, operation, owner, preservedFrame) {
    if (!automatic || disposed || complete || recovery || recoveryCount >= MAX_RECOVERIES) return false;
    if (preservedFrame && !currentOwnedFrame(preservedFrame)) return false;
    if (owner && protectInteraction(owner)) { revealInteraction(owner); return false; }
    const work = {owner, detail, preservedFrame};
    recovery = work; recoveryCount++;
    try {
      recoveryStatus(work, 'session-recovering', detail, 'Reconnecting Roblox sign-in…');
      const allowed = await new Promise(resolve => {
        work.resume = resolve;
        work.timer = setTimeout(() => { work.resume = null; resolve(true); }, recoveryCount === 1 ? 1000 : 3000);
      });
      if (!allowed || !usableRecovery(work)) return false;
      while (scope.navigator?.onLine === false || document.hidden === true) {
        if (scope.navigator?.onLine === false) recoveryStatus(work, 'session-waiting', 'offline', 'Waiting for your connection…');
        work.waiting = true;
        const resumed = await new Promise(resolve => { work.resume = resolve; });
        work.waiting = false; work.resume = null;
        if (!resumed || !usableRecovery(work)) return false;
      }
      if (owner && protectInteraction(owner)) { revealInteraction(owner); return false; }
      recoveryStatus(work, 'session-recovering', detail, 'Reconnecting Roblox sign-in…');
      await operation(work);
      if (!usableRecovery(work)) return false;
      if (owner && protectInteraction(owner)) { revealInteraction(owner); return false; }
      return true;
    } catch {
      return false;
    } finally {
      if (recovery === work) cancelRecovery();
    }
  }
  const resume = () => {
    if (scope.navigator?.onLine === false || document.hidden === true) return;
    if (recovery?.waiting) recovery.resume?.(true);
  };
  scope.addEventListener?.('online', resume);
  document.addEventListener?.('visibilitychange', resume);
  async function startup(work, timeout, detail, beforeRetry) {
    try { return await bounded(work, timeout); }
    catch (initial) {
      while (automatic && !disposed && !recovery && recoveryCount < MAX_RECOVERIES) {
        let result;
        const restored = await recover(detail, async () => {
          beforeRetry?.(); result = await bounded(work, timeout);
        });
        if (restored) return result;
        if (!automatic || disposed) throw initial;
      }
      fail(detail); throw initial;
    }
  }
  async function repairPage(attempt) {
    if (!currentAttempt(attempt) || complete || (failed && !pageFailure) || recovery?.owner === attempt) return;
    if (currentForm(attempt)) return;
    if (protectInteraction(attempt)) { revealInteraction(attempt); return; }
    clearTimeout(attempt.timer);
    let restored = false;
    do {
      restored = await recover('connection', async work => {
        await bounded(() => scope.__kkeepSessionReady(true), 45000);
        if (!usableRecovery(work) || !currentAttempt(attempt)) return;
        if (protectInteraction(attempt)) { revealInteraction(attempt); return; }
        if (boundController && !attachCurrentController()) throw new TypeError('Browser controller unavailable');
      }, attempt);
    } while (!restored && automatic && !disposed && !recovery && !attempt.userRequired && currentAttempt(attempt) && recoveryCount < MAX_RECOVERIES);

    if (!currentAttempt(attempt) || complete || !automatic || disposed) return;
    if (attempt.userRequired) {
      // If input appeared after control was lost, navigation recovery must stop,
      // but the same preserved frame can still regain its local port using the
      // remaining budget. No form or authentication request is repeated.
      if (!connected) void repairReadyPort(attempt);
      return;
    }
    if (!restored) { fail('connection', connected ? attempt : undefined); return; }
    connected = true;
    // A timeout alone is not evidence that a navigation failed. Repair the
    // worker and observe the same document. Only our explicit, failed initial
    // GET marker permits another GET; form/submit/verification are untouched.
    let missingControl = false;
    try {
      const current = attempt.element.contentDocument;
      missingControl = current === attempt.missingControlDocument && !!current?.getElementById('kkeep-signin-control-missing');
    } catch { /* A changed/uninspectable document is never replaced. */ }
    if (missingControl) {
      try { navigate(attempt.frame, true); } catch { fail('connection', attempt); }
    } else {
      showLoading();
      attempt.timer = setTimeout(() => repairPage(attempt), 30000);
    }
  }
  async function repairReadyPort(frame) {
    if (recovery || !currentOwnedFrame(frame)) return;
    // A usable form keeps its exact document. Retrying a failed local port
    // attachment does not submit, reload, or replay the authentication flow.
    let restored = false;
    do {
      restored = await recover('connection', async work => {
        await bounded(() => scope.__kkeepSessionReady(true), 45000);
        if (!usableRecovery(work)) return;
        if (!attachCurrentController()) throw new TypeError('Browser controller unavailable');
      }, undefined, frame);
    } while (!restored && automatic && !disposed && !recovery && currentOwnedFrame(frame) && recoveryCount < MAX_RECOVERIES);
    if (!automatic || !currentOwnedFrame(frame)) return;
    if (!restored) { revealPreserved(frame, 'session-help', 'connection'); return; }
    finishPreserved(frame);
  }
  function repairController() {
    let frame = preservedFrame();
    if (pageAttempt && protectInteraction(pageAttempt)) {
      frame = pageAttempt;
      revealInteraction(pageAttempt);
    }
    connected = false; complete = false;
    if (frame) void repairReadyPort(frame);
    else if (pageAttempt) void repairPage(pageAttempt);
    else fail('connection');
  }
  function reconnect(prefix) {
    const active = serviceWorker?.controller;
    if (disposed || !automatic || !boundController || (prefix !== undefined && prefix !== boundController.prefix)) return;
    if ((readyFrame && !currentOwnedFrame(readyFrame)) || (pageAttempt && !currentAttempt(pageAttempt))) return;
    if (recovery?.preservedFrame || (pageAttempt && recovery?.owner === pageAttempt)) return;
    if (!active) {
      clearTimeout(reconnecting?.timer); reconnecting = null;
      // A controller can disappear after a form is already usable. Reclaim the
      // current worker/port in place instead of waiting forever for
      // the page observer that was correctly retired when the form became ready.
      if (readyFrame || pageAttempt) repairController();
      return;
    }
    if (reconnecting?.controller === boundController && reconnecting.worker === active) return;
    clearTimeout(reconnecting?.timer);
    const attempt = {controller:boundController, worker:active}; reconnecting = attempt;
    try {
      if (!attachCurrentController()) { reconnecting = null; return; }
      if (!connected) finishPreserved(preservedFrame());
      attempt.timer = setTimeout(() => { if (reconnecting === attempt) reconnecting = null; }, 1000);
    } catch {
      reconnecting = null;
      repairController();
    }
  }
  serviceWorker?.addEventListener?.('controllerchange', () => {
    if (boundController?.serviceWorkerController !== serviceWorker.controller) reconnect();
  });
  serviceWorker?.addEventListener?.('message', event => {
    const data = event.data;
    if (data?.$controller$swrevive && boundController) {
      event.stopImmediatePropagation();
      if (event.source === serviceWorker.controller && !boundController.guardServiceWorkerRevive) reconnect();
      return;
    }
    if (event.source !== serviceWorker.controller || data?.type !== 'kkeep:signin-route-wake') return;
    if (typeof data.prefix !== 'string' || !/^\/~\/sj\/[a-z0-9]{1,32}\/$/.test(data.prefix)) return;
    reconnect(data.prefix);
  });
  function navigate(frame, automaticNavigation = false) {
    if (!prepared || !connected || (failed && !pageFailure) || !frame || frame.element !== document.getElementById('frame')) throw new TypeError('Sign-in page is not ready to open');
    const element = frame.element;
    let previous;
    try { previous = element.contentDocument; } catch { previous = null; }
    frame.go('https://www.roblox.com/login');
    stopPage(); cancelRecovery(); clearTimeout(timer); readyFrame = null;
    if (!automaticNavigation && navigationCount) { automatic = true; pausedByUser = false; recoveryCount = 0; }
    navigationCount++;
    const attempt = {frame, element, previous, source:element.src, protected:false};
    pageAttempt = attempt; failed = false; pageFailure = false; complete = false;
    showLoading();
    attempt.check = () => currentForm(attempt);
    element.addEventListener('load', attempt.check);
    attempt.timer = setTimeout(() => repairPage(attempt), 60000);
    const poll = () => {
      if (currentForm(attempt) || pageAttempt !== attempt) return;
      attempt.poll = setTimeout(poll, pageFailure || attempt.userRequired ? 2000 : 500);
    };
    attempt.poll = setTimeout(poll, 500);
  }
  scope.addEventListener?.('message', event => {
    const data = event.data;
    if (event.source === scope.parent && targets.includes(event.origin) && data?.type === 'kkeep:roblox-recovery' && data.action === 'stop') {
      automatic = false; pausedByUser = true; cancelRecovery(); clearTimeout(pageAttempt?.timer);
      if (!complete) {
        const frame = preservedFrame();
        if (frame) revealPreserved(frame, 'session-paused', 'user');
        else { notify('session-paused', 'user'); showFailure('connection'); }
      }
      return;
    }
    const attempt = pageAttempt;
    if (event.origin !== scope.location.origin || !currentAttempt(attempt) || event.source !== attempt.element.contentWindow || data?.type !== 'kkeep:signin-control-missing') return;
    try {
      const current = attempt.element.contentDocument;
      const url = new URL(attempt.source, scope.location.origin);
      if (!boundController || !/^\/~\/sj\/[a-z0-9]{1,32}\/$/.test(boundController.prefix) || !url.pathname.startsWith(boundController.prefix)) return;
      if (!current || current === attempt.previous || !current.getElementById('kkeep-signin-control-missing')) return;
      if (protectInteraction(attempt)) { revealInteraction(attempt); return; }
      attempt.missingControlDocument = current;
      void repairPage(attempt);
    } catch { /* Uninspectable documents never permit an automatic navigation. */ }
  });
  scope.addEventListener?.('pagehide', event => {
    if (!event.persisted) { disposed = true; stopPage(); cancelRecovery(); clearTimeout(timer); clearTimeout(reconnecting?.timer); }
  });
  scope.__kkeepSignIn = {
    async prepare() {
      clearTimeout(timer); stage = 'service-worker';
      await startup(() => scope.__kkeepSessionReady(true), 45000, stage);
      if (disposed || failed) throw new TypeError('Sign-in startup stopped');
      prepared = true; notify('session-ready'); stage = 'connection';
    },
    async connect(controller) {
      clearTimeout(timer);
      if (typeof controller.setupMessagePort === 'function') boundController = controller;
      const result = await startup(() => controller.wait(), 20000, 'connection', () => { if (boundController && !attachCurrentController()) throw new TypeError('Browser controller unavailable'); });
      if (disposed || failed) throw new TypeError('Sign-in startup stopped');
      connected = true; return result;
    },
    navigate,
    loaded: () => currentForm(pageAttempt),
    fail
  };
}
