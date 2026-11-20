# Recovery when an established game connection closes

## Observed failure

The supplied iPad screenshot shows rendered gameplay followed by the game's own
Disconnected dialog with error 277. The player reports that this happens about
five to ten seconds after joining.

Production runtime logs contain `transport-closed / WebTransportError` at
2026-11-20 20:47:11 UTC (2026-11-21 00:47:11 in Dubai), matching the screenshot's
minute. That isolated record does not identify the selected connection mode or
establish why the remote connection ended. Nearby analytics 404s do not establish
a game asset or join failure.

The runtime previously recognized a disconnect through the webpage's visible
loading-error panel. The game's own canvas dialog need not expose that panel.
Its transport observer also treated every close as advisory, so a real loss
after a successful handshake could leave the host without a failure event.

Inspection found no local five-to-ten-second timeout after a transport is
adopted. Adoption clears the native/relay startup timer; its settled guard also
rejects a late timer callback. The provider's ten-second reporting interval does
not close the transport. No speculative heartbeat or packet changes are made.

## Connection ownership and reporting

The observer distinguishes an unexpected close of the current, ready transport
from a failed candidate, an explicit close, or a retired connection. Only the
first condition emits the bounded `transport-lost` stage. The existing
`transport-closed` stage remains advisory.

Both provider startup orders are covered. If the page's first bootstrap observes
the native constructor, and the provider then replaces it with its native/relay
selector, the engine bootstrap refreshes the observer around that selector. It
retires the inner observer and keeps one owned-worker message bridge. This also
covers relay closes rather than observing only the rejected native candidate.
The provider retains its engine workers between uses, so each forwarding hop
also tracks the worker that owns the newest connection. Retired or terminated
workers cannot publish a loss or replace the current connection mode. Selection
and readiness are delivered for each new connection; the provider's duplicate
page-only callbacks are removed because they bypassed that ownership check.

Diagnostics contain fixed stage and error-name enums only. They do not include
connection targets, certificate hashes, credentials, cookies, account data,
request bodies, arbitrary exception text or game packet contents. The stream
promises, writers, packet bytes and backpressure remain unchanged.

## Recovery behavior

The runtime forwards the confirmed loss and emits `failed / transport-lost`
once. It uses generic connection-loss wording: a browser transport event does
not prove that the game supplied numeric code 277. Explicit game exit and page
disposal suppress recovery. A loss observed during BFCache suspension is deferred
until restoration; a replacement connection retires the pending old loss.
Existing definitive failures retain their explanation.

The host opens Loading help and uses its existing bounded recovery plan: switch
to a fresh relay join when appropriate, or request a fresh connection if already
using the relay. The selected experience, frame-rate setting and graphics choice
are preserved. Recovery retains the existing two-attempt budget and three-/six-
second backoff. It waits while offline or hidden and respects Stop. It does not
replay sign-in requests, clear the browser session or supply credentials.

A late ordinary running/loading message cannot cancel a terminal connection
failure for the same launch. A real new launch or manual restart resets that
terminal marker. A late connection failure after Exit cannot cover or restart
the menu.

## Verification boundary

Regression tests exercise the actual transformed provider startup stubs with
controlled transport promises, including native and relay selection, candidate
fallback, ready-then-close, intentional close and replaced ownership. Runtime
and host tests cover the corresponding help/rejoin events and lifecycle races.
These establish the code paths and recovery behavior. They do not prove that a
physical iPad can sustain an authenticated live game or that an external game
server or relay will remain connected.

Final validation passed 367 runtime tests and 65 combined host player, view and
touch-launch checks. TypeScript, both production builds and generated server
syntax checks also passed. Independent review found no remaining blocker in
this scoped detection and recovery change.
