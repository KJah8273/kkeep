// Only the pinned, public engine bytes may outlive a proxy session.
export function proxyEngineAsset(path:string):string|null{
 return /^\/browse\/[a-z0-9]+\/[a-z0-9]+\/scramjet\.wasm\.js$/.test(path)?'/engine/scramjet.wasm.js':null;
}
