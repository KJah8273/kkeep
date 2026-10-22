"""Patch the pinned controller RPC in all three realms; fail on an unknown bundle."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
shim=(root/'public/engine/stream-compat.js').read_text()
for name in ['controller.api.js','controller.sw.js','controller.inject.js']:
 p=root/'public/engine'/name
 source=p.read_text()
 if '/* kkeep stream-transfer compatibility' in source:
  raise SystemExit('Already patched: '+name)
 pattern=r'this\.methods=e,this\.id=t,this\.sendRaw=([ro])}recieve\(e\){'
 replacement=r'this.methods=e,this.id=t,this.sendRaw=(d,x)=>{const [p,q]=globalThis.__kkeepStreams.pack(d,x);\1(p,q)}}recieve(e){e=globalThis.__kkeepStreams.unpack(e);'
 source,count=re.subn(pattern,replacement,source)
 if count!=1:raise SystemExit('Unexpected controller bundle: '+name)
 p.write_text(shim+'\n'+source)
