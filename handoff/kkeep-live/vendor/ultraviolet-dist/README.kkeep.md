# Kkeep Ultraviolet integration

Upstream: @titaniumnetwork-dev/ultraviolet 3.2.10, AGPL-3.0-only.
The unmodified npm distribution, including embedded original sources in its source
maps, is served at /source/ultraviolet-3.2.10.tgz.

Kkeep appends lib/uv-relay.js to uv.bundle.js. It uses Kkeep's existing filtered
HTTP /api/relay and WebSocket /api/socket endpoints rather than a separate BareMux
transport. public/uv/runtime.js is the browser UI adapter; uv.config.js and sw.js
register an independent /uv/ service-worker scope. Scramjet remains independent.

Run `node scripts/build-ultraviolet.mjs` with Node 22+ and GNU tar to regenerate
the public files and the integration source archive. No npm install is needed
for this step. Build inputs are the pristine files in vendor/ultraviolet-dist
and the integration files in this archive. The application's normal build runs
this step before Vite.

The integration and changes are AGPL-3.0-only. Upstream notices are preserved.
