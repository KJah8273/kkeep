"""Vendor the pinned official Scramjet V2 build and reproducible Kkeep fixes.

Usage: python3 scripts/vendor-geforce-engine.py DIRECTORY
DIRECTORY contains core.tgz, controller.tgz and source.zip from the URLs below.
"""
from pathlib import Path
import hashlib
import re
import sys
import tarfile
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
downloads = Path(sys.argv[1])
destination = root / 'public/gfn/engine'
commit = 'e9ff92d1ec98ba140cb4bca840fb40c2b9b52ebf'
packages = {
    'core.tgz': 'cef9a65e30debda7d87fcf58cf86062cccd1c8879fac83dc98bffe2e34f60612',
    'controller.tgz': '447ee230eac33abf838e4a02345b4141ff3a9c1157580a48ddb5ea845bbf579f',
}
for name, digest in packages.items():
    if hashlib.sha256((downloads / name).read_bytes()).hexdigest() != digest:
        raise SystemExit('Unexpected official release package: ' + name)
with zipfile.ZipFile(downloads / 'source.zip') as archive:
    if not all(name.startswith('scramjet-' + commit + '/') for name in archive.namelist()):
        raise SystemExit('Unexpected source revision')
destination.mkdir(parents=True, exist_ok=True)
for name in packages:
    with tarfile.open(downloads / name) as archive:
        for member in archive.getmembers():
            relative = Path(member.name)
            if member.isfile() and relative.parent == Path('package/dist') and relative.suffix in {'.js', '.map', '.wasm'}:
                (destination / relative.name).write_bytes(archive.extractfile(member).read())

def replace_once(source, old, new):
    if source.count(old) != 1:
        raise SystemExit('Upstream changed: ' + old[:80])
    return source.replace(old, new, 1)

core = destination / 'scramjet.js'
source = core.read_text()
source = replace_once(source, 'e.context.cookieJar.getCookies(e.url,!1)', 'e.context.cookieJar.getCookies(new i.xP(a),!1)')
source = replace_once(source, 'A.addEventListener("open",()=>{c(new Event("open"))})', 'A.addEventListener("open",()=>{l.protocol=A.protocol||"";l.extensions=A.extensions||"";c(new Event("open"))})')
source = replace_once(source, 'o=t.args[2]?(0,n.Qf)(t.args[2]):void 0', 'o=null==t.args[2]?null:(0,n.Qf)(t.args[2])')
source = replace_once(source, 'let u=new i.xP((0,n.v2)(a,t.context));', 'let u=new i.xP((0,n.v2)(a,t.context));for(let depth=0;depth<3&&u.href.startsWith(t.context.prefix.href);depth++)u=new i.xP((0,n.v2)(u,t.context));')
# Preserve module identity across entry scripts, imports and CDN lazy chunks.
# The pinned WASM's only URL.origin bridge reads the static import initiator
# from flags.base (the CDN). Supply the document origin during that synchronous
# rewrite, without changing relative resolution, source maps or native URL.
source = replace_once(source, '(()=>{let e,t,r;',
    '(()=>{' + (root / 'lib/geforce/module-identity.js').read_text() + '\nlet e,t,r;')
source = replace_once(source,
    'meta:{origin:u,base:u,topFrameName:l.topFrame',
    'meta:{origin:u,base:u,moduleOrigin:l.initiatorOrigin,topFrameName:l.topFrame')
source = replace_once(source,
    'h[e]=(0,i.U5)(e,r,a.base);try{let n,c=(0,o.wU)();',
    'h[e]=(0,i.U5)(e,r,a.base);const kkeepPreviousModuleOrigin=kkeepModuleOrigin;kkeepModuleOrigin=kkeepGfnModuleOrigin(a);try{let n,c=(0,o.wU)();')
source = replace_once(source,
    'tag:d,map:g,errors:p}}finally{c()}',
    'tag:d,map:g,errors:p}}finally{kkeepModuleOrigin=kkeepPreviousModuleOrigin;c()}')
source = replace_once(source,
    '__wbg_origin_af09d36f59ea0c32=function(e,t){let r=u(t.origin,',
    '__wbg_origin_af09d36f59ea0c32=function(e,t){let r=u(kkeepModuleOrigin||t.origin,')
