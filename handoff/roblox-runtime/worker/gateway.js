import {transportBootstrap} from './transport.js';
import {sessionClient,sessionWorker} from './session.js';
import {transformSessionState,sessionStateTransaction} from './session-state.js';
import {RbxWT,installTransportPreferences} from './relay.js';
import {engineProfiles} from './engine.js';
import {transformEngineLoader,transformPlayerLocaleDeadline} from './engine-loader.js';
import {proxySessionWorker} from './proxy-session.js';
import {graphicsSettingsPath,mobileCanvasPixelRatio,reportLocalWebGPUError} from './graphics.js';
import {catalogLaunchUrl} from './preferences.js';
export const UPSTREAM='https://api.spf50krem.com';
export const WISP='wss://api.spf50krem.com/wisp/';
export const SIGNIN_WISP='wss://api.spf50krem.com/_rbx/wisp/';

// Serialized into the inspected player. A post-join browser exception only
// becomes a game failure when it came from this engine's own scripts. Keep
// analytics/page errors and opaque cross-origin errors nonfatal.
function isGameEngineException(source,error,basePath) {
  const owned = value => {
    if(typeof value!=='string'||!value)return false;
    try {
      const url=new URL(value,location.href);
      return url.origin===location.origin &&
        (url.pathname===basePath+'WebClient.js'||url.pathname===basePath+'WasmPlayer.js'||
          /^(?:\/[a-f0-9]{40})?\/assets\/webclient\/stub\.js$/.test(url.pathname));
    } catch { return false; }
  };
  if(owned(source))return true;
  try {
    // The actual pthread handler rethrows its ErrorEvent. Its outer browser
    // event can be opaque, while the nested engine source is still available.
    return !!(error&&error.type==='error'&&typeof error.message==='string'&&owned(error.filename));
  } catch { return false; }
}

// This call is placed only in the inspected engine's own frame-loop catch.
// A thrown frame must not remain an invisible, repeating renderer failure.
// Keep Emscripten exits/yields and intentional browser cancellation nonfatal.
function reportGameFrameFailure(module,error) {
  try {
    if(module.__kkeepFrameFailureReported||error==='unwind'||error?.name==='ExitStatus'||error?.name==='AbortError')return;
    module.__kkeepFrameFailureReported=true;
  } catch { return; }
  try { globalThis.__kkeepRuntime?.engineError?.(error); } catch { /* Diagnostics do not change frame scheduling. */ }
  try {
    globalThis.__onEngineLoadingStatus?.({kind:'failure',source:'browser',
      message:'Roblox encountered a problem. Check the console and reload.',errorCode:null,statusCode:null});
  } catch { /* Preserve the original engine catch even if its UI is unavailable. */ }
}

function transformPlayerFailures(text,path) {
  const replace = (from,to) => {
    if(text.split(from).length!==2)throw new Error('Engine failure handling changed');
    text=text.replace(from,()=>to);
  };
  // The provider suppresses every error once its loading screen is hidden.
  // Preserve browser-error suppression, but let genuine engine failures
  // reopen the existing error panel after the first scene.
  replace('if(this.hiddenAfterSuccess||r<this.failureSourcePriority||this.experienceLoaded&&r<=we)return;',
    'if(r<this.failureSourcePriority||(this.hiddenAfterSuccess||this.experienceLoaded)&&r<=we)return;');
  replace('this.failureSourcePriority=r,this.statusPriority=2,this.dismissed=!1,this.cancelPendingDismissal();',
    'this.failureSourcePriority=r,this.statusPriority=2,this.dismissed=!1,this.hiddenAfterSuccess=!1,this.cancelPendingDismissal();');
  const message='Roblox encountered a problem. Check the console and reload.';
  replace('window.onerror=()=>{f.showFailure("'+message+'"),s.setStatus=u=>{u&&console.error("[post-exception status] "+u)}}',
    `window.onerror=(message,source,line,column,error)=>{
      if(f.experienceLoaded||f.hiddenAfterSuccess){
        if(f.hasEngineFailure()||!(${isGameEngineException.toString()})(source,error,${JSON.stringify(path.slice(0,-'WasmPlayer.js'.length))}))return;
        f.showFailureDetails(${JSON.stringify(message)},null,"browser",2);
      }else f.showFailure(${JSON.stringify(message)});
      s.setStatus=u=>{u&&console.error("[post-exception status] "+u)}
    }`);
  return text;
}

function transformPlayerCanvas(text) {
  const resize='let O=!1;new ResizeObserver(()=>{O=!0}).observe(e),s.applyPendingResize=()=>{if(!O)return!1;O=!1;let u=s.getEffectiveDevicePixelRatio();return e.width=Math.round(e.clientWidth*u),e.height=Math.round(e.clientHeight*u),!0}';
  if(text.split(resize).length!==2)throw new Error('Engine canvas resize handling changed');
  // The provider's budget makes the effective ratio depend on the viewport,
  // while its native-resolution media query cannot observe those changes.
  // Keep the existing resize lifecycle and notify the native ratio event only
  // after applying the buffer size. Do not seed this cache before native init.
  text=text.replace(resize,()=>`let O=!1,kkeepLastNotifiedPixelRatio;
    new ResizeObserver(()=>{O=!0}).observe(e),s.applyPendingResize=()=>{
      if(!O)return!1;
      O=!1;
      let u=s.getEffectiveDevicePixelRatio();
      e.width=Math.round(e.clientWidth*u);
      e.height=Math.round(e.clientHeight*u);
      if(Number.isFinite(u)&&u>0&&u!==kkeepLastNotifiedPixelRatio&&typeof s.update_pixel_ratio==="function"){
        s.update_pixel_ratio(u);
        kkeepLastNotifiedPixelRatio=u;
      }
      return!0
    }`);
  const print='print:(...u)=>{console.log(u.join(" "))}';
  if(text.split(print).length!==2)throw new Error('Engine canvas print handling changed');
  // The runtime accepts bounded canvas numbers or three fixed lifecycle names.
  // Preserve stdout; optional diagnostics cannot interrupt native printing.
  return text.replace(print,()=>`print:(...u)=>{const line=u.join(" ");console.log(line);if(line.startsWith("Canvas: ")||line==="[LIFECYCLE] joinGameSucceeded"||line==="[LIFECYCLE] ugcGameLuaWillStart"||line==="[LIFECYCLE] ugcGameWillClose"){try{window.__kkeepRuntime?.engineOutput?.(line)}catch{}}}`);
}

