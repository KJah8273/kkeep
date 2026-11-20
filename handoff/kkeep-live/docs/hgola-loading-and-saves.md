# Hgola loading and save update

Scope: Hgola Altara only. Stick Fight and all other game/proxy destinations are unchanged.

Baseline: 14e070e52ed9d16cbe3d98c28c9768bf46a5e1f2 (published version 129).

- Starts the existing player iframe in server-rendered HTML, with a state handshake after hydration.
- Keeps /hgola-runtime.html and Unity company/product identity unchanged to retain existing saves.
- Pins the current original Unity build. The small original loader/framework are local; large files stream through checksum-validated R2 storage at stable versioned addresses.
- Unity owns its persistent asset cache; no large preloads that would redownload cached files.
- Enables Unity autoSyncPersistentDataPath. Does not Quit the engine on pagehide or clear player storage on retries.
- Browser-owned anonymous backups use a Secure/HttpOnly cookie, D1 revisions, and a retained previous snapshot. Empty saves and stale revisions cannot replace a valid backup.
- Download/recovery page is available from Settings. Recovery only fills an empty local save store. Files are validated and limited to 512 KB. It is not account-based device sync.

Validation before release: 245 automated tests passed; TypeScript and git diff checks passed. Managed Chrome preview inspected the backup page and persistent-storage-denied fallback. That preview has WebGL disabled, so game startup/gameplay timing and physical iPad behavior could not be verified. No 15-second guarantee is made. The original decoded data/wasm total 513,783,015 bytes; first launch depends on transfer and engine compilation.

Browser storage can still be cleared or evicted. Download a backup before clearing website data or switching devices. The game must write its own progress files; the shell cannot invent missing game progress. No account credentials, cookies, history, or proxy sessions are included in exports.

Rollback: redeploy baseline version 129, or revert this commit. Do not delete the hgola_saves table or the browser /idbfs database. The new schema is additive and old clients can continue using the existing asset/build routes.

Screenshot follow-up: reproduced the original Unity `dst.entries` failure when an IndexedDB arrow callback reports this.error as undefined. The reproducible compatibility patch forwards real errors, retries/reopens transient failures, rejects missing file sets, and blocks writes until initial progress was read. Five regression tests cover the exact original crash and non-destructive recovery. Both original large assets were verified present in production R2 after publication.

2026-10-22 loading follow-up: cold assets now stream to the player before any
storage population finishes. Completed gzip objects are reused from a separate
versioned R2 key; compression cache creation is best-effort background work with
its own stream, no unbounded response tee. Cache failures leave the ordinary
streaming path intact. Save database, backup logic and Unity identity are unchanged.
A cold/background cache may not finish within the host's lifetime limit; in that
case later requests continue through the existing compression path. First-load
speed is still limited by this game's 514 MB decoded build and device compilation.
Rollback: redeploy version 140; compressed keys are additive and can remain.

2026-10-28 Wi-Fi loading repair:
- Observed both pinned raw R2 assets present in production (HEAD 200; data
  436097435 bytes, wasm 77685580 bytes). Could not reproduce the user's exact
  network: managed Chrome has no WebGL, as it did in the original baseline.
- Hgola-only fetch adapter now streams fixed 2 MiB sections from the same pinned
  R2 objects. Each section is length-checked before delivery to Unity. A stalled
  header/body read times out after 20 seconds of inactivity and retries the current
  section up to five attempts. Failed sections never become cached full assets.
  Decoded response lengths remove the loader's inaccurate gzip size estimate.
- Existing Unity complete-file cache keys and save identity remain unchanged.
  HTTP section caching allows a retry to reuse successfully downloaded sections
  where the browser retains them. No new IndexedDB store, storage clearing,
  automatic page reload, or save migration is introduced.
- StreamingAssets now has a first-party fixed-game route, with bounded requests
  and redirects restricted to that original game/build on the original providers.
- Repeated stage messages no longer reset the outer stall watchdog. At 90% the
  text distinguishes engine startup from downloading; manual Retry keeps saves.
- 36 focused tests pass, including dropped Wi-Fi, silent header/body stalls,
  cancellation, malformed/truncated responses, request isolation, chunk bounds,
  streaming route restrictions, and existing persistence/storage-error regressions.
- Full TypeScript check has three existing errors in unrelated lib/chat-* files
  (implicit-any callbacks and missing D1Database type); not modified by this fix.
- Physical iPad, affected Wi-Fi, Unity engine startup and streaming asset behavior
  in actual gameplay remain unverified. No speed or all-networks guarantee.
Rollback: revert this change/redeploy the preceding version. Original full asset
routes remain available, and no saved progress or remote game objects are deleted.

