# November 12 touch-game collection

21 additions. Source: existing Cloudfront game catalog; real covers resized at most 640px, no upscaling. Local launch documents contain game markup only, without the catalog's injected generic portal scripts or additional website navigation. In-game developer artwork remains part of the original games.

Assets load directly from the CORS-enabled CDN, avoiding a second server relay. Profile save frames remain opaque and isolated; provider code never receives profile credentials. The existing per-game localStorage/IndexedDB bridge is used, and Playables titles retain their local save adapters. No real signed-in cross-device round trip was performed.

Touch render density is capped at 1 before engine initialization; desktop at 1.5. Native input/physics are preserved. The four Construct launchers use the document asset base, run their main runtime on the page so profile storage stays in scope, and cap job workers at two. No artificial 60 FPS guarantee. Actual iPad hardware was unavailable.

Validation: all selected entry pages/covers and main engine resources returned HTTP 200; native touch handlers/plugins or mobile builds were inspected. 96 existing save/asset/Playables tests passed. These are infrastructure tests, not completed gameplay sessions. Preview gallery showed all 75 cards and new covers. Browser blocked access to /api/game-public during player inspection, so end-to-end startup verification is incomplete. Excluded Fruit Merge (missing engine files), Drift Boss (startup unresolved), Gunspin (older Unity build not verified on iPad).

| Game | Source |
| --- | --- |
| Eggy Car | https://d1a9n6wbsc5thc.cloudfront.net/lg/eggycar/index.html |
| Merge Round Racers | https://d1a9n6wbsc5thc.cloudfront.net/lg/merge-round-racers/index.html |
| Blumgi Rocket | https://d1a9n6wbsc5thc.cloudfront.net/lg/blumgi-rocket/index.html |
| Harvest.io | https://d1a9n6wbsc5thc.cloudfront.net/lg/harvest-io/index.html |
| State.io | https://d1a9n6wbsc5thc.cloudfront.net/lg/state-io/index.html |
| Idle Ants | https://d1a9n6wbsc5thc.cloudfront.net/lg/idleants/index.html |
| Idle Dice | https://d1a9n6wbsc5thc.cloudfront.net/lg/idledices/index.html |
| Kiwi Clicker | https://d1a9n6wbsc5thc.cloudfront.net/lg/kiwiclicker/index.html |
| Capybara Clicker | https://d1a9n6wbsc5thc.cloudfront.net/lg/cappybaraclicker/index.html |
| Monkey Mart | https://d1a9n6wbsc5thc.cloudfront.net/lg/monkeymart/index.html |
| Tiny Fishing | https://d1a9n6wbsc5thc.cloudfront.net/lg/tiny-fishing/index.html |
| Blumgi Bounce | https://d1a9n6wbsc5thc.cloudfront.net/lg/blumgibounce/index.html |
| Stickman Climb 2 | https://d1a9n6wbsc5thc.cloudfront.net/lg/stickmanclimb2/index.html |
| Stick Merge | https://d1a9n6wbsc5thc.cloudfront.net/lg/stickmerge/index.html |
| Dreadhead Parkour | https://d1a9n6wbsc5thc.cloudfront.net/lg/dreadhead-parkour/index.html |
| Color Match | https://d1a9n6wbsc5thc.cloudfront.net/lg/color-match/index.html |
| Dig Deep | https://d1a9n6wbsc5thc.cloudfront.net/lg/dig-deep/index.html |
| Tall Man Run | https://d1a9n6wbsc5thc.cloudfront.net/lg/tall-man-run/index.html |
| Carrom Clash | https://d1a9n6wbsc5thc.cloudfront.net/lg/carrom-clash/index.html |
| Cannon Basketball 4 | https://d1a9n6wbsc5thc.cloudfront.net/lg/cannon-basketball-4/index.html |
| Stacktris | https://d1a9n6wbsc5thc.cloudfront.net/lg/stacktris/index.html |