function transformPlayerPresentation(text) {
  const replace=(from,to)=>{
    if(text.split(from).length!==2)throw new Error('Engine presentation loading contract changed');
    text=text.replace(from,()=>to);
  };
  // Two page animation frames do not establish that the native renderer has
  // submitted anything. For this inspected WebGPU build, arm only after the
  // default-loading-screen callback and wait for its next native submission.
  // Keep experienceLoaded's existing error-priority meaning and the WebGL path.
  replace('dismissAfterRenderedFrame(){this.experienceLoaded=!0,!(this.dismissed||this.dismissAnimationFrame!==null||this.hasEngineFailure())&&(this.dismissAnimationFrame=window.requestAnimationFrame(()=>{this.dismissAnimationFrame=window.requestAnimationFrame(()=>{this.dismissAnimationFrame=null,this.dismiss()})}))}',
    `dismissAfterRenderedFrame(){
      this.experienceLoaded=!0;
      if(this.dismissed||this.dismissAnimationFrame!==null||this.hasEngineFailure()||this.kkeepCancelNativePresentation)return;
      const schedule=()=>{
        this.kkeepCancelNativePresentation=null;
        if(this.dismissed||this.hasEngineFailure())return;
        this.dismissAnimationFrame=window.requestAnimationFrame(()=>{
          this.dismissAnimationFrame=window.requestAnimationFrame(()=>{
            this.dismissAnimationFrame=null;
            this.dismiss()
          })
        })
      };
      const module=window.Module;
      if(module?.__kkeepWebGPUPresentConfigured===true){
        const presented=()=>{
          if(module.__kkeepFramePresented!==presented)return;
          delete module.__kkeepFramePresented;
          schedule()
        };
        this.kkeepCancelNativePresentation=()=>{
          if(module.__kkeepFramePresented===presented)delete module.__kkeepFramePresented
        };
        module.__kkeepFramePresented=presented;
        this.setEngineStatus("Preparing the first game frame…")
      }else schedule()
    }`);
  // Accepted engine failures, a new prepare(), and explicit dismissal already
  // share this cancellation path. A stale callback must not hide their UI.
  replace('cancelPendingDismissal(){',`cancelPendingDismissal(){
    const cancel=this.kkeepCancelNativePresentation;
    this.kkeepCancelNativePresentation=null;
    if(cancel)cancel();`);
  replace('let t=()=>{window.close(),window.location.replace("about:blank")}',
    'let t=()=>{this.cancelPendingDismissal();window.close(),window.location.replace("about:blank")}');
  return text;
}

function transformPlayerGraphicsRecovery(text) {
  const selected='let j=y?await $e():void 0;';
  if(text.split(selected).length!==2)throw new Error('Engine graphics initialization contract changed');
  // This is the inspected player's actual renderer branch. Keep native GPU
  // requests, errors and device identity unchanged; only report bounded causes.
  return text.replace(selected,()=>`let j;
    if(y){
      try{j=await $e()}
      catch(error){
        try{window.__kkeepRuntime?.graphicsFailure?.('graphics-init')}catch{}
        throw error
      }
      try{window.__kkeepRuntime?.graphicsDevice?.(j)}catch{}
    }`);
}

function transformNativePresentation(text) {
  const configured='}n.configure(a)}function C_(e,r){';
  const present='function Ya(e,r,n){const t=l.getJsObject(e),a=l.getJsObject(r),i=l.getJsObject(n),o=f.canvas.getContext("webgpu"),s=t.createCommandEncoder(),c=o.getCurrentTexture();s.copyTextureToTexture({texture:a},{texture:c},[Math.min(a.width,c.width),Math.min(a.height,c.height),1]);const u=s.finish();t.queue.submit([i]),t.queue.submit([u])}';
  if(text.split(configured).length!==2||text.split(present).length!==2)throw new Error('Engine native presentation contract changed');
  // Mark the actual native surface after configure returns, not the requested
  // renderer or the availability of a preinitialized device. WebGL fallback
  // must retain its existing dismissal path.
  text=text.replace(configured,'}n.configure(a);if(n.canvas===f.canvas)f.__kkeepWebGPUPresentConfigured=true}function C_(e,r){');
  // This is the binary's sole presentBrowserFrame import, called from native
  // Render/finishFrame -> Render/submitFrame. Observe only after both original
  // submits return. Add no GPU calls, resource changes, or per-frame promises.
  return text.replace(present,()=>present.slice(0,-1)+
    ';try{f.__kkeepFramePresented?.()}catch{}}');
}

// The inspected binary's printf formatter calls emscripten_console_log,
// bypassing Module.print. Keep its original console output and forward only
// the same bounded native view/lifecycle records accepted by the runtime.
function forwardNativeEngineOutput(line) {
  try {
    if(typeof line!=='string'||line.length>202)return;
    const value=line.endsWith('\r\n')?line.slice(0,-2):line.endsWith('\n')?line.slice(0,-1):line;
    if(value.length>200||/[\r\n]/.test(value))return;
    const lifecycle=value==='[LIFECYCLE] joinGameSucceeded'||
      value==='[LIFECYCLE] ugcGameLuaWillStart'||value==='[LIFECYCLE] ugcGameWillClose';
    if(!lifecycle){
      const match=/^Canvas: (\d{1,5})x(\d{1,5}) CSS, (\d{1,5})x(\d{1,5}) backing \(effective dpr=(\d{1,2}(?:\.\d{1,3})?), raw=(\d{1,2}(?:\.\d{1,3})?)\)$/.exec(value);
      if(!match)return;
      const values=match.slice(1).map(Number);
      if(!values.slice(0,4).every(n=>Number.isInteger(n)&&n>=0&&n<=32768)||
          !values.slice(4).every(n=>Number.isFinite(n)&&n>0&&n<=16))return;
    }
    globalThis.__kkeepRuntime?.engineOutput?.(value);
  } catch { /* Native console output must not depend on local diagnostics. */ }
}

