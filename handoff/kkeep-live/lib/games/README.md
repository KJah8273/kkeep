# Kkeep game integrations

The compact catalog is in `components/kkeep-home.tsx`. Standalone pages under
`public/games/` run at normal viewport scale, outside the proxy.

October 9 additions: Stickman Duel, Bad Piggies, Trees Hate You and Angry Birds.
Their K menus live outside isolated player frames (`standalone.js`), so menu
touches never enter a game's input document. Real identifying artwork is listed
in `covers/SOURCES.txt`. The supplied upload checksums and touch evidence are in
`supplied-oct9.json`.

Stickman Duel contains active dual-joystick objects. Bad Piggies contains its
own `TouchInput`, `FindTouch` and multitouch handlers. Angry Birds contains PlayN
touch-start/move/end handling. These games keep native input. Stickman's original
repository is unavailable; its verified data and WASM are split into first-party
files under 25 MiB. The empty GamePush project setup is replaced by a local save
and lifecycle adapter, with hosted accounts, purchases and rewarded ads unavailable.
Bad Piggies' small compressed engine files are also served locally. Its additional
episode bundles use the pinned upstream revision. Its obsolete Unity mobile warning
is replaced with an actual WebGL availability check.

Trees Hate You's `.br`-named files are actually raw bytes. Its pinned split data
and WASM are streamed in order through the existing validated download cache,
using raw GitHub before the CDN that returned 403. Its Kkeep movement stick sends
the documented WASD bindings, with separate pointer ownership and adjustable
opacity. The in-world object named Joystick is a mesh, not a touch UI. HUD touch
events are stopped at the document capture phase before Unity receives them.
Angry Birds uses a pinned asset base and native renderer resize; no CSS zoom is
applied to its touch coordinates. Audio contexts resume on a real touch gesture.

Stickman Duel and Trees Hate You always return Promises from their fetch
interceptors, including cached runtime Responses. Previously those branches
returned a Response directly, causing the actual Unity loader's `.then()` calls
to fail before compilation. `native-player.js` latches a startup error so late
progress or ready callbacks cannot overwrite it or hide Retry.

The streaming reader also splits large cached Blob chunks into at most 64 KiB
native calls. It yields a browser task after 1 MiB or 8 ms, so cached-data
microtasks cannot monopolize the main thread while Unity queues/decompresses
the world. This bounds Unity's temporary input allocation; it does not shrink
the compiled game's full memory requirement. Truncated streams reject rather
than invoking successful completion. Synthetic asset Responses carry their
original final URL, which the native WebRequest metadata reader requires.

How to Fish uses the same mirrored download/cache helper. Its original single
CDN request failed with HTTP 403 in the user's screenshot. All 13 pinned Build
files were fetched and byte-length checked from raw GitHub during this repair.
The existing room-code multiplayer implementation is retained.

`unity-display.js` defaults the Unity games to Low: at most 960 pixels on the
longest rendered edge. Canvas CSS remains full viewport size. Balanced (1280)
and High (1920) can be selected from the K menu, and orientation changes retain
the pixel limit. This selects the render resolution independently of each game’s native graphics settings.

How to Fish's current HUD is in `how-to-fish/controls.js` and `controls.css`.
The joystick centre is at 68% of viewport height in landscape, above the old
bottom-edge position. SVG icons and readable labels replace emoji. Run is a
toggle above the stick; essential right-hand actions are grouped at thumb height.
Tools holds secondary actions and all nine inventory slots. The open right side
is a look surface; Cast, Reel and Throw also support dragging to aim while held.
Each pointer owns its role through release/cancellation. Mouse coordinates stay
inside the canvas while relative deltas rotate the camera. HUD touches are stopped
before Unity's document touch listener can change the active input device. Short
button taps are held across a game frame; resets cancel pending input releases.
The HUD appears on the game's pointer-lock request on touch devices, with a
manual Play controls button and Menus escape. Menus and dialogs release input.

The bindings were extracted from the Player action map in the pinned build's
`sharedassets0.assets`: Mouse0 PlayerLeftClick, Mouse2 PlayerRightClick, WASD
PlayerMove, Shift PlayerSprint, Space PlayerJump, E PlayerPickUp, **Q PlayerDrop**,
Tab PlayerTab, B ChangeBait, X InventoryNone, F WeaponInspect, R WeaponReload,
Control PlayerCrouch, digits 1–9 Inventory1–9, Escape Pause. The old G drop
binding was incorrect. Mouse0/Mouse2 are shown as Reel / Use and Cast / Aim.

`how-to-fish/preferences.js` applies AmbientOcclusion=0, Decorations=0,
Decals=0, ShadowQuality=0 (Off, the lowest option) at each launch. Those keys are present in the pinned
game's IL2CPP string-literal table, alongside ButtonManager's corresponding
setting methods and Off/Low/Default shadow choices. Unity's native `UnityPrf`
binary format uses the exact native header: `UnityPrf`, uint32 LE `0x10000`
version, uint32 LE `0x100000` size limit. The pinned WASM reader (function
173700) rejects any other version; its writer (173702) emits that version.
The earlier Kkeep `version=1, limit=0` header was invalid and silently fell back
to defaults. It is migrated to the native header while preserving other records.
The original framework's filesystem hydration
callback installs a narrow lookup hook before it releases the startup dependency.
The game's own first `/idbfs/<hash>/PlayerPrefs` access applies the preset before
the native preference reader runs. Unrelated records, including long strings,
floats and progress, are preserved byte-for-byte. Unrecognised/truncated files
are left untouched. The pinned framework replacement must match exactly once.
No full game data recompression or additional startup asset download is needed.
Rendering resolution remains independently adjustable in the K menu.


