# Kkeep touch controls

GhostCloud opens immediately in Kkeep's existing proxy without any setup prompt or bookmark instructions. Roblox and Clash Royale each open their own standalone Kkeep player directly and have no Kkeep proxy controller button or automatic overlay. Astra and Figure Cloud have been removed from the app catalog and provider registry. The old `/controls` setup route redirects to GhostCloud, and the old home/settings setup links have been removed.

GhostCloud retains the floating Controls and Back to tabs buttons. Its controller automatically detects same-origin player frames and gamepad polling after Controls is opened. No bookmark is needed. Previously saved controller bookmarks remain compatible: Kkeep claims their event and enables the managed overlay only for a ready GhostCloud tab. Home, Clash Royale, and other apps do not get an overlay.

The in-session **Controls** button lazy-loads `/controls/kkeep-touch-embed.js`, then mounts the overlay in Kkeep while attaching its gamepad adapter to that session's iframe. It does not attach a device to the Kkeep host. Closing, changing tabs, or going back to tabs releases input and removes the adapter. Player reloads are detected and reattached. The standalone bookmark asset remains compatible with previously saved bookmarks.

Snapchat, YouTube, TikTok, and the GeForce engine are unchanged. Remote cloud services still provide the game session; this change does not create a cloud VM or guarantee a provider's availability.

## Input

The controller exposes a standard 17-button / four-axis gamepad through the target document's `navigator.getGamepads`. It preserves physical devices, browser permission denials, and cross-origin frame boundaries. Same-origin player frames receive the same state. Inaccessible supported frames get an explicit player link: embedded sessions open it through Kkeep and keep the Controls button, while standalone bookmarks retain their original direct-player behavior.

Each pointer owns its input. Pointer cancellation, lost capture, blur, page hide, orientation changes, and hiding/removing the overlay release controls. The GTA Phone shortcut and D-pad Up both use standard button 12. Closing the overlay restores the original API after a neutral polling frame. Only controller preferences are stored locally. No account data or input telemetry is uploaded.

The status reports API polling, not successful remote gameplay. Some games or streaming modes do not consume gamepads. Native video-only fullscreen can exclude HTML overlays. There is no promise of compatibility with every game or Safari version.

## Validation

Run `node scripts/build-touch-controls.mjs` to rebuild both controller assets; the normal site build also does this. `npm test` includes pointer-state and adapter regressions.

Optional integrations in `tests/touch-controls.test.mjs` accept local copies of the inspected public player input functions using `KKEEP_GHOST_SCRIPT`, `KKEEP_FIGURE_GAMEPAD`, and `KKEEP_ASTRA_PLAYER`. These checked the real encoders/polling code for Phone Up, sticks, trigger, and neutral release. No provider source is shipped with this project.

Inspected on 2026-10-03:

- GhostCloud: `https://ghost-mathmulti.zeoghost.workers.dev/js/app.js?v=7`
- Figure's embedded Raccoon SDK: `https://www.raccoongame.com/wap/dist/js/jysdk-cloudgame-h5.min.js`
- Astra PC player: `https://saugatr-pencil735366.agrointegral.cl/assets/lecture-notes-DYzJTx7g.js`

UI checks covered both sticks, the GTA preset, moving a control, pause/resume, and the setup page. An actual iPad/cloud-game session was not available for end-to-end verification.

The 2026-10-03 proxy launch update was checked in the browser for all four guides, local Roblox routing, provider selection, and the controller demo. A local iframe fixture verified that the player sees the touch pad while the Kkeep host sees none, that a player reload reconnects it, and that closing removes it. The managed HTTP preview cannot run the HTTPS-only Scramjet service worker, so authenticated cloud gameplay through the deployed proxy remains unverified.

The 2026-10-04 cleanup was checked in the browser: only GhostCloud and Roblox remain as cloud shortcuts; both launch without a dialog; Roblox has no Controls button, while GhostCloud retains Controls and Back to tabs. The old `/controls` route redirects to GhostCloud without a tutorial. TypeScript and launch/gamepad regression checks pass. Live provider gameplay is not verified by the HTTP preview.
