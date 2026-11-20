/* injected by local dev proxy */
"use strict";
// Client hook for the local dev proxy.
//
// Reroutes Roblox XHR / fetch / importScripts through our same-origin proxy so
// they carry the server-held session and dodge CORS. Runs on the proxied start
// page and inside the engine's workers. The two "un-gate" locks (Roblox/Darwin
// header, injected gameFqdn) are applied server-side by server.mjs. WebTransport
// is deliberately left alone: the engine connects directly to the injected .34
// gameFqdn, which must NOT be proxied.
//
// The engine loader worker (assets/webclient/stub.js) is a special case. It
// reads its OWN `?src=` query to choose the engine build and validates that the
// build URL starts with https://setup.rbxcdn.com/webclient/. So we must NOT
// blob-wrap it (that would blank self.location.search → "[stub] missing src"),
// and we must NOT rewrite its src (the stub rejects a proxied URL). The engine
// therefore loads straight from the CDN, at whatever version the page asked for.

(() => {
  const PROXY_ORIGIN =
    (typeof location !== "undefined" && /^https?:/.test(location.origin) && location.origin) ||
    globalThis.__PROXY_ORIGIN__ || "http://localhost:8790";

  // Self-contained (no closure deps) so its .toString() works verbatim inside a
  // stringified worker bootstrap.
  function install(scope, origin) {
    const ROBLOX = /^https:\/\/([a-z0-9.-]*(?:roblox\.com|rbxcdn\.com))(\/.*)?$/i;
    const reroute = (raw) => {
      try {
        const u = String(raw);
        const m = u.match(ROBLOX);
        if (!m) return raw;
        // setup.rbxcdn.com: keep the ~96 MB .wasm streaming direct from the CDN
        // (fast, range-capable). Route the smaller engine scripts
        // (WebClient.js/WasmPlayer.js/audio-processor) through us so they're
        // same-origin and their errors are readable instead of opaque
        // cross-origin "[object Event]". Everything else (gamejoin/apis/auth,
        // thumbnails, ...) routes through us for the session + CORS.
        if (/^setup\.rbxcdn\.com$/i.test(m[1]) && /\.wasm(\?|$)/i.test(u)) return raw;
        // Host base64url-encoded, so "roblox" never shows in our URLs (school
        // filter extensions block on keywords even on our own host).
        const tok = btoa(m[1].toLowerCase()).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        let rest = m[2] || "/";
        // Engine FFlags: carry the performance profile in the settings URL as
        // well as the cookies. Cookies don't reach us in a third-party iframe
        // on Safari (or with third-party cookies blocked), so those players
        // were getting no profile. The server strips these before Roblox.
        const perf = scope.__rbxPerf;
        if (perf && perf.tier && /^clientsettingscdn\.roblox\.com$/i.test(m[1]) && /\/WebClientApp(?:[/?]|$)/i.test(rest)) {
          rest += (rest.indexOf("?") < 0 ? "?" : "&") + "rbxperf=" + perf.tier
            + (/^(30|45|60)$/.test(String(perf.fps)) ? "&rbxfps=" + perf.fps : "")
            + (perf.kpx3d ? "&rbx3d=" + perf.kpx3d : "")
            + (perf.lowcore ? "&rbxlow=1" : "")
            + (perf.smart ? "&rbxsmart=1" : "")
            + (perf.gpu === "webgl" || perf.gpu === "webgpu" ? "&rbxgpu=" + perf.gpu : "");
        }
        return origin + "/_/" + tok + rest;
      } catch (e) { return raw; }
    };
    // Error beacon: forward real error detail to the proxy so it shows up in the
    // server log, even from worker/cross-origin contexts the console obscures.
    if (scope.addEventListener && !scope.__rbxDiag) {
      scope.__rbxDiag = true;
      const beacon = (k, m) => {
        try {
          scope.fetch && scope.fetch(origin + "/_diag?k=" + encodeURIComponent(k) +
            "&m=" + encodeURIComponent(String(m).slice(0, 400)), { method: "POST", keepalive: true });
        } catch (e) { /* ignore */ }
      };
      scope.addEventListener("error", (e) => beacon("err",
        (e && (e.message || (e.error && (e.error.stack || e.error.message)) || "")) +
        " @ " + (e && (e.filename || "")) + ":" + (e && (e.lineno || ""))));
      scope.addEventListener("unhandledrejection", (e) => beacon("reject",
        e && e.reason && (e.reason.stack || e.reason.message || e.reason)));
    }
    const X = scope.XMLHttpRequest;
    if (X && X.prototype && !X.prototype.__rbxHooked) {
      const open = X.prototype.open;
      X.prototype.open = function (method, url) {
        const args = [].slice.call(arguments);
        args[1] = reroute(url);
        return open.apply(this, args);
      };
      X.prototype.__rbxHooked = true;
    }
    if (typeof scope.fetch === "function" && !scope.fetch.__rbxHooked) {
      const f = scope.fetch.bind(scope);
      const wrapped = (input, init) => {
        if (typeof input === "string") return f(reroute(input), init);
        if (input && input.url) return f(new Request(reroute(input.url), input), init);
        return f(input, init);
      };
      wrapped.__rbxHooked = true;
      scope.fetch = wrapped;
    }
    if (typeof scope.importScripts === "function" && !scope.importScripts.__rbxHooked) {
      const orig = scope.importScripts.bind(scope);
      const wrapped = function () {
        return orig.apply(null, [].map.call(arguments, reroute));
      };
      wrapped.__rbxHooked = true;
      // In a real WorkerGlobalScope importScripts is a non-writable prototype
      // method, so a plain `scope.importScripts = wrapped` throws under "use
      // strict" and the wrap silently never installs. Force it with
      // defineProperty, and don't let a failure abort the rest of install().
      try {
        scope.importScripts = wrapped;
        if (scope.importScripts !== wrapped) throw new Error("noop assign");
      } catch (e) {
        try {
          Object.defineProperty(scope, "importScripts",
            { value: wrapped, writable: true, configurable: true });
        } catch (e2) { /* give up on this scope's importScripts */ }
      }
    }

    // ---- WebTransport, with a relay for networks that block it ----
    // The engine opens its game session with `new WebTransport(url, opts)`
    // straight to Roblox's game server over QUIC/UDP. Some networks block UDP,
    // QUIC or Roblox's address space, so this wraps it: native first, and if it
    // hasn't connected in 5 s the same session is opened through our server
    // (/_rbx/wt, wt-relay) over one WebSocket, which looks like ordinary HTTPS
    // to the network. The choice is remembered for 30 minutes (IndexedDB, shared
    // with the engine workers); ?wt=relay|native|auto on the game page forces it.
    if (typeof scope.WebTransport === "function" && !scope.WebTransport.__rbxWt && typeof scope.WebSocket === "function") {
      const Native = scope.WebTransport;
      const NATIVE_MS = 5000, REMEMBER_MS = 30 * 60 * 1000, MAX_DG_BUFFER = 65536;
      const b64u = (u8) => {
        let t = ""; for (let i = 0; i < u8.length; i++) t += String.fromCharCode(u8[i]);
        return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      };
      const b64uStr = (str) => b64u(new TextEncoder().encode(str));
      const modeDb = (op, val, key = "mode") => new Promise((res) => {
        try {
          const r = scope.indexedDB.open("rbxwt", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("kv");
          r.onsuccess = () => {
            try {
              const st = r.result.transaction("kv", op === "get" ? "readwrite" : "readwrite").objectStore("kv");
              const q = op === "get" ? st.get(key) : st.put(val, key);
              q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
            } catch (e) { res(undefined); }
          };
          r.onerror = () => res(undefined);
        } catch (e) { res(undefined); }
      });
      const wtLog = (m) => {
        try { scope.fetch(origin + "/_diag?k=wt&m=" + encodeURIComponent(((wtPath === "/_rbx/wt-stg" ? "[stg] " : "") + m).slice(0, 300)), { method: "POST", keepalive: true }); } catch (e) { /* ignore */ }
      };
      // Page: ?wt= on the game page sets the mode for the next sessions.
      try {
        const m = scope.document && /[?&]wt=(auto|relay|native)\b/.exec(scope.location.search);
        if (m) modeDb("put", m[1] === "auto" ? { mode: "auto" } : { mode: m[1], at: Date.now(), forced: true });
      } catch (e) { /* not a page */ }

      // Roblox staging (game opened from /_rbx/app-staging/) uses its own relay,
      // /_rbx/wt-stg (rbxweb-wt-relay-stg, egress through Mullvad). The page
      // notes it in IndexedDB so the engine workers (no sessionStorage) know.
      let wtPath = "/_rbx/wt";
      try {
        if (scope.document) {
          const stg = scope.sessionStorage.getItem("rbxweb.appPath") === "/_rbx/app-staging/";
          if (stg) wtPath = "/_rbx/wt-stg";
          modeDb("put", stg, "stage");
        } else modeDb("get", undefined, "stage").then((v) => { if (v === true) wtPath = "/_rbx/wt-stg"; });
      } catch (e) { /* storage blocked: normal relay */ }

      // Latest network counters to the page's FPS report (engine workers have
      // no DOM, so over a BroadcastChannel).
      let netCh = null;
      const netPost = (n) => {
        if (wtPath !== "/_rbx/wt-stg") return; // Roblox staging only for now
        try { netCh = netCh || new scope.BroadcastChannel("rbxweb-net"); netCh.postMessage(Object.assign({}, n, { jit: Math.round(n.jit * 10) / 10 })); } catch (e) { /* no channel */ }
      };

      // The same session over a WebSocket to wt-relay. Frames: [0] datagram,
      // [1][sid u32le] stream data, [2][sid][uni] server-opened stream,
      // [3][sid] stream end, [4] accepted, [5] failed.
      function RelayWT(url, opts) {
        const self = this;
        const u = new URL(String(url));
        const hashes = ((opts && opts.serverCertificateHashes) || []).map((h) => {
          const v = h.value; return b64u(v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        });
        const wsUrl = origin.replace(/^http/, "ws") + wtPath + "?t=" + b64uStr(u.host.includes(":") ? u.host : u.host + ":443") +
          "&p=" + b64uStr(u.pathname + u.search) + (hashes.length ? "&h=" + hashes.join(",") : "");
        const ws = new scope.WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        let ok = false, nextSid = 1, dgCtl = null, inBi = null, inUni = null;
        const pending = [], streams = new Map();
        const send = (f) => { if (ok && ws.readyState === 1) ws.send(f); else pending.push(f); };
        self.ready = new Promise((res, rej) => { self._res = res; self._rej = rej; ws.onerror = () => rej(new Error("relay unreachable")); });
        self.closed = new Promise((res) => ws.addEventListener("close", () => res({})));
        self.ready.catch(() => {});
        const dgIn = new ReadableStream({ start: (c) => { dgCtl = c; } });
        // Network counters for the FPS report (idea from RobloxWebport's stats
        // overlay): datagrams each way, stale ones dropped, arrival jitter.
        const net = { how: "relay", path: wtPath, inDg: 0, inDrop: 0, outDg: 0, outDrop: 0, jit: 0 };
        let lastIn = 0, avgGap = 0;
        const netTimer = setInterval(() => netPost(net), 10000);
        ws.addEventListener("close", () => { clearInterval(netTimer); netPost(net); });
        const dgOut = new WritableStream({
          write: (chunk) => {
            if (ws.bufferedAmount > MAX_DG_BUFFER) { net.outDrop++; return; }  // lossy, like UDP: drop stale
            net.outDg++;
            const d = new Uint8Array(chunk.buffer ? chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) : chunk);
            const f = new Uint8Array(1 + d.length); f[0] = 0; f.set(d, 1); send(f);
          },
          close: () => { try { ws.close(); } catch (e) { /* closed */ } },
        });
        self.datagrams = { readable: dgIn, writable: dgOut, incomingMaxAge: null, outgoingMaxAge: null, maxDatagramSize: 1000 };
        self.incomingBidirectionalStreams = new ReadableStream({ start: (c) => { inBi = c; } });
        self.incomingUnidirectionalStreams = new ReadableStream({ start: (c) => { inUni = c; } });
        const mk = (sid) => {
          const st = { ctl: null };
          st.readable = new ReadableStream({ start: (c) => { st.ctl = c; } });
          st.writable = new WritableStream({
            write: (chunk) => {
              const d = new Uint8Array(chunk.buffer ? chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) : chunk);
              const f = new Uint8Array(5 + d.length); f[0] = 1; new DataView(f.buffer).setUint32(1, sid, true); f.set(d, 5); send(f);
            },
            close: () => { const f = new Uint8Array(5); f[0] = 3; new DataView(f.buffer).setUint32(1, sid, true); send(f); },
          });
          streams.set(sid, st); return st;
        };
        self.createBidirectionalStream = () => Promise.resolve(mk(nextSid++ >>> 0));
        self.createUnidirectionalStream = () => Promise.resolve(mk(((0x80000000 | nextSid++) >>> 0)).writable);
        ws.onmessage = (ev) => {
          try {
            const d = new Uint8Array(ev.data), t = d[0], dv = new DataView(ev.data);
            if (t === 0) {
              const now = performance.now();
              if (lastIn) { const gap = now - lastIn; avgGap += (gap - avgGap) / 32; net.jit += (Math.abs(gap - avgGap) - net.jit) / 16; }
              lastIn = now;
              if (dgCtl && dgCtl.desiredSize > 0) { net.inDg++; dgCtl.enqueue(d.subarray(1)); } else net.inDrop++;
            }
            else if (t === 1 && d.length >= 5) { const st = streams.get(dv.getUint32(1, true)); if (st) st.ctl.enqueue(d.subarray(5)); }
            else if (t === 2 && d.length >= 5) {
              const sid = dv.getUint32(1, true), uni = d.length >= 6 && d[5];
              const st = mk(sid);
              if (uni) inUni.enqueue(st.readable); else inBi.enqueue({ readable: st.readable, writable: st.writable });
            } else if (t === 3 && d.length >= 5) {
              const st = streams.get(dv.getUint32(1, true) & 0x7fffffff); if (st) try { st.ctl.close(); } catch (e) { /* closed */ }
            } else if (t === 4) { ok = true; self._res(); for (const f of pending.splice(0)) ws.send(f); }
            else if (t === 5) self._rej(new Error("relay: game session failed"));
          } catch (e) { /* bad frame */ }
        };
        ws.onclose = () => { self._rej(new Error("relay closed")); try { dgCtl.close(); } catch (e) { /* closed */ } };
        self.close = () => { try { ws.close(); } catch (e) { /* closed */ } };
      }

      // What the engine gets: the same object either way; every property goes to
      // whichever transport got connected.
      function RbxWT(url, opts) {
        const self = this;
        let target = null, resolveReady, rejectReady, resolveClosed;
        self.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
        self.closed = new Promise((res) => { resolveClosed = res; });
        self.ready.catch(() => {});
        const never = () => new ReadableStream({});
        const gate = new Promise((res) => { self._gate = res; });
        const adopt = (t, how) => {
          target = t; self.how = how;
          t.closed.then(resolveClosed, resolveClosed);
          resolveReady(); self._gate(t);
        };
        const viaRelay = (why) => {
          wtLog("relay (" + why + ")");
          let r;
          try { r = new RelayWT(url, opts); } catch (e) { rejectReady(e); return; }
          r.ready.then(() => adopt(r, "relay"), (e) => { wtLog("relay failed: " + (e && e.message)); rejectReady(e); });
        };
        (async () => {
          const saved = await modeDb("get");
          const fresh = saved && saved.at && Date.now() - saved.at < REMEMBER_MS;
          if (saved && saved.mode === "relay" && fresh) return viaRelay("remembered");
          let n;
          try { n = opts ? new Native(url, opts) : new Native(url); } catch (e) { modeDb("put", { mode: "relay", at: Date.now() }); return viaRelay("native threw"); }
          const timer = setTimeout(() => {
            if (target) return;
            try { n.close(); } catch (e) { /* closing */ }
            if (saved && saved.mode === "native" && saved.forced) return rejectReady(new Error("native WebTransport timed out"));
            modeDb("put", { mode: "relay", at: Date.now() });
            viaRelay("native timed out");
          }, NATIVE_MS);
          n.ready.then(() => { if (target) return; clearTimeout(timer); wtLog("native ok"); adopt(n, "native"); netPost({ how: "native", jit: 0 }); },
            (e) => {
              clearTimeout(timer);
              if (target) return;
              if (saved && saved.mode === "native" && saved.forced) return rejectReady(e);
              modeDb("put", { mode: "relay", at: Date.now() });
              viaRelay("native refused: " + String((e && (e.message || e.name)) || e).slice(0, 120));
            });
        })();
        const live = () => target;
        Object.defineProperty(self, "datagrams", { get: () => (live() ? live().datagrams : { readable: undefined, writable: undefined, maxDatagramSize: 0 }) });
        Object.defineProperty(self, "incomingUnidirectionalStreams", { get: () => (live() ? live().incomingUnidirectionalStreams : never()) });
        Object.defineProperty(self, "incomingBidirectionalStreams", { get: () => (live() ? live().incomingBidirectionalStreams : never()) });
        self.createBidirectionalStream = (o) => gate.then((t) => t.createBidirectionalStream(o));
        self.createUnidirectionalStream = (o) => gate.then((t) => t.createUnidirectionalStream(o));
        self.close = (info) => { try { if (target) target.close(info); else { rejectReady(new Error("closed")); resolveClosed({}); } } catch (e) { /* closed */ } };
      }
      RbxWT.__rbxWt = true;
      try { scope.WebTransport = RbxWT; } catch (e) { /* read-only */ }
    }
    return reroute;
  }

  const reroute = install(globalThis, PROXY_ORIGIN);

  // ---- Performance profile for low-end hardware (page only, not workers) ----
  //
  // One of three tiers, chosen from the device (or set by hand), shapes how
  // heavy the client is:
  //   performance  4 GB / <=4-core machines (most school Chromebooks)
  //   balanced     mid-range
  //   quality      untouched
  // The proxy applies the engine-side half (FFlags: quality level, grass,
  // texture mips, MSAA, FPS cap — see perf.mjs) from the `rbxperf`/`rbxfps`
  // cookies set here. This file applies the browser-side half.
  //
  // Manual override: ?perf=performance|balanced|quality|auto and ?fps=30|45|60|off
  // on any proxied page (remembered), or window.__rbxPerf.set({ tier, fps }).
  if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__rbxPerf) {
    try { setupPerf(); } catch (e) { /* never let tuning break the page */ }
  }

  function setupPerf() {
    const TIERS = ["performance", "balanced", "quality"];
    const KEY = "rbxweb.perf", FPS_KEY = "rbxweb.fps", LOST_KEY = "rbxweb.lostContext";
    const RES_KEY = "rbxweb.res", SEEN_KEY = "rbxweb.engineSeen", RES3D_KEY = "rbxweb.res3d";
    const RES3D_AUTO_KEY = "rbxweb.res3dAuto";
    const GPU_KEY = "rbxweb.gpu", GPU_AB_KEY = "rbxweb.gpuab", GPU_BAD_KEY = "rbxweb.gpuBad";
    const RES3D = /^(720|540|480|360)$/;
    const ls = {
      get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
      set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    };
    const q = new URLSearchParams(location.search);
    if (q.has("perf")) ls.set(KEY, TIERS.concat("auto").includes(q.get("perf")) ? q.get("perf") : null);
    // "off" is remembered too, so it isn't replaced by the low-end default of 30.
    if (q.has("fps")) ls.set(FPS_KEY, /^(30|45|60|off)$/.test(q.get("fps")) ? q.get("fps") : null);

    const mem = navigator.deviceMemory || 0;           // Chrome only; capped at 8
    const cores = navigator.hardwareConcurrency || 0;
    const autoTier = () => {
      let i = (mem && mem <= 4) || (cores && cores <= 4) ? 0
        : (mem && mem <= 8) || (cores && cores <= 8) ? 1 : 2;
      // The GPU gave out last time (context lost): start a step lighter for a day.
      const lost = Number(ls.get(LOST_KEY)) || 0;
      if (lost && Date.now() - lost < 864e5) i = Math.max(0, i - 1);
      return TIERS[i];
    };
    const chosen = ls.get(KEY);
    const tier = TIERS.includes(chosen) ? chosen : autoTier();
    // Memory the engine plans for (2026-11-17, idea from RobloxWebport): the
    // stock player reports hostInfo.memoryMB = deviceMemory x 1024 (4-8 GB on a
    // Chromebook), but the heap is a fixed 2 GB, so the engine's memory-pressure
    // shedding (fractions of memoryMB) only starts once the heap is nearly full:
    // stutters and crashes on low-end machines. Report ~1.25 x the heap (2.5 GB)
    // so it sheds just before the cap. Staging only for now; ?rbxmem=stock|fit.
    let memMode = "stock", stgPage = false;
    try { stgPage = sessionStorage.getItem("rbxweb.appPath") === "/_rbx/app-staging/"; } catch (e) { /* storage blocked */ }
    try {
      const stg = stgPage;
      memMode = /^(stock|fit)$/.test(q.get("rbxmem") || "") ? q.get("rbxmem") : stg ? "fit" : "stock";
      if (memMode === "fit" && mem > 2.5) Object.defineProperty(navigator, "deviceMemory", { configurable: true, get: () => 2.5 });
    } catch (e) { memMode = "stock"; }
    // Weak machines (performance tier) default to a 30 fps cap: a steady 30
    // is smoother than an uneven 15-25, and halves the heat. ?fps=45|60 (or
    // ?fps=off) overrides it and is remembered.
    const savedFps = ls.get(FPS_KEY);
    // Frame pacer (staging, 2026-11-17; ?pace=auto|60|30|off): when it runs,
    // it owns the frame rate, so the engine isn't also told to aim for 30.
    const paceQ = q.get("pace");
    const pace = /^(auto|60|30|off)$/.test(paceQ || "") ? paceQ : stgPage ? "auto" : "off";
    // (Until 2026-11-18 the performance tier was capped at 30 by default; its
    // reports showed 4-core Chromebooks held at that cap. Now no cap unless
    // the player picks one: ?fps=30|45|60, remembered.)
    const fps = savedFps === "off" ? null : savedFps || null;
    if (pace !== "off") setupPacer(pace);
    const cookie = (k, v) => { document.cookie = `${k}=${v || ""}; path=/; SameSite=Lax; max-age=${v ? 31536000 : 0}`; };
    cookie("rbxperf", tier);
    cookie("rbxfps", fps);

    // Render resolution. The WebClient sizes its canvas as CSS size × its
    // "effective pixel ratio", which it takes from window.devicePixelRatio
    // (it only caps phones). Two limits per tier:
    //   dprCap  — no HiDPI rendering on weak GPUs
    //   pixels  — a budget for the whole canvas, so a 1080p panel on a
    //             Celeron renders ~1366×768 worth of pixels and upscales,
    //             instead of 2 million pixels a frame. A 1366×768 screen
    //             (most school Chromebooks) is unaffected.
    // Roblox's automatic dynamic resolution still adapts below this.
    // ?res=full (remembered) turns the budget off; ?res=auto restores it.
    if (q.has("res")) ls.set(RES_KEY, /^(full|low)$/.test(q.get("res")) ? q.get("res") : null);
    // 3D resolution (?res3d=720|540|480|360, remembered; ?res3d=auto clears):
    // the engine's own render-size override (DFIntDebugDynamicRenderKiloPixels,
    // in kilopixels at 16:9). Only the 3D scene shrinks; menus and text stay
    // at full resolution. The server sets the flag from the settings URL.
    if (q.has("res3d")) ls.set(RES3D_KEY, RES3D.test(q.get("res3d")) ? q.get("res3d") : null);
    // 2-core Chromebooks (Celeron N4000-class; 2026-11-17, Roblox staging):
    // the engine runs a fixed 3+ background task threads next to the render
    // loop, audio and our asset worker, all on 2 cores, and its automatic
    // resolution scaling never kicks in on the web (it needs GPU timers Chrome
    // doesn't give WebGL). So: fewer engine threads (perf.mjs LOWCORE) and a
    // 480p 3D scene unless a resolution was picked. ?rbxlow=1|0 forces it.
    const lowQ = q.get("rbxlow");
    // Live for everyone since 2026-11-18 (was staging only): 2-core machines
    // ran 11-17 fps with 25-70% stutter.
    const lowcore = lowQ === "1" || (lowQ !== "0" && tier === "performance" && !!cores && cores <= 2);
    const res3dPicked = RES3D.test(ls.get(RES3D_KEY) || "") ? ls.get(RES3D_KEY) : null;
    // "Smart" settings (staging; ?smart=0 off): adaptive quality + resolution
    // instead of fixed-low (perf.mjs smartOverrides), so no forced 480p.
    const smart = stgPage && q.get("smart") !== "0" || q.get("smart") === "1";
    // Automatic 3D resolution (2026-11-18): after a game ran under ~22 fps,
    // the next launch renders the 3D scene a step smaller; after a fast one
    // (55+), a step bigger again. Menus and text keep full resolution. A
    // resolution picked by the player always wins. See the fps probe.
    const res3dAuto = RES3D.test(ls.get(RES3D_AUTO_KEY) || "") ? ls.get(RES3D_AUTO_KEY) : null;
    const res3dBase = lowcore && !smart ? "480" : null;
    const res3d = res3dPicked || (res3dAuto && (!res3dBase || +res3dAuto < +res3dBase) ? res3dAuto : res3dBase);
    const kpx3d = res3d ? Math.floor(Math.round(res3d * 16 / 9) * res3d / 1000) : null;
    const dprCap = { performance: 1, balanced: 1.5, quality: Infinity }[tier];
    // "low": a smaller picture (1024×576 worth of pixels, upscaled) for the slowest machines.
    const pixels = ls.get(RES_KEY) === "low" ? 1024 * 576 : ls.get(RES_KEY) === "full" ? Infinity
      : { performance: 1366 * 768, balanced: 1920 * 1080, quality: Infinity }[tier];
    // Renderer (2026-11-18). Roblox switched the web engine to prefer WebGPU
    // (FFlagWasmPreferWebGPU, server-side, no new version). Until the frame
    // rate and crash numbers say where it wins, half of players stay on WebGL2:
    // one random bucket per browser, kept. A browser whose WebGPU lost its
    // device or is software-only goes to WebGL2 for a day. ?gpu=webgpu|webgl
    // picks one (remembered), ?gpu=auto clears it. perf.mjs applies it.
    if (q.has("gpu")) ls.set(GPU_KEY, /^(webgpu|webgl)$/.test(q.get("gpu")) ? q.get("gpu") : null);
    // The 50/50 ended 2026-11-18 after ~3,000 reports: on the same machines
    // WebGPU ran faster and stuttered far less (4 cores: 29 vs 24 fps, 4.7% vs
    // 16% stutter), so everyone gets WebGPU (Roblox's own choice) unless it
    // proved bad on this browser or the player picked WebGL2.
    const gpuAb = "webgpu";
    const gpuPick = /^(webgpu|webgl)$/.test(ls.get(GPU_KEY) || "") ? ls.get(GPU_KEY) : null;
    const gpuBad = Date.now() - (Number(ls.get(GPU_BAD_KEY)) || 0) < 864e5;
    const gpu = !("gpu" in navigator) ? "webgl" : gpuPick || (gpuBad ? "webgl" : gpuAb);
    window.__rbxPerf = {
      tier, auto: !TIERS.includes(chosen), fps: fps || null, dprCap, pixels, res3d, kpx3d, lowcore, pace, smart, res3dAuto,
      gpu, gpuWhy: !("gpu" in navigator) ? "none" : gpuPick ? "picked" : gpuBad ? "bad" : "default",
      device: { memoryGB: mem || null, cores: cores || null },
      set({ tier: t, fps: f, res: r } = {}) {
        if (t !== undefined) ls.set(KEY, TIERS.concat("auto").includes(t) ? t : null);
        if (f !== undefined) ls.set(FPS_KEY, /^(30|45|60|off)$/.test(String(f)) ? String(f) : null);
        if (r !== undefined) ls.set(RES_KEY, /^(full|low)$/.test(String(r)) ? r : null);
        if (arguments[0] && "res3d" in arguments[0]) ls.set(RES3D_KEY, RES3D.test(String(arguments[0].res3d)) ? String(arguments[0].res3d) : null);
      },
    };

    // Only the game page gets the engine tweaks; login and other proxied
    // pages just carry the cookies.
    const tok = (location.pathname.match(/^\/_\/([A-Za-z0-9._-]+)\//) || [])[1] || "";
    let pageHost = "";
    try {
      pageHost = (tok.includes(".") ? tok : atob(tok.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((tok.length + 3) % 4))).toLowerCase();
    } catch (e) { /* not a proxied page */ }
    if (pageHost !== "play.roblox.com") return;

    // Leaving a game: the player runs `window.close(); location.replace("about:blank")`,
    // meant for a popup tab. Here it's in our frame, so that left a black page.
    // Go back to the game's page in the app instead; the throw stops the
    // about:blank replace that follows (it would win over ours).
    const placeQ = new URLSearchParams(location.search).get("placeId");
    const placeId = placeQ && /^\d+$/.test(placeQ) ? placeQ : "";
    window.close = function () {
      gameOver("leave");
      let app = "/_rbx/app/";
      try { const a = sessionStorage.getItem("rbxweb.appPath"); if (/^\/_rbx\/app(-staging)?\/$/.test(a || "")) app = a; } catch (e) { /* storage blocked */ }
      location.replace(app + (placeId ? "#/game/" + placeId : ""));
      throw new Error("rbxweb: left the game");
    };

    // Usage counts: tell the Achroma Roblox tab (our parent) a game started,
    // and when it ended, why and after how long. It passes them on to
    // Achroma's analytics; nothing else is sent.
    const started = Date.now();
    let over = false;
    // (not while the page is about to reload itself to get its service worker)
    const counting = !navigator.serviceWorker || !!navigator.serviceWorker.controller;
    const tell = (msg) => { try { if (counting && parent !== window) parent.postMessage(Object.assign({ type: "webblox:stat" }, msg), "*"); } catch (e) { /* no parent */ } };
    function gameOver(reason) {
      if (over) return;
      over = true;
      tell({ e: "exit", p: placeId, r: reason, s: Math.round((Date.now() - started) / 1000) });
    }
    tell({ e: "play", p: placeId });
    // The player reports how a game ended to the tab that opened it (meant
    // for a popup); here there's none, so stand one in.
    try {
      Object.defineProperty(window, "opener", { configurable: true, get: () => ({
        postMessage(m) { if (m && m.type === "gameExit") gameOver(String(m.reason || "exit")); },
      }) });
    } catch (e) { /* keep the real one */ }
    addEventListener("pagehide", () => gameOver("closed"));

    if (dprCap !== Infinity || pixels !== Infinity) {
      const desc = Object.getOwnPropertyDescriptor(window, "devicePixelRatio")
        || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "devicePixelRatio");
      const real = desc && desc.get;
      if (real) {
        Object.defineProperty(window, "devicePixelRatio", {
          configurable: true, enumerable: true,
          get() {
            let d = Math.min(real.call(window), dprCap);
            const px = window.innerWidth * window.innerHeight * d * d;
            if (px > pixels) d *= Math.sqrt(pixels / px);
            return Math.round(d * 1000) / 1000;
          },
        });
      }
    }

    setupEngineCodeCache();
    setupFpsProbe();
    setupWebGPU();
    setupSandboxHelp();

    // WebGL: the loader opens the game canvas with only powerPreference set,
    // so it inherits the default antialias:true — a multisampled default
    // framebuffer (several times the canvas memory, plus a resolve each frame)
    // that the engine's own render passes don't need. The first getContext
    // call fixes a canvas's attributes, so this applies to the game canvas.
    if (tier !== "quality" && typeof HTMLCanvasElement !== "undefined") {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (/^(webgl2?|experimental-webgl)$/.test(type)) attrs = Object.assign({}, attrs, { antialias: false });
        return getContext.call(this, type, attrs);
      };
    }

    // Memory: the loader asks for a fixed 2 GB shared heap and simply fails
    // ("Unable to start Roblox") if the device can't reserve it. The engine
    // accepts anything from 256 MB up, so retry smaller instead of failing.
    const NativeMemory = WebAssembly.Memory;
    const Memory = function Memory(desc) {
      if (!new.target) throw new TypeError("Constructor WebAssembly.Memory requires 'new'");
      try { return new NativeMemory(desc); } catch (e) {
        if (!(desc && desc.shared && e instanceof RangeError)) throw e;
        for (const pages of [24576, 16384, 12288, 8192]) {
          if (pages >= desc.initial) continue;
          try {
            const m = new NativeMemory(Object.assign({}, desc, { initial: pages, maximum: pages }));
            console.warn(`[rbxweb] couldn't reserve ${desc.initial / 16} MB for the game; using ${pages / 16} MB`);
            return m;
          } catch (e2) { /* try smaller */ }
        }
        throw e;
      }
    };
    Memory.prototype = NativeMemory.prototype;
    Object.setPrototypeOf(Memory, NativeMemory);
    WebAssembly.Memory = Memory;

    // Lost GPU context: the loader shows a blocking alert() and the game is
    // dead. Replace it with a rejoin prompt, and remember it so the next
    // launch starts a tier lighter (auto mode).
    const nativeAlert = window.alert;
    window.alert = function (msg) {
      if (!/WebGL context lost/i.test(String(msg))) return nativeAlert.apply(this, arguments);
      ls.set(LOST_KEY, String(Date.now()));
      showLostOverlay();
    };
    // Compiled-engine cache. Chrome keeps the machine code it compiled for a
    // wasm module (so the next launch skips compiling ~100 MB again) only when
    // the module is compiled from a real fetch() Response that sits in its HTTP
    // cache. Roblox's loader instead re-wraps the download as
    // `new Response(stream)` to count bytes for its progress bar, and a Response
    // made that way has no URL, so Chrome never caches its code: every launch
    // recompiles the whole engine. Measured in Chrome 156: 10–17 MB of cached
    // code for the real Response, 0 for the wrapped one.
    //
    // Fix: keep a copy of the real Response when the loader fetches the wasm,
    // compile that copy, and let the loader's wrapped one drain so its progress
    // bar still finishes.
    // Frame rate, measured where frames are really drawn. The engine paces
    // itself (timers or rAF, its own cap), so a page-level rAF counter would
    // report the screen's rate. Instead: the WebGL calls that start drawing to
    // a framebuffer mark a frame, once per task (the engine draws a frame in
    // one task). Gaps over 2 s (loading, tab hidden) are left out.
    // Reported once a minute and when the game ends, as one small anonymous
    // summary (fps, 1% low, stutter share, the settings in use, device class,
    // GPU name, place id) to the server log, so defaults can be tuned from
    // real Chromebooks. ?meter=1 (remembered; ?meter=0 off) also shows it.
    // Frame pacer (2026-11-17, Roblox staging). The engine's main loop runs off
    // requestAnimationFrame, so on a machine that can't hold 60 it lands
    // anywhere between 30 and 50 fps: uneven frames on a 60 Hz screen, which
    // reads as judder even at a decent average. This paces the engine's frames
    // to whole display refreshes: 60 when the machine keeps up, otherwise a
    // locked 30 (every second refresh), and back up to 60 once it has had
    // plenty of headroom for a while. "60"/"30" fix the rate; "auto" adapts.
    function setupPacer(mode) {
      const nativeRAF = window.requestAnimationFrame.bind(window);
      const nativeCancel = window.cancelAnimationFrame.bind(window);
      const P = window.__rbxPace = { mode, target: mode === "30" ? 30 : 60, vsync: 1000 / 60, runs: 0, late: 0, switches: 0, slowRuns: 0 };
      let queue = new Map(), nextId = 1, ticking = false, lastTick = 0, lastRun = 0;
      let win = [], calmSince = 0, retryWait = 10000, lastSwitch = -Infinity, lastUp = -Infinity;
      const frameMs = () => Math.max(P.vsync, Math.round(1000 / P.target / P.vsync) * P.vsync);
      const setTarget = (t, now) => { if (P.target !== t) { P.target = t; P.switches++; lastSwitch = now; if (t === 60) lastUp = now; win = []; calmSince = now; } };
      const adapt = (now, work, gap) => {
        if (mode !== "auto") return;
        const fm = frameMs();
        const slow = work > 0.85 * fm || gap > 1.4 * fm;
        win.push(slow); if (win.length > 60) win.shift();
        if (slow) { P.slowRuns++; calmSince = now; }
        if (P.target === 60 && win.length >= 30 && now - lastSwitch > 3000) {
          if (win.filter(Boolean).length / win.length > 0.2) {
            // couldn't hold 60: lock to 30; a retry of 60 that failed quickly
            // makes the next one wait longer
            if (now - lastUp < 15000) retryWait = Math.min(retryWait * 2, 120000);
            setTarget(30, now);
          }
        } else if (P.target === 30 && now - calmSince > retryWait && work < 0.45 * (1000 / 60)) {
          setTarget(60, now);
        }
      };
      const tick = (ts) => {
        ticking = false;
        if (lastTick) { const d = ts - lastTick; if (d > 4 && d < 40) P.vsync += (d - P.vsync) / 30; }
        lastTick = ts;
        const fm = frameMs();
        if (queue.size && (!lastRun || ts - lastRun >= fm - P.vsync / 2)) {
          const gap = lastRun ? ts - lastRun : fm;
          if (lastRun && gap > fm * 1.5) P.late++;
          lastRun = ts; P.runs++;
          const cbs = queue; queue = new Map();
          const t0 = performance.now();
          for (const cb of cbs.values()) { try { cb(ts); } catch (e) { setTimeout(() => { throw e; }); } }
          adapt(t0, performance.now() - t0, gap);
        }
        if (queue.size) schedule();
      };
      const schedule = () => { if (!ticking) { ticking = true; nativeRAF(tick); } };
      window.requestAnimationFrame = function (cb) { const id = nextId++; queue.set(id, cb); schedule(); return id; };
      window.cancelAnimationFrame = function (id) { queue.delete(id); };
    }

    // WebGPU (2026-11-18, when Roblox made the web engine prefer it).
    //  - Ask for the high-performance GPU: on laptops with two it's the fast
    //    one (one-GPU machines get the same adapter as before).
    //  - Opaque game canvas: the engine copies each finished frame onto the
    //    canvas, which the browser otherwise blends with the page behind it
    //    every frame. Nothing shows through the game canvas, so skip that.
    //  - A software-only adapter (the CPU drawing what a GPU should) or a lost
    //    device sends this browser to WebGL2 for a day; a lost device also gets
    //    the Rejoin prompt instead of a frozen game. GPU errors go to /_diag.
    function setupWebGPU() {
      const diag = (k, m) => { try { fetch(PROXY_ORIGIN + "/_diag?k=" + k + "&m=" + encodeURIComponent(String(m).slice(0, 300)), { method: "POST", keepalive: true }); } catch (e) { /* ignore */ } };
      const G = window.GPU, A = window.GPUAdapter, C = window.GPUCanvasContext;
      const info = window.__rbxGpu = { name: "", fallback: false, opaque: false };
      if (G && typeof G.prototype.requestAdapter === "function") {
        const requestAdapter = G.prototype.requestAdapter;
        G.prototype.requestAdapter = async function (opts) {
          const o = Object.assign({}, opts);
          if (!o.powerPreference) o.powerPreference = "high-performance";
          let a = null;
          try { a = await requestAdapter.call(this, o); } catch (e) { a = null; }
          if (!a && o.powerPreference !== (opts && opts.powerPreference)) a = await requestAdapter.call(this, opts);
          if (a) {
            const i = a.info || {};
            info.name = [i.vendor, i.architecture, i.description].filter(Boolean).join(" ").slice(0, 90) || "webgpu";
            info.fallback = !!(a.isFallbackAdapter || i.isFallbackAdapter);
            if (info.fallback) { ls.set(GPU_BAD_KEY, String(Date.now())); diag("gpu", "software adapter: " + info.name); }
          }
          return a;
        };
      }
      if (A && typeof A.prototype.requestDevice === "function") {
        const requestDevice = A.prototype.requestDevice;
        A.prototype.requestDevice = async function () {
          const d = await requestDevice.apply(this, arguments);
          try {
            let n = 0;
            d.addEventListener("uncapturederror", (e) => { if (n++ < 3) diag("gpu", "error: " + ((e.error && e.error.message) || e.error)); });
            d.lost.then((l) => {
              if (l && l.reason === "destroyed") return;   // closed on purpose (leaving the game)
              diag("gpu", "device lost: " + ((l && l.message) || "?"));
              ls.set(GPU_BAD_KEY, String(Date.now()));
              ls.set(LOST_KEY, String(Date.now()));
              showLostOverlay();
            });
          } catch (e) { /* keep the device as it is */ }
          return d;
        };
      }
      if (C && typeof C.prototype.configure === "function") {
        const configure = C.prototype.configure;
        C.prototype.configure = function (cfg) {
          if (cfg && this.canvas && this.canvas.id === "canvas" && cfg.alphaMode !== "opaque") {
            cfg = Object.assign({}, cfg, { alphaMode: "opaque" });
            info.opaque = true;
          }
          return configure.call(this, cfg);
        };
      }
    }

    // A site that puts Roblox in a sandboxed frame without allow-pointer-lock
    // (thousands of "frame is sandboxed" refusals a day since 2026-11-17)
    // breaks mouse look: unplayable for shooters. Say so once and offer the
    // same game in its own tab, where nothing is blocked.
    function setupSandboxHelp() {
      const E = window.Element;
      if (!E || typeof E.prototype.requestPointerLock !== "function") return;
      const requestPointerLock = E.prototype.requestPointerLock;
      let shown = false;
      const help = (err) => {
        if (shown || !/sandbox/i.test(String(err && err.message))) return;
        shown = true;
        try { fetch(PROXY_ORIGIN + "/_diag?k=sandbox&m=" + encodeURIComponent(String(document.referrer || "").slice(0, 120)), { method: "POST", keepalive: true }); } catch (e) { /* ignore */ }
        const bar = document.createElement("div");
        bar.id = "rbxweb-sandbox";
        bar.setAttribute("role", "status");
        bar.style.cssText = "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;" +
          "max-width:calc(100% - 24px);padding:10px 10px 10px 16px;border-radius:14px;background:#0a0a0a;border:1px solid rgba(255,255,255,.1);" +
          "color:rgba(255,255,255,.8);font:500 13px/1.4 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
        const t = document.createElement("span");
        t.textContent = "This page blocks mouse lock, so aiming won't work here.";
        const a = document.createElement("a");
        a.href = location.href; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "Open in new tab";
        a.style.cssText = "flex:none;height:32px;padding:0 14px;display:inline-flex;align-items:center;border-radius:10px;background:#fff;color:#000;font-weight:600;text-decoration:none";
        const x = document.createElement("button");
        x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "\u00d7";
        x.style.cssText = "flex:none;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.6);font:500 18px/1 sans-serif;cursor:pointer";
        x.onclick = () => bar.remove();
        bar.append(t, a, x);
        (document.body || document.documentElement).append(bar);
      };
      E.prototype.requestPointerLock = function () {
        let r;
        try { r = requestPointerLock.apply(this, arguments); } catch (e) { help(e); throw e; }
        if (r && typeof r.then === "function") r.then(null, help);
        return r;
      };
    }

    function setupFpsProbe() {
      // WebGL2, or WebGPU since Roblox's 2026-11-18 switch: the engine draws a
      // frame into its own texture and copies it to the canvas with one
      // getCurrentTexture() per frame, so that call marks a WebGPU frame.
      const G = window.WebGL2RenderingContext, GC = window.GPUCanvasContext;
      if (!G && !GC) return;
      let api = "", gpuCanvas = null;
      if (q.has("meter")) ls.set("rbxweb.meter", q.get("meter") === "1" ? "1" : null);
      let inFrame = false, last = 0, gl = null, gpu = "";
      let net = null, netPrev = null;
      try { new BroadcastChannel("rbxweb-net").onmessage = (e) => { net = e.data; }; } catch (e) { /* no channel */ }
      let dts = [], live = [];
      const mark = function () {
        if (inFrame) return;
        inFrame = true; queueMicrotask(() => { inFrame = false; });
        if (!gl) gl = this;
        const now = performance.now();
        if (document.hidden) { last = 0; return; }
        if (last) { const dt = now - last; if (dt < 2000) { dts.push(dt); live.push(dt); } }
        last = now;
      };
      if (G) for (const name of ["bindFramebuffer", "clear"]) {
        const f = G.prototype[name];
        if (typeof f === "function") G.prototype[name] = function () { if (api !== "webgpu") { api = "webgl2"; mark.call(this); } return f.apply(this, arguments); };
      }
      if (GC && typeof GC.prototype.getCurrentTexture === "function") {
        const f = GC.prototype.getCurrentTexture;
        GC.prototype.getCurrentTexture = function () { api = "webgpu"; gpuCanvas = this.canvas; gl = null; mark.call(null); return f.apply(this, arguments); };
      }
      const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
      const sum = (a) => {
        if (a.length < 30) return null;
        const s = a.slice().sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length;
        return { fps: Math.round(10000 / mean) / 10, low1: Math.round(10000 / pct(s, 0.99)) / 10,
          p50ms: Math.round(pct(s, 0.5)), stutter: Math.round(1000 * a.filter((d) => d > 50).length / a.length) / 10, n: a.length };
      };
      const gpuName = () => {
        if (api === "webgpu") return (window.__rbxGpu && window.__rbxGpu.name) || "webgpu";
        if (gpu || !gl) return gpu;
        try { const x = gl.getExtension("WEBGL_debug_renderer_info"); gpu = String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "").slice(0, 90); } catch (e) { gpu = "?"; }
        return gpu;
      };
      // Automatic 3D resolution for the next launch (see res3dAuto): judged
      // once per game, from a full minute after the first two (loading).
      const STEPS = ["720", "540", "480", "360"];
      let autoJudged = false;
      const judgeRes = (s, c) => {
        if (autoJudged || ls.get(RES3D_KEY) || !s || s.n < 300) return;
        if ((Date.now() - started) / 60000 < 3) return;
        const cur = c.res3d && c.res3d !== "auto" ? String(c.res3d) : null;
        const i = cur ? STEPS.indexOf(cur) : -1;
        if (s.fps < 22) {
          const next = STEPS[Math.min(STEPS.length - 1, i < 0 ? 1 : i + 1)];   // none -> 540 -> 480 -> 360
          if (next !== cur) { ls.set(RES3D_AUTO_KEY, next); autoJudged = true; }
        } else if (s.fps >= 55 && ls.get(RES3D_AUTO_KEY)) {
          const up = i <= 1 ? null : STEPS[i - 1];                               // 360 -> 480 -> 540 -> none
          ls.set(RES3D_AUTO_KEY, up); autoJudged = true;
        }
      };
      const report = (why) => {
        const s = sum(dts); dts = [];
        if (!s) return;
        const c = window.__rbxPerf || {};
        try { if (why === "minute") judgeRes(s, c); } catch (e) { /* only a hint for next time */ }
        const m = Object.assign(s, { why, place: placeId, min: Math.round((Date.now() - started) / 60000),
          tier: c.tier, auto: c.auto, cap: c.fps || "", res: ls.get(RES_KEY) || "auto", res3d: c.res3d || "auto",
          mem: mem || null, cores: cores || null, gpu: gpuName(), memMode, lowcore: !!c.lowcore, smart: !!c.smart,
          api, gpuAb: c.gpu || "", gpuWhy: c.gpuWhy || "", gpuOpaque: !!(window.__rbxGpu && window.__rbxGpu.opaque),
          res3dAuto: c.res3dAuto || null,
          pace: window.__rbxPace ? { mode: window.__rbxPace.mode, target: window.__rbxPace.target, hz: Math.round(1000 / window.__rbxPace.vsync),
            late: window.__rbxPace.late, slow: window.__rbxPace.slowRuns, switches: window.__rbxPace.switches, runs: window.__rbxPace.runs } : null,
          // network over the last period: native or relay, and for the relay
          // datagrams in/out, stale drops each way, arrival jitter (ms)
          net: net && (net.how === "relay" && netPrev && netPrev.how === "relay"
            ? { how: "relay", path: net.path, inDg: net.inDg - netPrev.inDg, inDrop: net.inDrop - netPrev.inDrop, outDg: net.outDg - netPrev.outDg, outDrop: net.outDrop - netPrev.outDrop, jit: net.jit }
            : net),
          canvas: (gl && gl.canvas) || gpuCanvas ? ((gl && gl.canvas) || gpuCanvas).width + "x" + ((gl && gl.canvas) || gpuCanvas).height : "" });
        netPrev = net;
        try { fetch(PROXY_ORIGIN + "/_diag?k=fps&m=" + encodeURIComponent(JSON.stringify(m)), { method: "POST", keepalive: true }); } catch (e) { /* ignore */ }
      };
      setInterval(() => report("minute"), 60000);
      addEventListener("pagehide", () => report("end"));
      const prevOver = gameOver;
      gameOver = function (reason) { report("end"); return prevOver(reason); };

      if (ls.get("rbxweb.meter") === "1") {
        const el = document.createElement("div");
        el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;pointer-events:none;font:600 12px/1.3 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:6px";
        const add = () => document.body && !el.isConnected && document.body.appendChild(el);
        setInterval(() => {
          add();
          const s = sum(live); live = live.slice(-90);   // ~ the last couple of seconds
          el.textContent = s ? `${Math.round(s.fps)} fps · 1% low ${Math.round(s.low1)} · ${gl && gl.canvas ? gl.canvas.width + "×" + gl.canvas.height : ""}` : "fps …";
        }, 1000);
      }
    }

    function setupEngineCodeCache() {
      const WASM = /\/WebClient\.wasm(?:[?#]|$)/i;
      const compile = WebAssembly.compileStreaming;
      if (typeof compile !== "function" || typeof Response !== "function") return;
      try { performance.setResourceTimingBufferSize(1000); } catch (e) { /* keep default */ }
      let copy = null;
      const pageFetch = window.fetch;
      const tapped = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const p = pageFetch.apply(this, arguments);
        if (copy || !WASM.test(url)) return p;
        return p.then((r) => {
          if (!r.ok || !r.body || copy) return r;
          // The ORIGINAL is what we compile (a clone loses Chrome's code-cache
          // link); the loader gets the clone to count bytes from.
          try { const c = r.clone(); copy = r; return c; } catch (e) { return r; }
        });
      };
      tapped.__rbxHooked = true;
      window.fetch = tapped;
      WebAssembly.compileStreaming = function compileStreaming(source) {
        return Promise.resolve(source).then((src) => {
          const real = copy;
          if (!(real && src instanceof Response && !src.url)) return compile.call(WebAssembly, src);
          copy = null;
          if (src.body) src.body.pipeTo(new WritableStream()).catch(() => {});
          return compile.call(WebAssembly, real)
            .catch(() => compile.call(WebAssembly, pageFetch(real.url)))
            .then((mod) => { noteEngineCache(real.url); return mod; });
        });
      };
    }

    // Did the browser keep the engine? Its HTTP cache refuses single files over
    // a size that depends on free disk space, and the raw wasm is ~100 MB. If a
    // version we have loaded before still came over the network, ask the proxy
    // for the compressed copy (27–33 MB) from now on, which fits more caches.
    function noteEngineCache(url, tries = 0) {
      const e = performance.getEntriesByName(url).pop();
      if (!e) { if (tries < 20) setTimeout(() => noteEngineCache(url, tries + 1), 250); return; }
      const fromCache = e.transferSize < 65536 && e.decodedBodySize > 0;
      const seenBefore = ls.get(SEEN_KEY) === url;
      if (!fromCache && seenBefore) cookie("rbxwasmz", "1");
      ls.set(SEEN_KEY, url);
      window.__rbxPerf.engine = {
        fromCache, compressed: /(?:^|;\s*)rbxwasmz=1/.test(document.cookie),
        MB: +(e.transferSize / 1048576).toFixed(1),
      };
    }

    function showLostOverlay() {
      if (document.getElementById("rbxweb-lost")) return;
      const wrap = document.createElement("div");
      wrap.id = "rbxweb-lost";
      wrap.setAttribute("role", "alertdialog");
      wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;" +
        "background:rgba(0,0,0,.72);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
      const card = document.createElement("div");
      card.style.cssText = "width:min(380px,calc(100% - 32px));padding:24px;border-radius:16px;" +
        "background:#0a0a0a;border:1px solid rgba(255,255,255,.1);color:#fff;text-align:left";
      const h = document.createElement("h2");
      h.textContent = "The game's graphics stopped";
      h.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:600;letter-spacing:-.01em";
      const p = document.createElement("p");
      p.textContent = window.__rbxPerf.auto && tier !== "performance"
        ? "Your device ran out of graphics memory. Rejoining starts the game with lighter settings."
        : "Your device ran out of graphics memory. Rejoin to keep playing.";
      p.style.cssText = "margin:0 0 20px;color:rgba(255,255,255,.6);font-size:14px;line-height:1.5";
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Rejoin";
      b.style.cssText = "height:40px;padding:0 20px;border:0;border-radius:12px;background:#fff;color:#000;" +
        "font:600 14px Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer";
      b.onclick = () => location.reload();
      card.append(h, p, b);
      wrap.append(card);
      (document.body || document.documentElement).append(wrap);
      b.focus();
    }
  }

  const NativeWorker = globalThis.Worker;
  if (typeof NativeWorker === "function" && !NativeWorker.__rbxHooked) {
    const Wrapped = class extends NativeWorker {
      constructor(url, options) {
        const real = String(url);
        // The stub.js engine loader reads its own ?src= and must stay the
        // worker's real same-origin script — never blob-wrap it.
        if (/stub\.js/i.test(real) || /[?&]src=/i.test(real)) {
          super(url, options);
          return;
        }
        try {
          const boot =
            "(" + install.toString() + ")(self," + JSON.stringify(PROXY_ORIGIN) + ");\n" +
            "importScripts(" + JSON.stringify(reroute(real)) + ");";
          const blob = URL.createObjectURL(new Blob([boot], { type: "text/javascript" }));
          super(blob, options);
        } catch (e) {
          super(url, options);
        }
      }
    };
    Wrapped.__rbxHooked = true;
    globalThis.Worker = Wrapped;
  }
})();