function transformNativeEngineOutput(text) {
  const bridge='function Is(e){e>>>=0,console.log(T(e))}';
  if(text.split(bridge).length!==2)throw new Error('Engine native console handling changed');
  return text.replace(bridge,()=>`function Is(e){e>>>=0;const line=T(e);console.log(line);(${forwardNativeEngineOutput.toString()})(line)}`);
}

function transformSessionIdentity(text) {
  const replace = (from, to) => {
    if (text.split(from).length !== 2) throw new Error('Provider session identity changed');
    text = text.replace(from, () => to);
  };
  // The inspected provider memoizes every identity result until the worker
  // restarts. A temporary HTTP failure becomes a permanent signed-out answer,
  // while a revoked session can remain signed in. Keep catalog reads bounded
  // and explicitly verify sign-in/launch without changing the account token.
  replace(`\tlet userMemo = null;
\tasync function currentUser() {
\t\tconst tok = await token();
\t\tif (!tok) return null;
\t\tif (userMemo && userMemo.tok === tok) return userMemo.user;
\t\tlet r = await rbxJson("users.roblox.com", "/v1/users/authenticated");
\t\tfor (let i = 0; i < 3 && r.status === 0; i++) {
\t\t\tawait new Promise((ok) => setTimeout(ok, 600 * (i + 1)));
\t\t\tr = await rbxJson("users.roblox.com", "/v1/users/authenticated");
\t\t}
\t\tif (r.status === 0) throw new Error("couldn't reach Roblox");
\t\tuserMemo = {
\t\t\ttok,
\t\t\tuser: r.status === 200 && r.data && r.data.id ? r.data : null
\t\t};
\t\treturn userMemo.user;
\t}`, `\tlet userMemo = null, kkeepIdentityVersion = 0, kkeepIdentityRequest = 0;
\tasync function currentUser(fresh = false, rechecked = false) {
\t\tconst generation = kkeepIdentityVersion;
\t\t// The sign-in page's jar-changed message and this fetch may arrive in
\t\t// either order. Bind verification to durable storage, not an older memo.
\t\tconst tok = await kv("get", "token") || "";
\t\tif (!tok) return null;
\t\tif (generation !== kkeepIdentityVersion) throw new Error("Roblox session changed. Try again.");
\t\tconst age = userMemo ? Date.now() - userMemo.checkedAt : Infinity;
\t\tif (!fresh && userMemo && userMemo.tok === tok && age >= 0 && age < 30000) { tokenMemo = {token:tok}; return userMemo.user; }
\t\tconst request = ++kkeepIdentityRequest;
\t\tlet r = await rbxJson("users.roblox.com", "/v1/users/authenticated", {sessionToken:tok});
\t\tfor (let i = 0; i < 3 && r.status === 0; i++) {
\t\t\tawait new Promise((ok) => setTimeout(ok, 600 * (i + 1)));
\t\t\tr = await rbxJson("users.roblox.com", "/v1/users/authenticated", {sessionToken:tok});
\t\t}
\t\tif (r.status === 0) throw new Error("couldn't reach Roblox");
\t\tconst signedOut = r.status === 401 || r.status === 403;
\t\tif (!signedOut && (r.status !== 200 || !Number.isSafeInteger(r.data?.id) || r.data.id <= 0)) throw new Error("Couldn't verify Roblox sign-in. Try again.");
\t\tconst currentToken = await kv("get", "token") || "";
\t\tif (generation !== kkeepIdentityVersion) throw new Error("Roblox session changed. Try again.");
\t\tif (currentToken !== tok) {
\t\t\t// A legitimate response may rotate its cookie. Verify the new token
\t\t\t// once; never reuse the old identity or replay a join/logout.
\t\t\tif (!rechecked && currentToken) return currentUser(true, true);
\t\t\tthrow new Error("Roblox session changed. Try again.");
\t\t}
\t\tconst user = signedOut ? null : r.data;
\t\ttokenMemo = {token:currentToken};
\t\t// Accept completed decisions in request order. A newer pending read
\t\t// must not leave the catalog's getUser() without its validated memo.
\t\tif (!userMemo || request > userMemo.request) userMemo = {tok, user, checkedAt:Date.now(), request};
\t\treturn userMemo.user;
\t}`);
  replace(`\tfunction forgetSession() {
\t\ttokenMemo = null;`, `\tfunction forgetSession() {
\t\tkkeepIdentityVersion++;
\t\ttokenMemo = null;`);
  replace('\t\t\t\tconst u = await currentUser();', '\t\t\t\tconst u = await currentUser(true);');
  replace('\t\t\tif (!await currentUser()) return json(401, { error: "not signed in" });', '\t\t\tif (!await currentUser(p === "/launch")) return json(401, { error: "not signed in" });');
  return text;
}