core.write_text(source)
shim = (root / 'public/engine/stream-compat.js').read_text()
for name in ['controller.api.js', 'controller.sw.js', 'controller.inject.js']:
    path = destination / name
    source = path.read_text()
    pattern = r'this\.methods=e,this\.id=t,this\.sendRaw=([ro])}recieve\(e\){'
    replacement = r'this.methods=e,this.id=t,this.sendRaw=(d,x)=>{const [p,q]=globalThis.__kkeepStreams.pack(d,x);\1(p,q)}}recieve(e){e=globalThis.__kkeepStreams.unpack(e);'
    source, count = re.subn(pattern, replacement, source)
    if count != 1:
        raise SystemExit('Unexpected controller RPC bundle: ' + name)
    source = source.replace('__scramjet_controller', '__kkeep_gfn_controller_v2')
    if name == 'controller.inject.js':
        # window.open/contentWindow can hook Steam's document before its injected
        # bootstrap runs. Scramjet hides navigator.serviceWorker at that point.
        # Reuse the native container saved on the existing client so load() can
        # synchronize the document's cookies/history without crashing first.
        source = replace_once(source,
            'let c=navigator.serviceWorker.controller;',
            'let c=(globalThis[i.pX]?.serviceWorker||navigator.serviceWorker)?.controller;')
    if name == 'controller.api.js':
        # A worker can restart inside the old five-second guard. Only reopen
        # ports that the current worker has actually lost (upstream issue #211).
        source = replace_once(source,
            'if(this.guardServiceWorkerRevive)return;this.setupMessagePort()',
            'const registered=e.data.$controller$swrevive.registered;if(Array.isArray(registered)?registered.includes(this.id):this.guardServiceWorkerRevive)return;this.setupMessagePort()')
    if name == 'controller.sw.js':
        # The public controller loses both the waking request and a popup's
        # RemoteTransport handshake if they arrive before re-registration.
        source = replace_once(source, 'let i=[];function n(e)',
            'let i=[];const lifecycle=globalThis.__kkeepCreateGfnLifecycle(()=>i);function n(e)')
        source = replace_once(source,
            'return void 0!==i.find(e=>t.pathname.startsWith(e.prefix))',
            'return lifecycle.claims(t.href)')
        source = replace_once(source,
            'r=i.find(e=>t.pathname.startsWith(e.prefix)),o=await clients.get(e.clientId)',
            'r=await lifecycle.wait(t.href),o=await clients.get(e.clientId)')
        source = replace_once(source,
            's=[...e.request.headers],n=await r.rpc.call("request",',
            's=[...e.request.headers];if(!r)return new Response("GeForce session ended.",{status:410,headers:{"Cache-Control":"no-store","X-Kkeep-Session":"expired"}});if(e.request.signal?.aborted)throw Error("Request cancelled");let n=await r.rpc.call("request",')
        source = replace_once(source,
            'let{port:t,prefix:r}=e.data.$sw$initRemoteTransport,o=i.find(e=>new URL(r).pathname.startsWith(e.prefix));if(!o)return void console.error("No relevant controller found for transport init");o.rpc.call("initRemoteTransport",t,[t])',
            'let{port:t,prefix:r}=e.data.$sw$initRemoteTransport;const ready=lifecycle.wait(r).then(o=>{if(!o){t.close();return;}return o.rpc.call("initRemoteTransport",t,[t]);}).catch(()=>{t.close();});e.waitUntil?.(ready)')
        source = replace_once(source,
            'i.push(new s(t.prefix,t.id,e.ports[0]))',
            'i.push(new s(t.prefix,t.id,e.ports[0])),lifecycle.registered()')
        source = replace_once(source,
            'setTimeout(async()=>{for(let e of(console.log("service worker activated, notifying clients to revive"),await clients.matchAll()))e.postMessage({$controller$swrevive:{}})},100)',
            'setTimeout(()=>lifecycle.wake(),100)')
        source = (root / 'lib/geforce/controller-lifecycle.js').read_text() + '\n' + source
    path.write_text(shim + '\n' + source)
shutil.copyfile(downloads / 'source.zip', root / 'public/source/scramjet-e9ff92d.zip')
print('Vendored Scramjet V2 at ' + commit + ' with Kkeep compatibility patches')
