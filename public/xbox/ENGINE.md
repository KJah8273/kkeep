# Xbox Cloud Gaming engine

Xbox uses a separately scoped copy of Kkeep's repaired Scramjet V2 build:
MercuryWorkshop/scramjet e9ff92d1ec98ba140cb4bca840fb40c2b9b52ebf,
core 2.0.67-alpha.2, controller 0.0.14, AGPL-3.0-only.

Run `node scripts/build-geforce-runtime.mjs` then
`node scripts/build-xbox-runtime.mjs` to reproduce the Xbox assets from the
vendored GeForce V2 sources. The normal build runs both. Upstream hashes and
patch provenance are in `scripts/vendor-geforce-engine.py` and `public/gfn/ENGINE.md`.
Source is offered at `/source/kha-proxy-source.zip` and `/source/scramjet-e9ff92d.zip`.

The generator changes only the Xbox copy: `/xbox/` worker and browse routes,
Xbox cookie database/broadcast namespace, labels, and the request profile.
It inherits Safari stream transfer, cookie/WebSocket, native OAuth popup,
module identity and controller restart fixes. Microsoft redirects and callbacks
stay in this engine. No credentials or account identifiers are logged.

The Xbox-only media hook gives video elements inline playback on iPad and
cleans up on navigation. Fullscreen has an in-page fallback, normal 100% sizing,
safe-area spacing and 44px buttons. The manifest opens the Xbox launcher when
installed to the home screen. It does not fake standalone mode or device identity.

HTTP and WebSocket requests use Kkeep's relay. WebRTC remains the browser's
native connection; this HTTP proxy is not a VPN or a UDP/TURN relay. Region,
account, subscription, codecs and provider checks remain controlled by Xbox.
Successful launcher tests do not prove authenticated game streaming works on an iPad.

Validation on 2026-10-04: 102 regression tests, TypeScript and diff checks passed.
Browser QA covered the home shortcut, Xbox-only launcher, inline error/retry UI,
fullscreen/show-controls and return-home navigation. The managed HTTP preview
cannot activate HTTPS-only service workers; a direct check of the hosted relay
from the execution environment returned HTTP 403 without upstream metadata.
No completed Microsoft login or streamed game has been verified in this environment.

Sign-in compatibility revision 4 (2026-10-04): controller injection uses an
already initialized client's saved native service-worker container. The pinned
injector otherwise throws before its existing `syncDocumentInit` branch when
an early frame hook has hidden `navigator.serviceWorker`. Only Xbox is patched.
Microsoft's deferred form receives the normal 45-second startup window, and a
DOM observer clears stale loading/error UI when visible sign-in controls arrive.
It reads no input values, changes no Microsoft authentication settings, and
does not change OAuth parameters, POST methods, device identity or credentials.

Microsoft's existing blank-form telemetry is classified into fixed error labels
for Xbox requests only. Raw telemetry, messages, stack traces, URLs, account
identifiers and credentials are never logged by this classifier.

Verification: the initialization failure is reproduced against the original
injector and passes against the patched Xbox injector. Browser QA rendered an
anonymous Microsoft form in a local fixture with the real rewritten bundles
and repeated controller initialization. The fixture substitutes local resource
delivery because the managed preview has no HTTPS service worker; this is not
an end-to-end login test. Live relay checks returned Microsoft's sign-in HTML,
JavaScript and configuration successfully. The user's exact blank-page cause
has not been conclusively established; the fixed-label diagnostics cover a
remaining startup failure without capturing account data.

Sign-in window revision 5 (2026-10-04): revision 4 did not resolve the user's
blank Microsoft form. The root cause remains unconfirmed. A user-initiated
Sign-in window now opens the exact Microsoft destination as a top-level
Scramjet document, using the existing Xbox controller, cookie jar and native
opener/sessionStorage relationship. This does not open the original website,
change OAuth parameters or submit any credentials. Keep the launcher open.
The window returns to the launcher only after Xbox's callback has finished
and a cloud-play page loads. Closing or blocking the window is handled without
claiming login success. The window is a recovery path, not a completed-login
guarantee. Microsoft's guidance on embedded authentication informed this path:
https://learn.microsoft.com/en-us/entra/msal/javascript/browser/iframe-usage

The final Microsoft document is tracked before its scripts initialize, so a
bootstrap failure cannot hide the sign-in window control or leave the launcher
pointing at Xbox's earlier redirect. An Xbox-only diagnostic script runs before
the engine on Microsoft documents. It observes startup exceptions and whether
controls appear for at most 20 seconds, then removes its listeners and timers.
It sends only fixed labels, script categories, bounded positions and boolean
layout flags to `/api/xbox-status`. No input values, URLs, messages, error stacks,
OAuth state, account identifiers or cookies are included. The endpoint validates
and bounds reports and deduplicates them. Connection details expose the same
safe fields when startup fails. Existing third-party telemetry is unchanged.

Local QA used the actual controller Frame, FetchHandler, URL codec, rewritten
Microsoft HTML and deferred bundles. The helper opened a separate proxy window;
the startup monitor reported visible sign-in controls there, and a top-level
render was inspected. Native service-worker routing and remote transport were
substituted in this HTTP-only fixture. No account credentials were entered,
Microsoft callback completed or cloud game streamed. Temporary Microsoft
resources and the development fixture are not included in the publication.