;/* stub.js */
/* eslint-disable */
"use strict";
(() => {
  // server-endpoints.ts
  var apiBaseUrls = {
    prod: {
      clientSettingsHost: "clientsettings.roblox.com",
      settingsFlagsHost: "clientsettingscdn.roblox.com",
      setupCdnBase: "https://api.spf50krem.com/_/c2V0dXAucmJ4Y2RuLmNvbQ",
      websiteHost: "www.roblox.com"
    },
    st1: {
      clientSettingsHost: "clientsettings.sitetest1.robloxlabs.com",
      settingsFlagsHost: "clientsettingscdn.sitetest1.robloxlabs.com",
      setupCdnBase: "https://s3.amazonaws.com/setup.sitetest1.robloxlabs.com",
      websiteHost: "www.sitetest1.robloxlabs.com"
    },
    st2: {
      clientSettingsHost: "clientsettings.sitetest2.robloxlabs.com",
      settingsFlagsHost: "clientsettingscdn.sitetest2.robloxlabs.com",
      setupCdnBase: "https://s3.amazonaws.com/setup.sitetest2.robloxlabs.com",
      websiteHost: "www.sitetest2.robloxlabs.com"
    },
    st3: {
      clientSettingsHost: "clientsettings.sitetest3.robloxlabs.com",
      settingsFlagsHost: "clientsettingscdn.sitetest3.robloxlabs.com",
      setupCdnBase: "https://s3.amazonaws.com/setup.sitetest3.robloxlabs.com",
      websiteHost: "www.sitetest3.robloxlabs.com"
    }
  };

  // stub.ts
  var ALLOWED_ENGINE_PREFIXES = Object.values(apiBaseUrls).map((endpoint) => `${endpoint.setupCdnBase}/webclient/`);
  var src = new URLSearchParams(self.location.search).get("src");
  if (!src)
    throw new Error("[stub] missing src parameter");
  var engineScriptUrl = new URL(src).href;
  if (!ALLOWED_ENGINE_PREFIXES.some((prefix) => engineScriptUrl.startsWith(prefix)))
    throw new Error(`[stub] refusing to load engine script from ${engineScriptUrl}`);
  importScripts(engineScriptUrl);
})();
