# Kkeep Living Space

This upgrade changes the shell and appearance system in the existing Kkeep project. The existing proxy engines, game integrations, provider endpoints, authentication handling, service-worker scopes, and PWA identities are retained.

## Design decision

Three directions were considered: a still editorial home, a more spatial orbit-first home, and Atmospheric Glass. Atmospheric Glass was selected: the user's wallpaper remains the scene, the search bar stays central, and readable local surfaces carry the interface. The grid remains the default. Orbit is an optional, gently staggered arrangement, never a rotating carousel.

The real baseline defaults to Midnight, with photo-specific colors when enabled. No assumed lime palette was imposed. Existing chosen colors and all 15 photo wallpapers are preserved.

## Implemented

- A clearer Settings button with a visible label and 48px target; a one-time restrained introduction; optional left-handed placement.
- Exact welcome: **yo to the best proxy kkeep**. Once per fresh document, including reload, for about 3.1 seconds. Accessible close, no focus stealing, no audio. It moves into reserved shell space during browsing; dedicated provider/game pages remain untouched. Settings offers a preview without losing draft changes.
- A compact, responsive home with the original wordmark, address/search contract, icons, destinations and default shortcut order. Local suggestions use existing shortcuts and open tab URLs only. `/` focuses Home search. Clear/submit controls, stable keyboard order when shortcuts are edited, and visual-viewport handling for the software keyboard.
- A separate wallpaper adapter with original images, static fallback, CSS atmosphere, 2.5D pointer/optional permission-based tilt, CSS perspective at High quality, and compatible local video uploads. No WebGL engine or new third-party graphics dependency.
- Six original procedural scenes: Deep Orbit, Aurora Glass, Desert After Dark, Lunar Silence, Midnight Ocean, Paper Depth. Each has a distinct local SVG poster. Quality variants change decorative frame budgets, particle counts, DPR and depth rather than downloading large alternate videos.
- A wallpaper studio with still gallery previews, categories, favorites, current/original selection, portrait/landscape preview, supported adjustment controls, fit/fill and focal position, live preview, Apply, Cancel, and Restore Original. Existing photo tiles remain image-only.
- Auto, Static, Low, Balanced and High modes. Auto is conservative on coarse-pointer/save-data/low-concurrency browsers. Particle rendering is capped at 15/24/40 fps by tier, with a one-way lower-rate response to sustained slow samples. These are ceilings, not measured device FPS. System reduced motion always wins.
- Focus Field pauses decoration during search focus. Motion and videos stop when covered by Settings, browsing, or hidden document state. Only the selected preview can animate; galleries do not run renderers. Quiet also simplifies glass and transitions.
- Ambient Accent previews a local suggested color. Imported colors are normalized and adapted for contrast; no wallpaper pixels are sent to a service. Existing photo color matching and all 14 manual palettes remain available.
- Original, Balanced, Immersive, Quiet, and up to five local saved profiles. Original captures the pre-upgrade wallpaper, palette, and star preferences. Appearance Undo, treatment reset, motion reset, and layout reset leave browsing data alone.
- Optional local-time lighting, favorites rotation (5/15/30/60 minutes), grid/orbit layout, shortcut sizes/alignment, and button-based rename/reorder. Rotation is off by default and pauses during focus, Settings, active browsing and Quiet Mode.
- Local image/video uploads, MIME/signature/decode/dimension validation, IndexedDB storage, poster generation, quota handling, explicit file deletion, stale-load cancellation, and object URL cleanup. Images: up to 16 MB and 24 megapixels. Videos: up to 40 MB, 1080p and 90 seconds. Total upload budget: 8 files / 100 MB.
- Versioned validated preferences, safe appearance-only import/export, import preview, and missing-upload fallback. Files themselves, logins, cookies, history, credentials and proxy configuration are not exported. This is local storage, not cloud sync.
- A clearly labeled deterministic local settings helper. It proposes supported appearance changes with preview/apply/cancel/undo. It is not presented as AI. No AI backend or external context sharing was introduced.
- Existing browsing settings, analytics privacy preference, connection checks, in-settings feedback form and Licenses link. Repair keeps its original implementation, with confirmation before reloading the current Kkeep window.
- Public Source button and project source ZIP stay removed. No anti-inspection tricks were added.

## Baseline inventory and isolation

Baseline: version 118, commit `781bb9f3ef12c46b948244b27db308f078b0a5bc`.

