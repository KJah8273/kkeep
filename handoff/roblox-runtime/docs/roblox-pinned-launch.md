# Pinned public launch bootstrap

## Evidence and scope

The public provider returned HTTP 524 for the game-start document after roughly 125 seconds in two live attempts. The previous gateway returned that text response directly and had no deadline on this route. The engine CDN delivery path was working independently.

The bundled document is the previously inspected provider response for `https://api.spf50krem.com/_/cGxheS5yb2Jsb3guY29t/games/start`: Next build `DCgUIV5YV31_w_sF9lwt2`, asset prefix `/277b9a60aa4d6118e89b19fbc8ca6f1e4e5eb81a`. It is a static export with empty `pageProps` and `query`; it contains no account, token, ticket or per-game data. The actual page chunk reads the live browser location, authenticates through the existing browser hook, then loads the engine bootstrap. The complete document is retained in `tests/fixtures/launch-shell-277b.html`.

On 2026-11-20, every normal bootstrap file referenced by that document or its stylesheet returned 200 through a normal public GET to the same old build on `https://play.roblox.com`. The later public document uses a different build and was deliberately excluded.

`worker/launch-data.json` records the source URL, byte length, SHA-256 and exact body for 24 resources totaling 1,424,977 uncompressed bytes. It includes the ten HTML scripts, stylesheet, favicon, seven CSS font/image dependencies, loader, complete worker stub, provider hook, document and public engine metadata. Each distinct body is verified once before GET or HEAD delivery. JavaScript and CSS then receive the existing gateway transformations; worker source validation, session claims and authentication code are retained.

## Verified compositions

- The old direct chunk 918 is byte-identical to `play-page-chunk.js` (SHA-256 `cf6f539bb2164e8a8937d6f622e3af272d4347686604c63c373156f24cc95b71`).
- The old loader matches `WasmLoader.js` exactly after replacing its single `https://setup.rbxcdn.com` literal with the inspected provider prefix. Its normalized SHA256 is `e6f503c9c8de028b6c4fcbc3199e2a0134d2113830eed7fbf54582bd56eb3bce`.
- The complete provider stub is the exact injected-hook prefix, the saved hook, the original stub separator and the direct stub with that same single literal normalization. It matches `stub.js`, SHA256 `7b1bd215961f331d9a001ed2da1d1adc8ae9065c749a801e3d625880e509e20a`.
- The 142-byte engine metadata record points only to inspected `version-1ef59424f70d4932` and its canonical public Wasm path. It is served at the existing fallback endpoint. Explicit versions, authenticated user-channel resolution and successful channel version selection retain their original precedence.

## Request and failure behavior

Only exact bundled paths and GET/HEAD are selected. The game document and worker stub retain their browser-side query strings; no query, cookie, Authorization header or session data is forwarded or interpolated into bundled bytes. Other bundled files require the canonical URL without a query. Integrity failures return a controlled error without fetching another source. Unknown assets and other builds keep their existing routing.

The old webpack runtime has no asynchronous chunk loader; its required launch chunk IDs are all present. The SSG manifest is empty, middleware is empty, and the page has no SSG/SSR data export, so no additional Next data request is indicated for normal startup. The optional Next error-route chunk named in the manifest is outside this normal-startup bundle: its single bounded public probe did not connect, and its existing route remains available. No unverified substitute was added.

## Remaining live dependencies

Strict `/_jar/sw.js?kk=join18` readiness, browser-local identity, authenticated user-channel selection, and game joins retain their live session routes. The engine binary/content use the existing reviewed CDN path. Public platform settings also retain the provider path: an observed WebClientApp response adds 31 flags and changes 1 relative to official raw settings, so substituting the raw response would change the performance profile.

A settings failure can cause the existing player to select WebGL while its requested-graphics label still says WebGPU. This patch does not change that behavior, and the label alone is not evidence of the actual rendering backend. No session or renderer protocol revision is changed. `/health` reports `launchDelivery: "bundled-inspected-build"` separately from `revision: "join18"`.

## Optional locale startup deadline

The inspected WasmPlayer awaited an optional account-locale lookup in its
startup `Promise.all`. A pending fetch or JSON body could keep the native
engine from starting indefinitely. The exact guarded transform now gives that
lookup a 12-second total deadline. It preserves the request URL, credentials,
proxy headers, successful locale values and existing empty-locale fallback.
The deadline rejects before aborting, late results cannot start the engine
again, and required session/channel/identity gates remain unchanged.

This is a separately reproduced startup defect, not evidence that the locale
request caused the observed live game-document HTTP 524. Eight tests execute
the actual locale implementation and startup gate, including delayed headers,
a stalled body, late completion and the unchanged successful request.

## Pre-publication verification

The complete runtime suite passed 285 tests, with zero failures, skipped tests
or cancellations. The production build, bundled JavaScript syntax check and
whitespace check passed. Independent review exercised all 24 bundled resources
through the full Worker with upstream fetch disabled and found no missing
normal-startup dependency or blocking source issue. These results establish
the delivery contract; live gameplay and physical device results are recorded
separately.
