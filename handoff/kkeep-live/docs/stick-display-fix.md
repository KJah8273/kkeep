# Stick Fight display correction — 2026-10-22

Baseline: version 141, commit bf20534e564c4f36c16aa345dd2901e56e56c8ad.

The official current framework's WebPortInstallUI disabled Unity canvas-size
matching, installed a new full-window wrapper and then manually resized the
canvas backing buffer at startup, quality changes and automatic quality changes.
That defeated the previous wrapper-only fix and changed the drawing-buffer size
without letting Unity coordinate its viewport and projection.

The asset adapter now applies two exact, guarded replacements to this embedded
UI: enable Unity canvas-size matching and pass the computed quality ratio through
Module.devicePixelRatio instead of assigning canvas.width/canvas.height directly.
All networking, controls, game data and persistence code remains byte-identical.
Unknown frameworks are passed through unchanged. Framework processing is capped
at 2 MiB; large data/wasm assets remain streamed. The runtime URL and framework
request are versioned so cached old adapters are not reused.

The canvas stays centered at 16:9 even after the game creates its own wrapper.
The game's original controls and menus continue using the full viewport.
Portrait necessarily has unused space to preserve the complete wide arena.

Validation: all 266 automated tests pass, including a reproduction using the
actual upstream sizing function and delivery through the asset endpoint.
TypeScript passes. Confirmed both replacements apply to the current complete
842688-byte official framework. Cloud Chrome CSS checks with the game's own
inline styles measured 1536x864 within 1536x875, 768x432 within 768x1024, and
1024x576 within 1024x650; all centered and fully contained. These are layout
checks, not physical iPad or full gameplay verification. The preview game itself
could not finish startup, so an on-device visual confirmation remains necessary.

Rollback: redeploy version 141. No storage migration or deletion is required.
