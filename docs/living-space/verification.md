# Verification

Environment: managed Linux, Node v24.19.0, existing Vinext/Vite/Cloudflare build.

- Baseline: 135 configured tests passed; production build passed.
- Release: 211 tests passed using npm run test:all. Includes 26 new Living Space checks, all prior core and game checks.
- TypeScript: tsc --noEmit --allowImportingTsExtensions passed.
- Server rendering: the real shell renders without browser globals; all primary app links and visible Settings are present.
- Protected contracts: byte hashes match v118 for the entire ProxyView mount implementation, server and proxy entry points, manifests, route pages, original photo assets, provider configuration, feedback and analytics components.
- Text contrast: minimum calculated body/secondary-text ratio 5.19:1 at 92% surface opacity over either black or white, across all 15 photo palettes and 14 manual themes. This is a calculation, not a browser screenshot audit.
- Six new SVG posters were parsed, rendered in Inkscape, and visually inspected. scene-posters.jpg shows the assets, not a live UI screenshot.

## Build size

| Measurement | gzip size |
|---|---:|
| Baseline JS/CSS asset catalog | 173.9 KiB |
| Release JS/CSS asset catalog | 200.8 KiB |
| Deferred Settings + atmosphere chunks | 13.0 KiB |
| First-paint poster script | 0.6 KiB |
| Estimated eager asset increase | 14.5 KiB |
| Eager increase budget | 24.4 KiB |

Budget: PASS. These are build-derived compressed-file measurements. They exclude unchanged game engines, fonts and existing photographs; they are not actual browser transfer, interaction-latency, memory, FPS, or Lighthouse measurements. New scene posters total 42,076 bytes uncompressed. Only the selected home scene loads; gallery images use lazy loading.

## Not verified here

No supported browser automation surface was available. No local preview server was started and no before/after application screenshots were fabricated. Physical iPad Safari, installed Home Screen mode, WebKit/Chromium interaction runs, software-keyboard geometry, split view, visual focus/contrast inspection, real video autoplay denial, actual graphics loss, slow-network/offline use, sustained memory/animation timing, and completed Microsoft/Epic/Snapchat authentication were not verified.

Automated failure cases cover malformed preferences/imports, denied preference storage, upload limits and file signatures, failed and cancelled image decoding, IndexedDB transaction failure, no canvas context, hidden-document cleanup, quality selection, exact welcome frequency, safe command output, palette contrast, source ZIP removal, and shortcut DOM order. They do not constitute device or provider authentication passes.

Recommended real-device acceptance: open Kkeep in Safari and as a Home Screen app; check the fresh-launch greeting; select and Apply a photo and a new scene; Cancel another preview; enable Quiet; rotate and open the keyboard; open/close Settings with an existing tab alive; test the user's normal GeForce/Xbox/Snapchat login and game paths. Use Classic shell or redeploy v118 if a visual regression appears.
