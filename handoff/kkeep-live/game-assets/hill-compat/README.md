# Hill Climb Racing compatibility engine

This is the existing NotRexed/HillClimbRacingPort game at commit
`7467bb544dff9871a1a6dfd15407ecd48bd06bb9`. Only the Wasm suspension ABI is
converted, using Binaryen 133 Asyncify. Game data, image.bin, the original
JavaScript save implementation, native game controls and gameplay are retained.
Browsers with JSPI continue using the original binary and suspension runtime.

The compatibility binary additionally guards 127 function bodies of 40–160 KB
against WebKit's memory-intensive optimizing compiler (OMG). A closed block
skips unreachable nops before each original body, making it 160 KB; all original
instructions, indices, data, tables and exports stay byte-identical. This is the
workaround described in [WebKit bug 304810](https://bugs.webkit.org/show_bug.cgi?id=304810#c11)
and its [controlled reproducer](https://github.com/frankhinek/webkit-wasm-compiler-memory-repro).
It keeps those functions in Safari's baseline tier; execution speed may differ.
`scripts/guard-hill-wasm.mjs` applies the guard after Asyncify, and the tests
remove it to verify the original converted binary's exact SHA-256. This is a
mitigation for a documented Safari failure, not proof of the user's crash cause.

`hill-runtime.js` releases the Wasm download after successful initialization and
image.bin after a successful copy, limits the duplicate data range cache to
16 MiB, and closes uploaded ImageBitmaps. Only the converted runtime forces the
original game's vsync mode, avoiding millions of polling promises per minute.
Its frame/timeout race cancels the losing callback, including in hidden tabs.
The game's own timer cap (60 FPS by default) is retained. The shared rAF pacer
introduced in version 234 was removed after real iPad reports of lag and
unresponsive controls. A single shared deadline across guest yields is not a
reliable substitute for the engine's timer. Native JSPI pacing is unchanged.
The bounded cache and guarded Wasm binary are unchanged as well.

`hill-input.js` forwards contacts immediately to the original guest input
exports. It keeps the game's own hit targets and letterbox coordinate mapping.
On touch-capable browsers it uses native TouchEvents, with PointerEvents for
mouse, pen and browsers without TouchEvents. The streams are not duplicated.
Contacts retain distinct IDs while held; window-level release/cancel, lost
capture, blur, pagehide and document visibility changes clear held controls.
A new touch explicitly restores guest focus. No extra controls, input polling,
synthetic keys or animation-frame input delay are added. Keyboard delivery is
unchanged. `tests/hill-input.test.mjs` covers multi-touch, duplicate streams,
orientation, cancellation, background recovery and repeated contact lifetimes.

`scripts/build-hill-compat.py` downloads and verifies the compiler and original
engine, runs the pinned transformation, verifies the result, and regenerates
the compressed engine and public manifest. The engine is deployed with the
site as a static asset. `worker/hill-engine.ts` returns its exact Brotli bytes
with `Content-Encoding: br` and Cloudflare's `encodeBody: manual`; browsers
decode it through their existing HTTP support. No browser DecompressionStream
or separate upload service is required. The client verifies the decoded Wasm
checksum before starting the game.

The continuation fixture is built with:

```
wasm-as tests/fixtures/hill-compat/continuation.wat -o /tmp/hill-continuation.wasm
wasm-opt /tmp/hill-continuation.wasm --asyncify --pass-arg=asyncify-imports@env.pause --pass-arg=asyncify-asserts -o tests/fixtures/hill-compat/continuation.wasm
```

The fixture covers indirect calls, concurrent guest stacks, repeated async
operations, synchronous input between suspended threads, and failed async reads.
Full engine probes run with `HCR_PROBE_ASSETS` pointing to a directory containing
the pinned upstream hcr.js, joined hcr.wasm, hcr.data, image.bin and converted
hcr-asyncify-optimized.wasm:

```
node scripts/hill-engine-probe.cjs --duration=300
HCR_PROBE_WASM=/absolute/hcr-asyncify-stable.wasm node scripts/hill-engine-probe.cjs --compat --duration=600
```

The compatibility probe removes both JSPI APIs before starting. It uses a stub
graphics driver and verifies engine startup, continued frame production for
the requested duration, repeated held/released touch input through the production adapter, key input,
and live guest
threads. It reports process memory, cache size and continuation counts every
30 seconds, and fails if frames stop for ten seconds. `--baseline` omits the
stability patches and restores the upstream default pacing for comparison.
It does **not** establish real GPU rendering, physical touch behavior, sound
playback, or compatibility with every iPad. Browser QA must still run on actual
affected devices.

Timing statistics exclude the first five seconds of startup. The earlier
Node/stub-driver timing improvement did not predict the real iPad regression;
do not treat those measurements as hardware FPS or proof of a performance fix.
The available cloud browser could load the game but reported WebGL2 context
creation failure, so it could not verify rendered gameplay. It also exposed a
script cleanup handler resolving `URL` through `document.URL`; the handler uses
`window.URL.revokeObjectURL` explicitly.

`tests/fixtures/hill-input-browser.html` is a local-only browser harness for the
production input adapter. Copy it to `public/_hill-input-check.html`, start the
managed preview, run its checks, then remove the temporary copy before building.
The browser check verifies actual DOM event bubbling, passive-event prevention,
two simultaneous contacts, cancellation, focus recovery, no duplicate pointer
stream, and adapter survival across `document.open`. A real browser mouse click
also checks pointer capture/release. Synthetic TouchEvents in desktop Chrome
are not a substitute for physical Safari/iPad validation.