| Surface | Preserved behavior |
|---|---|
| Main shell | `/`, `/youtube`, `/tiktok`, `/snapchat` |
| Existing redirects | `/roblox`, `/clash-royale`, `/controls` |
| Game pages | `/hgola-altara`, `/stick-fight`, `/play/[slug]`, existing static game paths |
| Main app shortcuts | YouTube, TikTok, GeForce NOW, Xbox Cloud, Snapchat, Roblox, GhostCloud |
| Existing home sections | Games (17 entries), 4 players, هجولة الطارة, Stick Fight |
| Root proxy | `/proxy-sw.js`, scope `/`, prefix `/browse/` |
| GeForce | `/gfn/index.html`, `/gfn/proxy-sw.js`, scope `/gfn/`, existing isolated manifest/icons |
| Xbox | `/xbox/index.html`, `/xbox/proxy-sw.js`, scope `/xbox/`, existing isolated manifest/icons |
| Backend | Existing relay, socket, browser-data, analytics, game assets, Xbox status, health and recovery handlers |
| Feedback | Existing embedded Fillout form inside Settings |
| PWA | Existing start URLs, icons, manifests and app-specific branding |

ProxyView remains mounted under the same tab IDs and retry keys. Its full implementation is byte-identical to v118. New appearance state never participates in proxy mounting, recovery, history, navigation, touch-controller selection, or authentication. There was no existing server-selector UI to move or replace.

Legacy keys remain: `kkeep-theme-v1`, `kkeep-wallpaper`, `kkeep-wallpaper-colors`, `kkeep-particles`, `kkeep-dense-stars`, `kkeep-ads`, `kha-lite`, `kkeep-analytics-exclude`, and `kkeep-touch-v1`. New state is namespaced under `kkeep-living-space-v1`, `kkeep-living-original-v1`, `kkeep-living-profiles-v1`, `kkeep-settings-introduced-v1`, and IndexedDB `kkeep-wallpaper-media-v1`. No new service worker or shared cache was introduced.

## Changed code

- `components/proxy-browser.tsx`: shell integration, preserved proxy subtree, Settings and welcome.
- `components/kkeep-home.tsx`: search affordances and shortcut presentation; current routes/handlers remain.
- `components/living-space/`: settings workspace, renderer, particle scheduler, welcome, persistence hook, boundary and accessible dock.
- `lib/living-space/`: preference schema, quality policy, commands, scene catalog, validated media storage and shortcut ordering.
- `app/living-space.css`: scoped tokens, layout, surfaces, motion, responsive and reduced-transparency treatments.
- `public/living-scenes/` and `public/living-space-boot.js`: local scene posters and closed-catalog first-paint photo restoration.
- `tests/living-space.test.mjs` and `tests/living-baseline.json`: new failure-path, persistence, accessibility-contract, SSR and non-regression checks.

## Verification and limits

See `verification.md` and `build-metrics.json` for measured build sizes and checks. The full suite passes **211 tests**; TypeScript and production builds pass. Browser/device checks and before/after application screenshots were not available in this managed workspace. The contact sheet is a preview of scene assets only.

The collection intentionally ships six completed scenes; Obsidian Liquid, Neon Rain, Liquid Chrome, and Pure Focus were not added as unfinished previews. No AI generation service, WebGL world, Arabic translation, cloud settings sync, or new offline cache is claimed. Existing browsing still requires its existing network services. CSS depth is layered presentation, not reconstructed 3D photography.

## Rollback

1. Immediate user fallback: **Settings → Feedback & about → Shell → Classic shell → Apply appearance**. This changes presentation, not sessions or storage. Use **Appearance → Original** to restore the captured starting wallpaper/palette.
2. Undo the last appearance Apply from the Settings title bar. A visual reset does not clear games or logins.
3. Deployment rollback: redeploy the saved version-118 ID `appgprj_6a9f8dac56bc8191a6442db4dbd481b9~appgver_60751058fad48191ad91a016b0263fc8` through Sites. Preserve the project and audience. Do not reset the repository or delete browser storage.
4. Source baseline is also recorded by local branch `baseline/living-space-v118` and the immutable baseline commit above. The remote private Git history and saved Sites version remain the durable recovery points.

Recommended iPad starting point: **Balanced / Auto**. Use Quiet for a fully still home. Physical iPad verification remains a release follow-up, not an already-passed claim.
