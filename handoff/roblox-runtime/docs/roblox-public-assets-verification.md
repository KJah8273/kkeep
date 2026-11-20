# Public asset repair: live verification

## Scope

These observations used the owner's connected desktop Brave browser and the
authorized alternate account. Viewport checks are responsive desktop checks,
not physical iPad Safari tests. No password, cookie, account token, private
request URL, or raw authenticated response is recorded here.

## Published changes initially tested

- Runtime v23: `c0b983b180e074e49b088ecb3e0d0c293ce3e863`.
- Website v319: `5cf9e26777cbbece4a798b222f2d5f77aad4bab3`.
- Live page: https://kkeep.fun/roblox.

Runtime v23 serves the inspected public engine files directly from Roblox's
CDN after the script verification described in
[Engine asset delivery](roblox-public-assets.md). Website v319 adds a manual
"Try standard graphics" action for an active WebGL game, using the existing
fresh-launch path and retaining its game, frame-rate policy and relay choice.

## Results before the launch-page delivery repair

1. A fresh WebGL launch of Timebomb Duels displayed the actual map, avatar,
   interface and other players at approximately 202 seconds, including a cold
   engine download. A visible scene, rather than transport or loader status,
   is the gameplay evidence.
2. Focusing the canvas and holding W for two seconds changed the avatar and
   camera position.
3. Resizing that running game to 1180 × 734 and then 820 × 1100 kept the game
   visible and filled the available viewport. The viewport override was reset.
4. A fresh WebGL rejoin failed with an engine-worker `RuntimeError`:
   `operation does not support unaligned accesses`. The projected browser
   location was `WebClient.js:405:518`. That location is the generic fatal
   rethrow, not the original native instruction. This run does not establish
   a successful rejoin or identify the cause of the native trap.
5. The official CDN Wasm binary, file index and normalized loader scripts were
   compared with the inspected provider build. The binary and index matched
   exactly; the known WasmPlayer CDN literal normalization produced the exact
   saved fixture. No missing binary modification was found.
6. Reloading the website after v319 preserved the authenticated catalog.
   Two subsequent Resume attempts stalled before the game document loaded.
   The iframe eventually displayed a plain HTTP 524 response.
7. Production logs show the exact public `/games/start` route timing out after
   125,010 ms at 17:42:36 UTC on 2026-11-20. A second live attempt again returned
   HTTP 524 after approximately 128 seconds including browser observation.
   These failures happened before the engine and graphics-switch controls
   could initialize. Returning to the catalog preserved the account session.

![Actual desktop Timebomb scene after movement](roblox-public-assets-desktop.jpg)

![The same running game at a tablet-sized desktop viewport](roblox-public-assets-tablet-size.jpg)

## Boundaries of these results

The first visible game and resize checks passed. The later WebGL rejoin did
not pass. A successful first launch must not be reported as proof that
rejoining, every experience, or physical iPad Safari is fixed. The optional
locale wait and public launch-page delivery work require their own tests and
post-publication observations.

## Runtime v24: pinned launch page

Runtime v24 (`86e7c8016f133cf303cda47ed27709c5903f8a97`) was published on
2026-11-20 at 18:02:47 UTC. It bundles the inspected public launch page and
its exact dependency closure, and bounds the optional locale request. See
[Pinned launch delivery](roblox-pinned-launch.md) for the build identity,
resource verification, and the 285 passing runtime tests.

Post-publication observations on the same connected desktop browser:

1. A fresh game launch reached engine download instead of waiting for the
   previous upstream launch-page timeout. At about 23 seconds the loader
   reported 85.4 MB downloaded.
2. The explicit **Try standard graphics** action restarted the experience.
   The engine console then reported `[WasmPlayer] Selected WebGPU`. This is
   the selected engine backend, not merely the requested UI preference.
3. Timebomb Duels displayed the actual map, avatar, game interface, and other
   players in approximately 55 seconds after that restart. Focusing the
   game canvas and holding W for two seconds moved the avatar and camera.
4. **Rejoin this game**, without resizing the 1440 × 895 viewport, reached
   another visible game server in approximately 63 seconds. The engine again
   selected WebGPU; movement was verified again.
5. The rejoined game remained visible after resizing to 1180 × 734 and
   820 × 1100. Once the resize was consumed, canvas CSS dimensions and backing
   dimensions matched each requested viewport. The viewport override was
   reset afterwards.
6. Returning to the Roblox menu preserved the authenticated account. An
   explicit Sign out disabled its control while pending, then opened the
   sign-in page. The expired captured cookie was correctly rejected. A fresh
   password login remains under verification: the login frame intermittently
   stalled, and its loading-timeout panel covered the form even when a later
   DOM observation contained the form.

![Actual v24 WebGPU game after movement](roblox-pinned-webgpu-desktop.jpg)

![The rejoined v24 game at a tablet-sized desktop viewport](roblox-pinned-webgpu-tablet-size.jpg)

These observations establish successful desktop WebGPU play and rejoin for
this experience. They do not establish a successful post-v24 WebGL rejoin,
a fresh password login, or physical iPad Safari compatibility. The earlier
native WebGL rejoin trap is not declared fixed by these WebGPU results.

## Runtime v25: fresh-login verification

Runtime v25 (`b15c4682920040d50911c51968f33ea2aad5735d`) was published on
2026-11-20 at 18:29:23 UTC. The [sign-in form recovery](roblox-signin-form-recovery.md)
passed all 296 runtime tests and independent review before publication.

The live check started from the explicitly signed-out account. Roblox's
proxied navigation shell again loaded slowly and exceeded the page deadline.
When the complete, usable login form arrived, the new readiness check removed
both the runtime timeout cover and the parent application's error cover
automatically. A screenshot confirmed that the actual form was visible and
usable without clicking through the covers.

One password sign-in with the authorized alternate account returned to the
authenticated catalog; no CAPTCHA was shown. A full website reload retained
the verified account. Resume then opened Timebomb Duels and displayed the real
game scene again. No password, cookie, account token, or authenticated request
is recorded in this report or in the test fixtures.

The WebGL fallback check started through the visible **Try compatibility
graphics** control at approximately 18:36:14 UTC. The engine console confirmed
`[WasmPlayer] Selected WebGL` at 18:36:41 UTC, while the loader reported
67.7 MB downloaded. Browser access then became unavailable at 18:37:49 UTC,
before the next screenshot could be captured. The final rendered scene,
movement, and a further WebGL rejoin were therefore not observed. This run
must not be reported as a passed gameplay check. Physical iPad Safari still
has not been tested in this environment.