function transformAppSignout(text) {
  const original=`async function signOut() {
  if (!confirm("Sign out of Roblox here?")) return;
  await fetch(apiUrl("/api/session"), { method: "DELETE" }).catch(() => {});
  if (JAR) { toSignIn(); return; }
  location.href = "/";
}`;
  const button='<button class="round" aria-label="Sign out" title="Sign out" onclick="signOut()">';
  if(text.split(original).length!==2||text.split(button).length!==2)throw new Error('Provider sign-out handling changed');
  // An HTTP error or lost reply does not confirm logout. Keep the catalog
  // and its existing toast/manual action. The explicit button needs no native
  // confirmation dialog, which can freeze a nested frame. Never replay DELETE.
  return text.replace(original,()=>`let kkeepSignoutPending = false;
async function signOut() {
  const pending = value => {
    kkeepSignoutPending = value;
    for (const button of document.querySelectorAll('button[onclick="signOut()"]')) {
      button.disabled = value;
      if (value) button.setAttribute("aria-busy", "true");
      else button.removeAttribute("aria-busy");
    }
  };
  // The provider caches some header HTML across async page requests. Keep
  // pending attributes on live controls so cached markup cannot strand one
  // disabled after a failed logout. Repeated actions refresh any new control.
  if (kkeepSignoutPending) { pending(true); return; }
  pending(true);
  try {
    const response = await fetch(apiUrl("/api/session"), { method: "DELETE" });
    if (!response.ok) throw new Error("Sign-out request failed");
  } catch {
    pending(false);
    toast("Sign-out could not be confirmed. Check your connection and try again.");
    return;
  }
  if (JAR) { toSignIn(); return; }
  location.href = "/";
}`);
}

function transformAppLaunchPreferences(text) {
  const launch='(await api(`/api/launch?placeId=${encodeURIComponent(placeId)}${job ? `&job=${encodeURIComponent(job)}` : ""}`)).url';
  const original='try { location.href = '+launch+'; }';
  if(text.split(original).length!==2)throw new Error('Provider catalog launch changed');
  // Decorate the original navigation, retaining the same API call and /play
  // service-worker step. Never start another join to apply a preference.
  return text.replace(original,()=> 'try { location.href = ('+catalogLaunchUrl.toString()+')('+launch+'); }');
}

function transformAppSessionRecovery(text) {
  const original='const failed = (e) => `<div class="state"><b>Couldn\'t load this page.</b> ${esc(e.message)}<br><button class="btn btn-ghost" onclick="route()">Try again</button></div>`;';
  if(text.split(original).length!==2)throw new Error('Provider session recovery changed');
  // A route-only retry retains the old client's captured revision. Reload only
  // on an explicit click for this exact mismatch; ordinary API failures keep
  // their existing retry and the browser-local account state stays untouched.
  text=text.replace(original,()=>`const failed = (e) => e.message === "Browser session is not ready (session-version)"
    ? '<div class="state"><b>This Roblox page needs an update.</b> Reload to continue.<br><button class="btn btn-ghost" onclick="location.reload()">Reload Roblox</button></div>'
    : \`<div class="state"><b>Couldn't load this page.</b> \${esc(e.message)}<br><button class="btn btn-ghost" onclick="route()">Try again</button></div>\`;`);
  const route=`async function route() {
  const h = location.hash.slice(1) || "/";
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  document.title = "Roblox";
  window.scrollTo(0, 0);
  try {
    if (path === "/friends") await pageFriends();
    else if (path === "/search" && params.get("q")) await pageSearch(params);
    else if (path.startsWith("/game/")) await pageGame(path.slice(6).replace(/\\D/g, ""));
    else if (path.startsWith("/user/")) await pageUser(path.slice(6).replace(/\\D/g, ""));
    else await pageHome();
  } catch (e) {
    if (e.message !== "signed out") $page.innerHTML = topRow({ back: path !== "/" }) + failed(e);
  }
}`;
  if(text.split(route).length!==2)throw new Error('Provider catalog status changed');
  // Report only the outcome of the current read-only catalog route. These
  // notices open host help; they never retry a request or change sign-in state.
  // A hash change can precede its route callback, so compare both identities.
  const instrumented=route
    .replace('  const h = location.hash.slice(1) || "/";',`  const kkeepRouteId = ++kkeepCatalogRoute;
  const kkeepRouteHash = location.hash;
  const kkeepCurrentRoute = () => kkeepRouteId === kkeepCatalogRoute && location.hash === kkeepRouteHash;
  const h = location.hash.slice(1) || "/";`)
    .replace('    else await pageHome();',`    else await pageHome();
    if (kkeepCurrentRoute()) kkeepCatalogStatus("catalog-ready");`)
    .replace('    if (e.message !== "signed out") $page.innerHTML = topRow({ back: path !== "/" }) + failed(e);',`    if (!kkeepCurrentRoute() || e.message === "signed out") return;
    $page.innerHTML = topRow({ back: path !== "/" }) + failed(e);
    kkeepCatalogStatus("catalog-failed", kkeepCatalogReason(e));`);
  return text.replace(route,()=>`let kkeepCatalogRoute = 0;
function kkeepCatalogStatus(stage, detail = "") {
  if (window.parent === window) return;
  for (const target of ["https://kkeep.fun", "https://kkeep.kha971.chatgpt.site"]) {
    try { window.parent.postMessage({type:"kkeep:roblox-runtime", stage, detail}, target); } catch {}
  }
}
function kkeepCatalogReason(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (message === "Browser session is not ready (session-version)") return "version";
  if (["session-timeout", "session-request", "Session setup timed out", "Service worker unavailable",
    "Browser session is not ready (session-inactive)", "Browser session is not ready (session-timeout)",
    "Browser session response failed", "Browser session could not control this page",
    "Network request failed", "Failed to fetch", "Load failed", "couldn't reach Roblox"].includes(message)) return "connection";
  return "catalog";
}
${instrumented}`);
}

