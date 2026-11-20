# Roblox engine asset delivery

## Observed failure

On 2026-11-20, a fresh signed-in desktop launch stayed on “Loading experience…”
for more than five minutes. Its game transport opened, but that did not prove
that the game had rendered. A compatibility launch then failed before the
player script could start the engine.

Production Worker logs identify HTTP 524 responses from the existing public
asset service, each after approximately 125 seconds:

| File | Response observed in UTC | Time |
| --- | --- | --- |
| `WasmPlayer.js` | 17:07:00 | 125,326 ms |
| `content/fonts/families/SourceSansPro.json` | 17:05:29 and 17:07:34 | 125,012–125,264 ms |
| `content/fonts/families/Arimo.json` | 17:09:39 | 125,011 ms |

The browser reported the same WasmPlayer URL in its script-load error. This
was an upstream timeout, rather than Kkeep's fail-closed transform returning
502. The official public CDN returned all these files successfully. The
session, channel and version lookup stages had completed before the failed
script was appended.

## Change

The gateway now delivers a narrow set of immutable public files directly from
`setup.rbxcdn.com`, for the inspected `version-1ef59424f70d4932` build only:

- The three verified executable files: `WasmPlayer.js`, `WebClient.js`, and
  `audio-processor-fast.js`.
- The engine file index and Wasm binary.
- Data under `content/`, `ExtraContent/`, `PlatformContent/`, and `shaders/`.

The encoded host must be canonical. Requests with queries, another build,
unrecognized executables, unsafe path segments or other methods do not enter
this delivery path. Direct requests carry no account cookies or authorization
and do not follow redirects. Account requests still use the existing local
session worker.

The direct WasmPlayer source differs from the inspected provider fixture by
one CDN URL literal. After that exact normalization, its complete SHA-256 must
match the fixture. WebClient and audio use their inspected raw hashes. Existing
Kkeep transforms then run unchanged. A changed script is never served as a
verified replacement. An unsuccessful or unverifiable direct response falls
back to the existing delivery service.

Headers have a 12-second deadline. Streaming data has a 20-second idle
deadline, reset by progress, with backpressure and downstream cancellation.
This avoids buffering the roughly 100 MB Wasm binary or rejecting a slow but
active iPad download. Small script verification additionally has an absolute
12-second body deadline and a 1 MiB limit. A timeout rejects before canceling
the reader, so cancellation cannot turn a partial file into successful EOF.
Executable MIME types are rejected on the data-only path.

The existing session protocol revision remains `join18`; no account state or
session migration is required for this asset-only change. `/health` exposes
`assetDelivery: "verified-public-cdn"` to distinguish the deployed repair.

## Source and pre-deployment checks

Ordinary public CDN requests confirmed exact WebClient fixture equality and
normalized WasmPlayer fixture equality. The current font families, application
configuration, and file index returned 200. The index contains 2,913 assets;
the WebGPU shader pack is about 31.7 MB and remains streamed.

The complete gateway was also exercised against the real public CDN. Both
scripts returned 200 with the existing Kkeep session/presentation transforms,
SourceSansPro JSON returned 200 and parsed, the audio processor returned 200,
and a HEAD-only Wasm request returned 200 with `application/wasm`. No large
binary was downloaded for this check.

These network and source checks are not a claim of successful gameplay. Live
game visibility, rejoin, and the limits of device testing must be recorded
separately after deployment.

## Sign-in recovery included in this release

The catalog's exact `Browser session is not ready (session-version)` error now
offers a manual “Reload Roblox” action. This replaces the outdated document
instead of rerunning its captured older session client. Other errors retain
the ordinary Retry action. The strict revision gate and saved account state
are preserved.

Older test harnesses were brought into line with the existing atomic session
ownership implementation by executing the real provider database helpers
against isolated IndexedDB. Their logout, rejected late-response, retry, and
Back to sign-in assertions remain in force; no additional production
authentication behavior was changed for the harness repair.