The game binaries and multiplayer services are external dependencies, not
reimplemented here. Do not infer successful gameplay or multiplayer merely from
an asset request returning 200. Physical iPad and full gameplay QA were unavailable.

Compatibility: `asset-worker.js` and `unity-ipad.js` remain available for tabs
opened from version 82. New game pages use `downloads.js` and do not require a
service-worker activation/reload. The older worker only intercepts its own
`/games/assets/` URLs and does not interfere with the new download paths.

Trees Hate You now applies its **native Low graphics preset on every launch**,
including returning players with a saved High setting. The pinned Unity 6000.2.1f1
build's `QualitySettings` object in `globalgamemanagers` orders its presets as
High=0, Medium=1, Low=2. Its native WASM contains the `UnityGraphicsQuality`
preference. `trees-hate-you/preferences.js` sets that integer to **2**, after IDBFS
hydration and before Unity's first preference read. Other preference records
(including saves and sound levels) are preserved byte-for-byte; unknown/truncated
files are never replaced. The framework hook is applied exactly once to the
pinned engine. Both the host and player independently start rendering at Low
(maximum 960-pixel longest edge), so an old browser setting cannot override startup.
The game's own graphics menu remains available during play.

The 4 players gallery links directly to `https://player1234.testerqrr1.chatgpt.site/`
with the official Better World Games cover. Asset attribution is in
`public/games/covers/SOURCES.txt`.

Relevant checks: `node --test tests/trees-preferences.test.mjs tests/game-fetch-contract.test.mjs tests/new-arcade.test.mjs tests/game-delivery.test.mjs tests/games-loading.test.mjs`.
Physical iPad gameplay cannot be verified in this environment.

The six recently added provider games and the standalone GTA 5 port were removed at the owner's request, including their cards, launchers, covers, runtime code and bundled assets.
The October 14 linked-games additions are Blumgi Paintball, Mr Bullet,
Stickman Hook and Drive Mad. Covers and names appear in
the existing compact Games gallery. Four supplied game pages run in a borderless
full-viewport iframe at `/play/[slug]`; native fullscreen is requested from the
gallery tap. The frame cannot navigate the top page or open unsolicited popups.
Level Devil was omitted because its supplied page sends
`Content-Security-Policy: frame-ancestors 'self'` and its nested Poki player returns
a moved notice. Hill Climb Racing was also omitted because its supplied
`zipy-sdk.js` redirects rewarded-break requests to a promotion website when a
new tab cannot open. The owner requested no outside-page fallback links.
These are externally hosted players, not local game builds. HTTP pages, startup
resources, artwork, TypeScript and production build were checked; browser and
physical iPad gameplay were not verified in this environment.

## November 6 arcade additions

Sausage Flip, Stack Bounce, Blumgi Racers, Turbo Stars, Bridge Race and Bowmasters
use small local entry pages with their supplied providers' game assets. The entry
pages retain the actual native engine and input, omit upstream page chrome, and
use local covers. Turbo Stars and Bridge Race use pinned Unity asset revisions;
their verified compressed files need Brotli response metadata from
`worker/game-content.ts`. Do not broaden that encoding rule to arbitrary files.

Turbo Stars, Bridge Race and Bowmasters use `playables-profile.js` for the native
Playables save API. It stores the save string in the existing per-game Profile
runtime. Bridge Race waits for its Unity receiver before restoring that string.
Sausage Flip retains its native localStorage keys, including `FirstConncection`.
Blumgi Racers stores its Construct save in IndexedDB database
`c3-localstorage-ggzr9d1ra01`, store `keyvaluepairs`, key `Locals`.
Stack Bounce's eight `GameSave*` cookie values are bridged to isolated localStorage.
Its native `saveAll()` runs after level-completion updates and before Profile
snapshots, only after the shop, level and first-reset initialization are complete.
Signing into Kkeep remains necessary for cross-device Profile synchronization.

Touch devices render these Unity and PlayCanvas games at device pixel ratio 1.
The PlayCanvas cap is applied after configure, before preload, and disables touch
antialiasing. Blumgi Racers' adapted `main.js` keeps its main runtime on the page,
caps touch rendering at ratio 1 (including resize), and limits task workers to 2.
Its asset base is explicit because the player runs inside the isolated save frame.
The upstream main.js SHA-256 was
`84a645bfb455fb2721e741621a10d1dfb15fddbf9dbfb3b809a46bb3deb063f7`.
Bowmasters already renders at resolution 1. These changes reduce rendering and
worker overhead without changing physics, touch coordinates or earned progress.

Stickman Hook uses the requested Bunny CDN build in a local minimal entry page.
Its classic bundle loads directly because server-side fetching returned 403 while
the browser reached the file; the game still runs within the Profile save frame.
Tomb of the Mask first tries the requested embed and its fixed nested player URL.
When that provider cannot be fetched, it uses the previous game-only build. Both
asset origins are explicitly allowlisted; arbitrary iframe URLs are never followed.

Validation: 75 targeted tests passed across `playables-profile`, `game-progress`,
`game-asset-paths` and `game-runtime-asset-url`, plus TypeScript. All six gallery
covers loaded in the browser. Downloaded Turbo Stars and Bridge Race compressed
WASM files decompressed and validated successfully. Browser policy prevented
inspection of the isolated game frames, so full gameplay, real cross-device save
round-trips and physical iPad frame rates remain unverified.
