# Classic Kkeep with Wallpaper Studio

The owner requested reverting the Living Space interface while retaining the wallpaper studio.

- Restored the version-118 home composition, search, shortcut labels/order, toolbar, Settings menu and 75% shell scale. The welcome message, Quiet shortcut, settings introduction, local helper, profiles and layout editor are no longer part of the interface.
- Settings → Open wallpaper studio retains the existing wallpapers, original snapshot, six scene posters, uploads, fit/focal settings, image adjustments, quality/motion, favorites, local backups, Apply/Cancel and Undo.
- Existing saved wallpaper preferences and IndexedDB uploads are retained. Old shell/layout preference fields are ignored by the restored home; no login, game or browser storage is cleared.
- Removed Mr Bullet from the catalog and removed its unused cover. Its previous /play/mr-bullet route now returns not found.
- Moved the existing Stickman Duel card, cover and unchanged game destination from Games to 4 players.
- The proxy view, routes, worker scopes, provider engines, manifests and touch controls remain unchanged. The catalog removal is the one intentional exception to the earlier baseline file hashes.

Validation: production build, TypeScript, full automated suite, real shell server rendering, game-route removal check, catalog placement check and unchanged proxy/asset checks. Browser and physical iPad interaction checks were unavailable in the managed workspace. These checks do not claim a physical-device or third-party sign-in pass.

Recovery: previous saved version 119 remains available in Sites with ID appgprj_6a9f8dac56bc8191a6442db4dbd481b9~appgver_3c07f97dc5b48191ae21f822ddcbe126. Source before this change: 4bc825327e48cb585dd4e43dfc64dc9de801e5c9. No destructive repository reset was used.

The other Living Space release notes and build metrics in this folder describe historical version 119, not the restored shell.
