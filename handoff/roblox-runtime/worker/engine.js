// Memory overrides are specific to binaries whose imports were inspected and
// linked with this layout. A new upload must not inherit an old heap override.
export const engineProfiles = {
  'version-f807b21caba84809': {memoryPages:16384, memoryFlags:'s', mobileFunction:'pe'},
  // 2026-11-19: 102268042 bytes, SHA-256
  // be370a4446dcfce62635f7e6d271526b15e2099507fb7250b2d3360eacd4a61f.
  // env.memory: shared32, min 4096 / max 65536 pages. Compiled and linked
  // with initial=maximum=16384 and function stubs; this is not a gameplay test.
  'version-1ef59424f70d4932': {memoryPages:16384, memoryFlags:'i', mobileFunction:'_e'}
};

// Metadata can select only this public CDN's canonical same-origin Wasm path.
// Never follow an arbitrary URL or account endpoint supplied by metadata.
export function resolvePublicEngine(metadata) {
  if(!metadata||typeof metadata.version!=='string'||!/^version-[a-f0-9]{16}$/.test(metadata.version))return null;
  const version=metadata.version;
  const basePath='/_/c2V0dXAucmJ4Y2RuLmNvbQ/webclient/'+version+'-RobloxWebClient';
  const wasmPath=basePath+'/WebClient.wasm';
  if(!Array.isArray(metadata.files)||!metadata.files.includes(wasmPath))return null;
  return {version,basePath,wasmPath};
}
