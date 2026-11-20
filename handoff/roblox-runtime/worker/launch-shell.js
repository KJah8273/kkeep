import pinnedLaunchData from './launch-data.json' with {type:'json'};

// Only the inspected static export and its exact bootstrap dependencies are
// bundled. User-channel, session, account, join and platform-settings requests
// keep their existing live routes. The document's query stays in the browser.
const launchDocumentPath = '/_/cGxheS5yb2Jsb3guY29t/games/start';
const launchStubPath = pinnedLaunchData.assetPrefix + '/assets/webclient/stub.js';
const launchBodies = new WeakMap();

export function pinnedLaunchResource(url, method = 'GET') {
  if (!['GET','HEAD'].includes(method) || url.hash) return null;
  if (url.search && url.pathname !== launchDocumentPath && url.pathname !== launchStubPath) return null;
  return Object.hasOwn(pinnedLaunchData.resources,url.pathname) ? pinnedLaunchData.resources[url.pathname] : null;
}

export async function verifyPinnedLaunchBody(resource) {
  const bytes = resource.encoding === 'utf8' ? new TextEncoder().encode(resource.body) :
    resource.encoding === 'base64' ? Uint8Array.from(atob(resource.body), value => value.charCodeAt(0)) : null;
  if (!bytes || bytes.byteLength !== resource.bytes) throw new Error('Pinned launch resource changed');
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  const hash = Array.from(new Uint8Array(digest),value => value.toString(16).padStart(2,'0')).join('');
  if (hash !== resource.sha256) throw new Error('Pinned launch resource changed');
  return bytes;
}

export async function pinnedLaunchResponse(resource, method = 'GET') {
  let pending = launchBodies.get(resource);
  if (!pending) {
    pending = verifyPinnedLaunchBody(resource);
    launchBodies.set(resource,pending);
  }
  // Verify HEAD too. Never expose an unchecked body, or fetch another source
  // after an integrity failure. The gateway applies its existing transforms.
  const body = await pending;
  return new Response(method === 'HEAD' ? null : body,{status:200,headers:{'Content-Type':resource.type}});
}
