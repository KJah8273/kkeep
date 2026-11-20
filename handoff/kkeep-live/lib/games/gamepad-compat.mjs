// Game engines probe gamepads even when their player is using touch. Safari
// may deny that optional API inside an opaque iframe; keep touch input alive.
export function installGamepadCompatibility(navigator) {
  for (const name of ['getGamepads', 'webkitGetGamepads']) {
    const original = navigator[name];
    if (typeof original !== 'function') continue;
    try {
      Object.defineProperty(navigator, name, {configurable: true, value: function () {
        try { return original.call(navigator); }
        catch (error) {
          if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return [];
          throw error;
        }
      }});
    } catch { /* A browser may make its native API non-configurable. */ }
  }
}

// Offline cache registration is optional. Opaque game frames deliberately
// cannot register a worker on Kkeep's origin or take control of its pages.
export function installIsolatedWorkerCompatibility(navigator) {
  try { void navigator.serviceWorker; return; }
  catch (error) { if (error?.name !== 'SecurityError') return; }
  try { Object.defineProperty(navigator, 'serviceWorker', {value:undefined, configurable:true}); } catch {}
}
