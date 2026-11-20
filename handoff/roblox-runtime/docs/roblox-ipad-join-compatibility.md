# iPad joining and performance compatibility

## Report and evidence

The latest report says PC gameplay works while iPad Safari remains on Tower of
Hell's “Joining server” screen, becomes slow, and stops. The screenshot shows a
loading screen, not a confirmed transport close or a JavaScript exception.
There is no authenticated physical-iPad trace establishing a single cause.

Inspection established two local inconsistencies:

1. The runtime and platform selector recognize desktop-UA iPads, but the pinned
   player's separate `module.isMobileDevice()` predicate did not. Its native
   `is_mobile_browser` import could report desktop while the loader selected
   iOS settings and the mobile drawing budget.
2. The provider ignores its performance/FPS query on `iOSWebClientApp`. Before
   this change, public credentialless production requests for performance at 30
   and 60 FPS returned identical application settings. Neither included
   `DFIntTaskSchedulerTargetFps`. The equivalent `WebClientApp` request included
   the requested cap. The host's “30 FPS target” therefore did not establish
   that the iOS engine actually received that cap.

Safari also has a reported WebTransport reliable-stream stall where readiness
resolves but data stops while the transport remains open. WebKit reports
[319818](https://bugs.webkit.org/show_bug.cgi?id=319818) and
[317084](https://bugs.webkit.org/show_bug.cgi?id=317084) describe this condition,
including Safari 27.2. This motivates an iPad connection workaround; it does not
prove that this user's connection encountered that browser defect.

## Changes

### Connection choice

An ordinary iPad launch uses the existing relay. Detection occurs on the owning
page using either an iPad user agent or MacIntel with more than one touch point.
The page forwards a strict boolean to owned blob and direct-stub engine workers;
workers never guess iPad from a Mac-like worker user agent.

Explicit relay starts immediately. Explicit native/auto choices and a fresh
saved forced-native choice retain their precedence. The saved preference lookup
is bounded to 750 ms, so inaccessible or stalled IndexedDB cannot indefinitely
block selection. Ordinary PC, Android and iPhone launches keep their prior
connection selection. Endpoint selection, certificate data, packet framing,
streams and backpressure remain unchanged.

### Device classification and frame rate

The inspected player's separate mobile predicate now uses the existing runtime
classification first and retains its original Client Hints/UA fallbacks. The
engine, platform selector and canvas sizing consequently agree for iPads that
advertise a desktop user agent.

An unconfigured iPad starts at 30 FPS. The main site's explicit saved 30/60 choice
wins over that default; a default is never recorded as an explicit choice. Other
device defaults remain 60 FPS.

Before the provider hook runs, the game document receives its selected FPS via
an in-place URL update. This retains the original place, server, job and launch
parameters. The public preference precedence is the current game query, saved
runtime preference, public FPS cookie, then device default. Storage and cookie
operations are guarded independently so a failed write cannot abort setup.

The catalog retains the resolved public FPS choice in memory and adds it to the
single existing launch navigation. That navigation still passes through the
provider's `/play/<placeId>` path, where its browser worker records the selected
server. The public redirect then copies only the validated FPS choice into the
same game's canonical destination. A valid explicit cap already present on the
returned destination is preserved. This needs no referrer: the existing
`Referrer-Policy: no-referrer` remains intact. No account data is copied, and
there is no second API call, new game document or replayed join.

For the exact allowlisted iOS application settings route, a successful JSON GET
with one valid performance tier and 30/60 FPS query receives a local
`DFIntTaskSchedulerTargetFps` override. Every unrelated iOS flag is preserved.
Desktop and other application settings retain their original behavior. Invalid
or ambiguous requests, error responses and malformed settings are not replaced
with invented defaults. Existing renderer selection remains available.

## Recovery and limits

The existing bounded Loading help/rejoin behavior remains in place for detected
failures. This change does not force a new join merely because time has elapsed
or a native lifecycle callback is absent: normal desktop gameplay has already
demonstrated that those callbacks can be absent. It does not replay credentials
or clear the visitor's sign-in session.

The existing mobile drawing budget, full CSS viewport, Wasm heap and worker pool
are retained. There is no measured basis here to reduce them further.

Automated regression checks exercise the real transformed provider hook and
player code with controlled platform, storage and transport inputs. They verify
preference delivery into the engine, not sustained gameplay on physical Apple
hardware. Real-device gameplay and an authenticated end-to-end join remain
outside the available test environment.

Final integration validation passed all 395 runtime tests and all 70 host
player/view/touch-launch tests. TypeScript checking, both production builds,
generated server syntax checks and diff checks passed. A regression discovered
during integration was corrected by changing only the native mobile callback;
the provider's original DPR calculation and explicit full-resolution behavior
remain intact and are covered by the final passing suite.
