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