function transformSignin(text) {
  const replace = (from, to) => {
    if (!(typeof from === 'string' ? text.includes(from) : from.test(text))) throw new Error('Provider sign-in startup changed');
    text = text.replace(from, to);
  };
  // Sign-in needs the current primary relay too. The former /wisp/ override
  // silently disabled the provider's newer, more reliable sign-in route.
  replace('window.__JAR_WISP__=""', `window.__JAR_WISP__=${JSON.stringify(SIGNIN_WISP)}`);
  // Kkeep selects one known relay; the provider's unrelated experiment must
  // not schedule an automatic reload using a stale local route preference.
  replace(/  const ROUTE_KEY = "rbxweb\.siroute";[\s\S]*?  step\("route " \+ route\);/, '  const route = "front";\n  step("route " + route);');
  replace(/  if \(route === "mullvad"\) setTimeout\(\(\) => \{[\s\S]*?  \}, 30000\);/, '');
  replace(/    await navigator\.serviceWorker\.register\(window\.__JAR_SW__ \|\| "\/_jar\/sw\.js", \{ scope: "\/" \}\);\s*await navigator\.serviceWorker\.ready;\s*if \(!navigator\.serviceWorker\.controller\) \{ location\.reload\(\); await new Promise\(\(\) => \{\}\); \}/,
    '    await window.__kkeepSignIn.prepare();');
  replace('    await controller.wait();', '    await window.__kkeepSignIn.connect(controller);');
  replace('  $("frame").addEventListener("load", () => { $("loading").classList.add("done"); step("login page loaded"); }, { once: true });', '');
  replace('  frame.go("https://www.roblox.com/login");', '  window.__kkeepSignIn.navigate(frame);');
  // Do not declare a blank or stalled login frame loaded after a fixed delay.
  // The bootstrap's deadline offers recovery without hiding the failure.
  replace('  setTimeout(() => $("loading").classList.add("done"), 45000);', '');
  replace(/  const fail = \(m\) => \{[^\n]+\};/, '  const fail = () => window.__kkeepSignIn.fail("session");');
  // A previously saved cookie can be rejected after logout/expiry. Reveal the
  // existing login frame once without navigating away from entered fields.
  // Keep that cookie rejected; later failures retain manual recovery.
  replace('  function showSigning(msg, retry) {', '  function showSigning(msg, retry, allowSignin = false) {');
  replace('    $("signing").querySelector("button")?.remove();', '    $("signing").querySelectorAll("button").forEach(button => button.remove());');
  replace('  let rejected = null, busy = false;', `  let rejected = null, busy = false, kkeepRejectedVersion = 0, kkeepReturnedToForm = false;
  const kkeepTransferState = ${sessionStateTransaction.toString()};`);
  // Verification can outlive another login or logout. Its temporary candidate
  // and rollback share a durable owner; cookie rotations retain that owner.
  replace(`      const prev = await kv("get", "token");
      if (token !== prev) { await kv("put", "token", token); tellSw(); }
      const ok = await signedInSure();
      if (ok) { step("signed in"); done(); return; }
      // Not a working session (or Roblox couldn't be reached): keep what we had.
      if (prev) await kv("put", "token", prev); else await kv("del", "token");
      tellSw();`, `      const openSessionDb = () => db("rbxjar", "kv");
      const transfer = await kkeepTransferState(openSessionDb, "capture", {token});
      tellSw();
      const changed = () => {
        rejected = token;
        kkeepRejectedVersion++;
        showSigning("Your Roblox session changed. Try again, or return to sign-in.", true, true);
      };
      const ok = await signedInSure();
      const current = await kkeepTransferState(openSessionDb, "matches", {generation:transfer.generation});
      if (current.status !== "current") { changed(); return; }
      if (ok) { step("signed in"); done(); return; }
      // Restore only this transfer, including any legitimate cookie rotation.
      const restored = await kkeepTransferState(openSessionDb, "restore", {generation:transfer.generation, token:transfer.previous});
      if (restored.status !== "stored") { changed(); return; }
      tellSw();`);
  replace('      step(ok === null ? "session check unreachable" : "session rejected");',
    '      step(ok === null ? "session check unreachable" : "session rejected");\n      kkeepRejectedVersion++;');
  replace('        setTimeout(() => { if (rejected === token) rejected = null; }, 8000);',
    '        const retryVersion = kkeepRejectedVersion;\n        setTimeout(() => { if (retryVersion === kkeepRejectedVersion && rejected === token) rejected = null; }, 8000);');
  replace('      $("signing").appendChild(b);', `      $("signing").appendChild(b);
      if (allowSignin) {
        const back = document.createElement("button");
        back.type = "button";
        back.textContent = "Back to sign-in";
        back.onclick = () => {
          try {
            window.__kkeepSignIn.navigate(frame);
            $("signing").classList.remove("on");
          } catch {
            $("smsg").textContent = "The sign-in page could not reopen. Try again.";
          }
        };
        $("signing").appendChild(back);
      }`);
  replace('        showSigning("Roblox signed you in, but we couldn\'t start your session here. Try again.", true);',
    `        showSigning("This sign-in could not be verified. Try again, or return to sign-in.", true, true);
        if (ok === false && !kkeepReturnedToForm) {
          kkeepReturnedToForm = true;
          $("signing").classList.remove("on");
        }`);
  return text;
}

export function allowedPath(path){
  return path==='/hook.js'||path==='/_rbx/signin'||path==='/_rbx/engine'||path==='/_jar/sw.js'||path==='/favicon.ico'||
    /^\/(?:_rbx\/app|controller|scramjet|epoxy|assets|_next)(?:\/|$)/.test(path)||
    /^\/[a-f0-9]{40}\//.test(path)||
    /^\/_\/[A-Za-z0-9_-]+\//.test(path)||/^\/play\/[1-9]\d{0,19}$/.test(path);
}

