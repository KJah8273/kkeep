# Native presentation and the loading-screen handoff

## Scope

This repair applies only to the inspected `version-1ef59424f70d4932` engine.
It prevents the HTML loading screen from beginning its dismissal before a
subsequent native WebGPU frame submission, when the engine has already
configured the game canvas. It does not detect nonblack pixels, game content
readiness, successful asynchronous GPU validation, or playability.

The controlled desktop investigation also established that Timebomb could
become visible after approximately 117 seconds without a viewport change or
canvas click. The earlier observation of a picture appearing after a resize
therefore does not establish a resize defect. This change does not resize the
canvas, change the renderer, or alter graphics flags.

## Inspected source boundaries

The saved provider loader in `tests/fixtures/WasmPlayer-1ef.js` installs:

```js
window.__onDefaultLoadingScreenRemoved = () => f.dismissAfterRenderedFrame();
```

Its original method sets `experienceLoaded`, waits for two page animation
frames, and calls `dismiss()`. Neither animation-frame callback observes the
native renderer. The final dismissal adds the existing 600 ms fade.

The saved engine in `tests/fixtures/WebClient-1ef.js` implements the native
`presentBrowserFrame` import with this function (spacing expanded):

```js
function Ya(e, r, n) {
  const t = l.getJsObject(e);
  const a = l.getJsObject(r);
  const i = l.getJsObject(n);
  const o = f.canvas.getContext("webgpu");
  const s = t.createCommandEncoder();
  const c = o.getCurrentTexture();
  s.copyTextureToTexture(
    { texture: a }, { texture: c },
    [Math.min(a.width, c.width), Math.min(a.height, c.height), 1]
  );
  const u = s.finish();
  t.queue.submit([i]);
  t.queue.submit([u]);
}
```

In the inspected Wasm binary, import 242 (`presentBrowserFrame`) has one native
caller, function 124229. Its profiling labels are `Render` / `finishFrame` and,
around this import, `Render` / `submitFrame`. It supplies the native finished
render command buffer and presentation texture. Observing the return of the
second submit is consequently a native presentation submission boundary,
rather than a generic upload, a page animation callback, or an FPS sample.

The native WebGPU surface-configuration import is `y_`. After its original
`n.configure(a)` returns, the transform marks the module only if
`n.canvas === f.canvas`. Renderer preferences, `navigator.gpu`, and a
preinitialized device do not establish this marker. Failed configuration and
configuration of another canvas do not establish it either.

The callback uses the same module object in the actual provider, independently
of the test harness. `Je` assigns `window.Module=s` and then invokes
`createWebClient(s)`. The factory begins `async function(oe={}){var f=oe,...`
and returns `f`; this initial alias is the only assignment to `f` in the saved
engine. The native `y_` and `Ya` functions close over that object.

## Behavior

1. The default-loading-screen callback retains the existing immediate
   `experienceLoaded` assignment. This preserves the provider's distinction
   between unrelated browser errors and accepted engine failures.
2. If the native game canvas has been configured for WebGPU, the loading
   screen registers one callback on its own module and displays
   “Preparing the first game frame…”. Frames submitted before this registration
   do not satisfy it.
3. The next call to the actual native presentation import invokes that
   callback only after both original `queue.submit` calls return. It removes
   itself and starts the existing two-animation-frame and fade sequence.
4. Accepted engine failures, a new `prepare()`, explicit dismissal, and the
   provider's Cancel/Leave buttons clear the same pending callback. Retained
   callbacks from an earlier arm cannot satisfy a new arm.
5. Native `leave` and `native_exit` results already call `f.dismiss()` before
   navigation in the inspected loader; that path also clears the pending arm.
6. Without a subsequent submission, the loader stays visible. There is no
   timeout that declares loading successful or invents a fatal renderer error.
   The existing Cancel/Leave action remains available. The parent application's
   “Show player” action does not dismiss this inner loading screen.

If the native configure marker is absent at default removal, the existing
loader behavior is preserved. This includes WebGL and native WebGL fallback.
The patch does not claim to handle a WebGPU configure that first occurs after
that callback: cross-thread initialization ordering has not been established
strongly enough to hold an otherwise unknown renderer indefinitely.

## Deliberate limits

Returning from `queue.submit` establishes submission, not asynchronous GPU
validation or a visible game picture. A game can submit a black frame or remove
its default loading screen before its own content is ready. Those cases remain
outside this change's guarantee.

The repair adds no GPU calls, readbacks, textures, command encoders, queue
synchronization, network requests, or raw-log storage. In particular it does
not call `onSubmittedWorkDone()`: queue completion would still not establish
nonblack content. The original GPU argument values, call order, exceptions,
and return value are preserved. Errors thrown only by the optional UI callback
cannot interrupt the native frame.

## Regression evidence

`tests/presentation.test.mjs` executes the actual provider loading-screen
class, callback, native configure import, and native presentation import in
one VM. It reproduces the original premature dismissal, then verifies:

- No dismissal without a native submission after the arm, even after repeated
  page-frame advances and loading callbacks.
- Unchanged GPU call order, copy bounds, command-buffer identities, and return
  value, with no extra GPU synchronization call.
- No success notification after texture acquisition, copying, encoding, or
  either queue submission throws.
- Actual configure-based renderer selection, including failed configuration,
  another canvas, stale preferences, and a preinitialized device without an
  actual native WebGPU surface.
- Cancellation during the native wait, both animation callbacks, the fade,
  failure handling, a new prepare, explicit native exit, and Cancel/Leave.
- Failure-closed source transforms when the inspected provider contracts
  change or duplicate the native presentation function.

The existing post-join failure, native-output, and WebGPU-error suites remain
part of the focused verification. Live browser verification is still required
before describing a change in the length of the observed blank interval.
