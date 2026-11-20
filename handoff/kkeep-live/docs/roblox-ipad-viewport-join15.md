# Roblox iPad viewport and content-loading repair

Date: 2026-11-20

## Report and evidence

The supplied iPad screenshot reached Timebomb Duels' own "Joining server" card. The game occupied roughly 82% of the available width, leaving a black strip on the right. The main player was changing the iframe to about 82.5% width/height after its play event at 1180×734 CSS pixels, then applying an inverse CSS transform. The numerical match supports removing that startup geometry change; it does not by itself prove a particular Safari compositor defect.

Runtime error logs near the report also showed HTTP 404 for three required JSON read POSTs: asset metadata, thumbnails, and user metadata. Executing the current WebClient HTTP adapter against the existing browser-session bridge reproduced their omission. The exact routes are documented in the companion runtime's join15 release notes.

## Changes

- The actual RobloxPlayer component keeps one full-size iframe across play and viewport changes. It no longer shrinks, transforms, or resizes the game document as a performance optimization.
- The companion runtime applies the same mobile default drawing budget through the provider's existing effective pixel-ratio getter: at most 1024 pixels on either edge and approximately 1024×576 total pixels after integer rounding. This controls the canvas backing buffer while preserving its CSS size and ordinary input/resize behavior.
- The three demonstrated JSON POST omissions now use the existing browser-local session worker. The runtime preserves exact method/path checks, request/response bounds, single-attempt behavior, and returned HTTP statuses.
- The runtime and worker registration/readiness revision advance to join15 without clearing account storage.

The coordinated runtime must be published before this main-site change so the internal drawing budget is available when the full-size iframe is served.

## Validation

| Check | Result |
| --- | --- |
| Main player session/touch/performance tests | 34 passed |
| Main production build | Passed |
| Runtime complete regression suite | 166 passed, zero failures or skips |
| Runtime bundle and JavaScript syntax | Passed |
| Independent renderer review | No concrete blocker; 17 focused checks passed |
| Browser layout after synthetic play/running events | Iframe and host both 1363×936, no inline geometry, computed transform `none` |
| Controlled canvas coverage | All four corners and edges visible, no right-side black strip |
| Physical iPad Safari, authenticated join, sustained gameplay | Not verified |

The main regression also covers 1180×734, 820×1060, and 1180×735 viewport inputs while retaining the selected frame, source URL, and key. Runtime tests execute the current provider performance function and actual player resize/touch routines without allocating the full Wasm game engine.

## Reproducing the layout fixture

Run `node scripts/preview-roblox-recovery.mjs <temporary-output-directory> viewport`, then use the managed `sites-preview start <temporary-output-directory>` command and its returned URL. Click **Start controlled viewport test**. The fixture bundles the actual main component with local, account-free lifecycle events and a four-corner canvas pattern. It does not authenticate or contact a Roblox game server.

The verification browser did not provide a WebGPU adapter. Its screenshot therefore shows an explicitly labelled **2D fallback — not a WebGPU check**, a 1363×936 CSS viewport, and a 927×636 backing buffer. This is layout evidence, not a Roblox gameplay screenshot or a claim of Safari GPU compatibility.

![Controlled full-frame layout check, using the labelled 2D fallback](roblox-ipad-viewport-join15.jpg)
