/* AGPL-3.0-only. Included inside the isolated GeForce engine's closure.
 * Static imports must carry the document's initiator origin, as HTML module
 * scripts and dynamic imports do. The upstream WASM bridge incorrectly uses
 * the importing CDN script's origin, giving one ESM two module-map keys.
 * This value exists only during a synchronous rewrite and is restored in
 * finally; native URL objects, browser globals and upstream URLs are untouched.
 */
let kkeepModuleOrigin;
function kkeepGfnModuleOrigin(meta) {
  try {
    const url=new URL(meta.moduleOrigin||meta.origin.origin);
    if(url.protocol==='https:'||url.protocol==='http:')return url.origin;
  } catch {}
}