2026-10-28 iPad and current Unity build update:
- The supplied Unity page now resolves to build 0d9f7b29-108b-4756-a4e2-870b21d94a0e.
  Downloaded and hashed its decoded data (436106018 bytes) and wasm (77703006
  bytes); vendored its matching loader/framework and reapplied the checked
  non-destructive storage patch. The previous build's asset routes remain valid.
- On iPhone/iPad (including iPad desktop-mode UA), Unity's full-response cache
  cloning is disabled. The original cachedFetch queues a clone while reading
  the large data file before cache.put starts, creating a second large buffer.
  Small HTTP sections can still be cached. PlayerPrefs and save backups remain
  enabled; no caches or save databases are deleted. Antialiasing is disabled on
  Apple touch devices, alongside the existing bounded drawing-buffer resolution.
- A cold new build can stream its full asset while server storage warms; later
  launches use retryable sections. Full streams validate length and bound idle
  reads. The loading screen shows only the game image, loading status, and percentage;
  no external Unity link or backup options are displayed, as requested.
- Both side placements now use the owner's different Adsterra units (160x600
  left, 160x300 right). The previously unfilled Google sidebar slot is removed.
- Physical iPad gameplay still requires device verification. Managed Chrome has
  WebGL disabled; do not infer successful gameplay from loader/unit tests.

2026-11-15 requested Unity build refresh:
- Resolve the exact supplied play.unity.com frame and pin its current build
  f485b572-cb8f-44f2-b7c3-26cca39c5dea. Verified the decoded data (469223515 bytes,
  SHA256 33dde1b5fb64096f0ff7583b31ddc9e7f6f13db65bd231b73cc2070eae1f4d6a),
  wasm (50537103 bytes, SHA256 3b17b0c2cf03b165d4ed99e82927de82fea0c07d3cc0409d474025798130c45e),
  and matching original loader/framework. Reapplied the checked storage guard.
- Retain both earlier builds' asset/StreamingAssets routes for already-open clients.
  No save identity or save database changes. Version runtime module URLs so a cached
  older download adapter cannot accidentally handle the new build.
- Cached downloads request two 2 MiB sections concurrently, preserve byte order,
  retry only failed sections, and cancel outstanding sections on failure. Memory
  stays bounded to a small batch; no full-file clone is introduced on iPad.
- Kkeep label, original cover, Arabic stage text and real percentage form the
  loading screen; original native gameplay controls and graphics limits remain.
- 43 focused tests pass, including bounded parallel transfer, out-of-order
  completion, cancellation, truncation, save recovery and official frame routing.
- First startup still transfers a large Unity build (519760618 decoded bytes).
  Actual iPad load duration/gameplay has not been measured; no fixed-speed claim.

2026-11-15 iPad retry follow-up:
- User screenshot shows section retries at1%; full production objects and sampled
  existing sections are intact. Exact device-specific failure is not reproduced.
- Introduced version2 transfer URLs with1 MiB sections and explicit gzip file
  payloads (no HTTP Content-Encoding); magic-byte checked DecompressionStream
  handles undecoded Safari responses and avoids double decompression. Any failed
  compressed part retries an identity variant with cache reload. Legacy2 MiB URLs
  are retained for already-open clients.
- Idle limit is45 seconds for slower/buffered connections. Download progress is
  reported after ordered validated sections, clears stale retry text on recovery,
  and remains monotonic through Unity initialization. Saves are unchanged.
- Tests exercise raw/encoded/split gzip headers, corrupt and oversized input,
  identity fallback, cancellation, retry isolation, network stalls and byte order.
- The Games shelf and main list now start with the nine games requested by the
  owner, in the supplied order, independently of popularity rankings.

2026-11-15 Unity page / fast-stream update:
- Re-resolved the owner's supplied Unity page and verified build
  1fd2dc15-ff98-4202-a685-06411ff6f10e: decoded data333022261 bytes
  (14068c1fa2e1b18567984827c11e1d6445bb71d2a2c9ca0d9901924ed80707c5),
  wasm50533602 bytes
  (9146a766648907c734e467feec9021cce592cbcd0ae563e9b073d6a7d5f961e3).
  Combined383555863 bytes, about26% smaller than the previous build.
- Vendored matching loader/framework and reapplied checked save guards. Retained
  all three previous asset/StreamingAssets routes for already-open clients.
- Normal startup now uses one continuous compressed stream per large file, without
  a HEAD roundtrip or hundreds of sequential section requests. Explicit gzip
  envelopes keep Safari decoding predictable; complete compressed storage is reused.
- Transfer is backpressured, never cloned into a second full JavaScript buffer.
  On interruption it resumes through validated1MiB sections from the delivered
  offset, slicing overlap so bytes are not duplicated. Oversized replies fail closed.
  Inactivity, cancellation, progress, and failure paths have regression coverage.
- Keeps Kkeep loading, native controls, iPad rendering cap and save identity.
  Source file and transport validation do not establish physical iPad gameplay
  or a guaranteed loading time; that remains device/network dependent.