export function responseHeaders(original,origin,requestUrl){
  const h=new Headers(original);
  for(const key of ['set-cookie','content-security-policy','content-security-policy-report-only','x-frame-options','reporting-endpoints','report-to','nel','document-isolation-policy'])h.delete(key);
  h.set('Cross-Origin-Opener-Policy','same-origin');
  h.set('Cross-Origin-Embedder-Policy','require-corp');
  h.set('Cross-Origin-Resource-Policy','cross-origin');
  h.set('Access-Control-Allow-Origin','*');
  h.delete('Access-Control-Allow-Credentials');
  h.set('Referrer-Policy','no-referrer');
  h.set('X-Content-Type-Options','nosniff');
  h.set('Content-Security-Policy',"frame-ancestors 'self' https://kkeep.fun https://kkeep.kha971.chatgpt.site");
  h.set('Service-Worker-Allowed','/');
  h.set('Cache-Control','no-store');
  if(h.has('location')){
    const location=new URL(h.get('location'),UPSTREAM);
    if(location.origin===UPSTREAM){
      const play=requestUrl?.origin===origin&&/^\/play\/([1-9]\d{0,19})$/.exec(requestUrl.pathname);
      const fps=requestUrl?.searchParams.get('fps');
      // The provider's public /play redirect drops FPS. Carry only that
      // scalar into the same game's canonical destination; keep no-referrer.
      if(play&&location.pathname==='/_/cGxheS5yb2Jsb3guY29t/games/start'&&location.searchParams.get('placeId')===play[1]&&
        (fps==='30'||fps==='60')&&!['30','60'].includes(location.searchParams.get('fps')))location.searchParams.set('fps',fps);
      h.set('location',origin+location.pathname+location.search);
    }
  }
  return h;
}

