/* AGPL-3.0-only. GeForce's Scramjet controller restart coordination.
 * This is prepended to the isolated worker by vendor-geforce-engine.py.
 * No request is retried after dispatch, including OAuth POST requests.
 */
globalThis.__kkeepCreateGfnLifecycle = function (controllers) {
  const pending = new Map();
  let waking;
  const rootFor = value => {
    try {
      const url = new URL(value, self.location.href);
      if (url.origin !== self.location.origin) return null;
      return /^\/gfn\/browse\/[^/]+\//.exec(url.pathname)?.[0] || null;
    } catch { return null; }
  };
  const find = value => {
    const root = rootFor(value);
    return root && controllers().find(controller => controller.prefix === root);
  };
  const wake = () => {
    // One broadcast for concurrent module, image and popup requests. Include
    // registered IDs so a connected launcher keeps its live message port.
    waking ||= (async () => {
      const clients = await self.clients.matchAll();
      const registered = controllers().map(controller => controller.id);
      for (const client of clients) {
        client.postMessage({ $controller$swrevive: { registered } });
      }
    })().catch(() => {}).finally(() => { waking = undefined; });
    return waking;
  };
  const wait = value => {
    const existing = find(value);
    if (existing) return Promise.resolve(existing);
    const root = rootFor(value);
    if (!root) return Promise.resolve(null);
    if (pending.has(root)) return pending.get(root).promise;
    // Bound orphaned sessions, not the number of requests made by one page.
    if (pending.size >= 64) return Promise.resolve(null);
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const timer = setTimeout(() => {
      pending.delete(root);
      resolve(null);
    }, 8000);
    pending.set(root, { promise, resolve, timer });
    void wake();
    return promise;
  };
  const registered = () => {
    for (const [root, entry] of pending) {
      const controller = find(root);
      if (!controller) continue;
      pending.delete(root);
      clearTimeout(entry.timer);
      entry.resolve(controller);
    }
  };
  return { claims: value => !!rootFor(value), find, wait, registered, wake };
};
