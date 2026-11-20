# Kkeep app Scramjet fork

Updated 2026-09-28 for GeForce NOW, TikTok, Snapchat and Xbox Cloud.
Disney and the Apps directory now redirect home. TikTok uses the dedicated
Relay connection and reports a feed stalled without loaded media after 20 seconds.
Licensed under AGPL-3.0-only; original Mercury Workshop notices are retained.

This is a separate deployment of the pinned Scramjet 2.0.67-alpha.2 and
scramjet-controller 0.0.14 already vendored in `public/engine`. Original source,
source maps, integration patches and version provenance are retained in the
Kkeep source download and `vendor/proxy-versions.json`.

Rebuild with `node scripts/build-app-scramjet.mjs`. The script copies the pinned
engine and WASM to `public/app-proxy/engine`, renames the controller's cookie
database and BroadcastChannel, and emits the dedicated integration runtime.
The modified controller's stale source-map directive is removed; its original
map and exact transformation remain available in the source package.

The launcher document and service worker both live under `/app-proxy/`, with
rewritten traffic under `/app-proxy/browse/`. Only the four app entry points
route here. The ordinary browser continues using `/browse/` and its existing
worker/engine. Authentication and CDN requests made by an app are allowed
through the existing relay; this is not a four-domain network allowlist.

App cookies use a separate database from ordinary browsing. Upstream localStorage,
sessionStorage and IndexedDB still use Scramjet's upstream-origin namespaces;
this is not complete storage or origin isolation.

Engine and transport assets are hosted by Kkeep. App HTTP/WebSocket traffic defaults
to the official LibcurlTransport 2.0.5, using the public Mercury Workshop Wisp
relay. A separate Kkeep connection is an explicit user choice in the launcher.
Changing connection reloads the launcher so each realm has one Wisp endpoint.
There is no automatic India proxy scan, regional claim, or silent fallback.
The existing public-network and content checks also run for the Wisp route.
No regional game-stream relay or DRM workaround is added. Provider sign-in,
protected playback and cloud gameplay remain unverified on user devices.

The reproducible libcurl transport fork fixes cleanup for failed/aborted
WebSocket handshakes and reports server-negotiated protocol headers. Connection
deadlines release pending sockets. Unknown remote close codes remain abnormal
closures; the wrapper does not invent a successful close. The original package,
license, exact integrity and build script remain in vendor/libcurl-transport,
vendor/proxy-versions.json and scripts/build-libcurl-transport.mjs.
Rebuild with `node scripts/build-libcurl-transport.mjs`.

Dedicated launchers opt into native sign-in popups. GeForce has a separate Epic account-linking launcher.
It preserves Scramjet's window.open implementation, returned WindowProxy,
opener and URL rewriting, including initially blank windows. The main browser retains in-shell navigation. The reproducible integration and popup reporting
live in `scripts/build-app-scramjet.mjs` and `scripts/app-proxy-popups.mjs`.
Browser-blocked windows show a separate retry instruction in the launcher;
loading the main page cannot erase that instruction. OAuth URLs and account
credentials are not copied into the help UI or new persistent storage.