export function transformText(text,path,origin){
  text=text.replaceAll(UPSTREAM,origin);
  text=transformEngineLoader(text,path);
  if(path==='/_jar/sw.js'){
    const marker='\tself.addEventListener("install", () => self.skipWaiting());';
    if(!text.includes(marker)||!text.includes('async function viaJar(')||!text.includes('async function rbxApi('))throw new Error('Session worker changed');
    text=transformSessionIdentity(text);
    text=transformSessionState(text);
    // The provider now has a primary relay plus a fallback. Both must stay on
    // the provider: this origin serves assets, not WebSocket connections.
    const legacy='const WISP = new URL(location.href).searchParams.get("wisp") ||';
    const primary='const WISP = CFG.get("wisp") || `${WS_PROTO}://${location.host}/_rbx/wisp/`;';
    const fallback='const WISP_MAIN = `${WS_PROTO}://${location.host}/wisp/`;';
    if(text.includes(primary)&&text.includes(fallback)) {
      text=text.replace(primary,`const WISP = ${JSON.stringify('wss://api.spf50krem.com/_rbx/wisp/')};`);
      text=text.replace(fallback,`const WISP_MAIN = ${JSON.stringify(WISP)};`);
    } else if(text.includes(legacy)&&!text.includes('const WISP_MAIN')) {
      text=text.replace(legacy,`const WISP = ${JSON.stringify(WISP)} ||`);
    } else throw new Error('Session relay configuration changed');
    text=text.replace(marker,'('+sessionWorker.toString()+')(self, viaJar, rbxApi);\n'+marker);
    const proxyFetch='\tself.addEventListener("fetch", (e) => {\n\t\tconst sj = self.$scramjetController;\n\t\tif (sj && sj.shouldRoute(e)) e.respondWith(sj.route(e));\n\t});';
    if (!text.includes(proxyFetch)) throw new Error('Sign-in proxy routing changed');
    text=text.replace(proxyFetch,'('+proxySessionWorker.toString()+')(self);');
    text=text.replace(/function diag\(k, m\) \{\s*fetch\(`\/_diag[^\n]+\n\s*\}/,'function diag(k, m) {}');
  }
  if(path==='/_rbx/signin')text=transformSignin(text);
  if(path==='/_rbx/app/app.js'){
    text=transformAppSignout(text);
    text=transformAppSessionRecovery(text);
    text=transformAppLaunchPreferences(text);
  }
  if(path.startsWith('/_rbx/app/')&&text.includes('window.__RBX_JAR__=true')) {
    // Our bounded RPC bridge serves the app even before this page is claimed.
    // The provider's stop/ready/reload gate cancels app assets and can loop in
    // an embedded Safari context. Keep the actual app and jar configuration.
    const gate=/<script>\(function\(\)\{var sw=navigator\.serviceWorker;[\s\S]*?<\/script>/;
    if(!gate.test(text))throw new Error('Provider app startup changed');
    text=text.replace(gate,'<script>window.__kkeepSessionReady().catch(()=>{});</script>');
  }
  if(path==='/_rbx/signin'||path==='/_rbx/app/app.js'){
    // The warm-up downloads a second Wasm URL and buffers the entire engine.
    // Avoid competing with the real launch for iPad memory and bandwidth.
    text=text.replace('const c = navigator.connection;',`if (/iPad|iPhone|iPod|Android|Mobi/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return;\n    const c = navigator.connection;`);
  }
  // The provider embeds a second copy of hook.js in the engine stub. Patch both.
  if(path==='/hook.js'||text.includes('function install(scope, origin) {')){
    // A smaller memory allocation is not a compatible fallback for the same binary.
    const start=text.indexOf('    const NativeMemory = WebAssembly.Memory;');
    const end=text.indexOf('    // Lost GPU context:',start);
    if(start<0||end<0)throw new Error('Provider hook changed; refusing an unverified memory patch');
    text=text.slice(0,start)+text.slice(end);
    // Avoid the extra response branch and full download retry on iPad.
    text=text.replace('setupEngineCodeCache();','if (!window.__kkeepRuntime?.mobile) setupEngineCodeCache();');
    const legacyRelay='origin.replace(/^http/, "ws") + "/_rbx/wt?t="';
    const selectedRelay='origin.replace(/^http/, "ws") + wtPath + "?t="';
    const hasLegacy=text.includes(legacyRelay), hasSelected=text.includes(selectedRelay);
    const selectionStart=text.indexOf('      function RbxWT(url, opts) {');
    const selectionEnd=text.indexOf('      RbxWT.__rbxWt = true;',selectionStart);
    if(hasLegacy===hasSelected||selectionStart<0||selectionEnd<0)throw new Error('Provider relay changed');
    if(hasSelected&&!text.includes('let wtPath = "/_rbx/wt";'))throw new Error('Provider relay paths changed');
    text=text.slice(0,selectionStart)+RbxWT.toString()+'\n'+text.slice(selectionEnd);
    if(hasLegacy)text=text.replace(legacyRelay,JSON.stringify('wss://api.spf50krem.com')+' + "/_rbx/wt?t="');
    else {
      // The current provider chooses between its production and staging
      // relays. Preserve that choice and every target/certificate parameter,
      // but never send WebSockets to this asset-only origin or an unknown path.
      const path='((wtPath === "/_rbx/wt" || wtPath === "/_rbx/wt-stg") ? wtPath : (() => { throw new TypeError("Unsupported relay path"); })())';
      text=text.replace(selectedRelay,JSON.stringify('wss://api.spf50krem.com')+' + '+path+' + "?t="');
    }
    text=text.replace('typeof scope.WebTransport === "function" && !scope.WebTransport.__rbxWt','!scope.WebTransport?.__rbxWt');
    const installMarker='function install(scope, origin) {';
    if(!text.includes(installMarker))throw new Error('Provider launch preference routing changed');
    text=text.replace(installMarker,installMarker+'\n      ('+installTransportPreferences.toString()+')(scope);\n      ('+sessionClient.toString()+')(scope, origin);');
    const persistedChoice=String.raw`const m = scope.document && /[?&]wt=(auto|relay|native)\b/.exec(scope.location.search);`;
    if(text.split(persistedChoice).length!==2)throw new Error('Provider transport preference persistence changed');
    text=text.replace(persistedChoice,'const m = scope.document && ["auto", "relay", "native"].includes(scope.__kkeepTransportChoice) ? [null, scope.__kkeepTransportChoice] : null;');
    const directWorker=String.raw`if (/stub\.js/i.test(real) || /[?&]src=/i.test(real)) {
          super(url, options);
          return;
        }`;
    const blobWorker='            "(" + install.toString() + ")(self," + JSON.stringify(PROXY_ORIGIN) + ");\\n" +';
    if(!text.includes(directWorker)||!text.includes(blobWorker))throw new Error('Provider worker launch preference routing changed');
    text=text.replace(directWorker,String.raw`if (/stub\.js/i.test(real) || /[?&]src=/i.test(real)) {
          const choice = ["native", "auto", "relay"].includes(globalThis.__kkeepTransportChoice) ? globalThis.__kkeepTransportChoice : "";
          if (globalThis.__kkeepForceRelay === true || globalThis.__kkeepPreferRelay === true || choice) {
            const direct = new URL(real, globalThis.location.href);
            if (direct.origin === PROXY_ORIGIN) {
              // Preserve the engine's src value and the original Worker options.
              if (globalThis.__kkeepForceRelay === true) direct.searchParams.set('wt', 'relay');
              else if (choice) direct.searchParams.set('wt', choice);
              if (globalThis.__kkeepPreferRelay === true) direct.searchParams.set('kkeepIpadRelay', '1');
              super(direct.href, options);
              return;
            }
          }
          super(url, options);
          return;
        }`);
    text=text.replace(blobWorker,'            "self.__kkeepForceRelay=" + (globalThis.__kkeepForceRelay === true ? "true" : "false") + ";\\n" +\n'+
      '            "self.__kkeepPreferRelay=" + (globalThis.__kkeepPreferRelay === true ? "true" : "false") + ";\\n" +\n'+
      '            "self.__kkeepTransportChoice=" + JSON.stringify(["native", "auto", "relay"].includes(globalThis.__kkeepTransportChoice) ? globalThis.__kkeepTransportChoice : "") + ";\\n" +\n'+blobWorker);
    // An explicit launch choice must take effect even when Safari rejects
    // storage writes. Keep persistence and the provider's normal defaults.
    const preferences=[
      ['const chosen = ls.get(KEY);','const chosen = TIERS.concat("auto").includes(q.get("perf")) ? q.get("perf") : ls.get(KEY);'],
      ['const savedFps = ls.get(FPS_KEY);','const savedFps = /^(30|45|60|off)$/.test(q.get("fps") || "") ? q.get("fps") : ls.get(FPS_KEY);'],
      ['const pixels = ls.get(RES_KEY) === "low" ? 1024 * 576 : ls.get(RES_KEY) === "full" ? Infinity',
        'const selectedResolution = /^(full|low|auto)$/.test(q.get("res") || "") ? q.get("res") : ls.get(RES_KEY);\n    const pixels = selectedResolution === "low" ? 1024 * 576 : selectedResolution === "full" ? Infinity'],
      ['const gpuPick = /^(webgpu|webgl)$/.test(ls.get(GPU_KEY) || "") ? ls.get(GPU_KEY) : null;',
        'const requestedGpu = /^(webgpu|webgl|auto)$/.test(q.get("gpu") || "") ? q.get("gpu") : ls.get(GPU_KEY);\n    const gpuPick = /^(webgpu|webgl)$/.test(requestedGpu || "") ? requestedGpu : null;'],
    ];
    for(const [from,to] of preferences){
      if(!text.includes(from))throw new Error('Provider launch performance preferences changed');
      text=text.replace(from,to);
    }
    const gpuErrorListener='d.addEventListener("uncapturederror", (e) => { if (n++ < 3) diag("gpu", "error: " + ((e.error && e.error.message) || e.error)); });';
    if(text.split(gpuErrorListener).length!==2)throw new Error('Provider WebGPU error handling changed');
    text=text.replace(gpuErrorListener,()=>`d.addEventListener("uncapturederror", (e) => { if (n === 0) (${reportLocalWebGPUError.toString()})(e.error); if (n++ < 3) diag("gpu", "error: " + ((e.error && e.error.message) || e.error)); });`);
    // Use the provider's own drawing-buffer ratio instead of shrinking and
    // magnifying the entire iframe while the engine is starting. Keep its
    // desktop/full-resolution policy and normal canvas resize callbacks.
    const ratioGate='    if (dprCap !== Infinity || pixels !== Infinity) {';
    const ratioReturn='            return Math.round(d * 1000) / 1000;';
    if(text.split(ratioGate).length!==2||text.split(ratioReturn).length!==2)throw new Error('Provider canvas pixel ratio changed');
    text=text.replace(ratioGate,mobileCanvasPixelRatio.toString()+'\n'+
      '    if (dprCap !== Infinity || pixels !== Infinity || window.__kkeepRuntime?.mobile === true && selectedResolution !== "full") {');
    text=text.replace(ratioReturn,
      '            return mobileCanvasPixelRatio(Math.round(d * 1000) / 1000, window.innerWidth, window.innerHeight, window.__kkeepRuntime?.mobile, selectedResolution);');
    // The player now requests iOS/Mac/Android/Windows-specific flag sets.
    // Carry the existing graphics preference on those exact public routes too.
    const graphicsMatch='/\\/WebClientApp(?:[/?]|$)/i.test(rest)';
    if(!text.includes(graphicsMatch))throw new Error('Provider graphics settings routing changed');
    text=text.replace(graphicsMatch,graphicsSettingsPath.toString()+'.test(rest.split(/[?#]/,1)[0])');
    const requestRewrite = 'if (input && input.url) return f(new Request(reroute(input.url), input), init);';
    if (!text.includes(requestRewrite)) throw new Error('Provider fetch hook changed');
    text = text.replace(requestRewrite, `if (input instanceof Request) {
          const url = reroute(input.url);
          if (url === input.url) return f(input, init);
          const request = new Request(input, init);
          const options = {method:request.method, headers:request.headers, signal:request.signal,
            credentials:'same-origin', redirect:request.redirect, cache:request.cache};
          if (!request.body) return f(url, options);
          return request.arrayBuffer().then(body => f(url, {...options, body}));
        }`);
    // Do not put raw browser errors/session URLs in request query strings.
    text=text.replace(/scope\.fetch && scope\.fetch\(origin \+ "\/_diag\?k="[\s\S]*?\{ method: "POST", keepalive: true \}\);/,'void 0;');
    text=text.replace(/scope\.fetch\(origin \+ "\/_diag\?k=wt&m="[^;]+;/,'void 0;');
  }
  // Each profile belongs to an inspected binary and its exact loader layout.
  // Do not apply an old heap override to a new, unverified engine upload.
  const engine=/^\/_\/c2V0dXAucmJ4Y2RuLmNvbQ\/webclient\/(version-[a-f0-9]{16})-RobloxWebClient\/(WasmPlayer|WebClient)\.js$/.exec(path);
  const profile=engine&&engineProfiles[engine[1]];
  if(profile&&engine[2]==='WasmPlayer'){
    const flags=profile.memoryFlags, name=profile.mobileFunction;
    const setting=`parseInt(${flags}.applicationSettings.FIntWasmMemoryPages??"32768")`;
    const mobile=`function ${name}(){return navigator.userAgent.includes("Android")}`;
    if(!text.includes(setting)||!text.includes(mobile))throw new Error('Engine loader changed');
    text=text.replace(setting,`parseInt((window.__kkeepRuntime?.mobile&&(${flags}.applicationSettings.FIntWasmMemoryPages="${profile.memoryPages}"),${flags}.applicationSettings.FIntWasmMemoryPages??"32768"))`);
    text=text.replace(mobile,`function ${name}(){return window.__kkeepRuntime?.mobile??navigator.userAgent.includes("Android")}`);
    if(engine[1]==='version-1ef59424f70d4932'){
      const device='s.isMobileDevice=()=>R';
      if(text.split(device).length!==2)throw new Error('Engine mobile classification changed');
      // The native is_mobile_browser import reads this separate module
      // predicate. Safari's desktop-UA iPad must agree with the loader's
      // mobile platform selection. Keep R and its separate DPR policy intact,
      // including the player's explicit full-resolution choice.
      text=text.replace(device,'s.isMobileDevice=()=>window.__kkeepRuntime?.mobile??R');
      text=transformPlayerFailures(text,path);
      text=transformPlayerCanvas(text);
      text=transformPlayerPresentation(text);
      text=transformPlayerGraphicsRecovery(text);
      text=transformPlayerLocaleDeadline(text);
    }
  }
  if(engine?.[1]==='version-1ef59424f70d4932'&&engine[2]==='WebClient'){
    const caught='catch(a){console.error("main_loop_iteration threw",a),f.reportEngineError?.(a)}e.port2.postMessage(0)';
    if(text.split(caught).length!==2)throw new Error('Engine frame failure handling changed');
    text=text.replace(caught,()=>`catch(a){console.error("main_loop_iteration threw",a),f.reportEngineError?.(a);(${reportGameFrameFailure.toString()})(f,a)}e.port2.postMessage(0)`);
    text=transformNativeEngineOutput(text);
    text=transformNativePresentation(text);
  }
  // Engine workers have their own global WebTransport. Install there too.
  if(profile&&engine[2]==='WebClient')text='('+sessionClient.toString()+')(globalThis,location.origin);('+transportBootstrap.toString()+')();\n'+text;
  if((path.startsWith('/_rbx/app/')||path==='/_rbx/signin'||/\/games\/start$/.test(path))&&text.includes('<head>')){
    text=text.replaceAll('"/_jar/sw.js"','"/_jar/sw.js?kk=join18"');
    text=text.replace('<head>','<head><script src="/kkeep-session.js"></script><script src="/kkeep-preferences.js"></script>');
    if(path==='/_rbx/signin')text=text.replace('<head>','<head><script src="/kkeep-signin.js"></script>');
  }
  if(/\/games\/start$/.test(path)&&text.includes('<head>'))text=text.replace('<head>','<head><script src="/kkeep-runtime.js"></script>');
  return text;
}
