"""Rebuild the same pinned Hill Climb Racing engine with Binaryen Asyncify.

Usage: python scripts/build-hill-compat.py --work /absolute/scratch/directory
       [--prepared-wasm /absolute/verified/hcr-asyncify-optimized.wasm]
       [--prepared-brotli /absolute/verified/engine.br]
The prepared binary must match the reproducible build's expected digest.
The compressed engine is deployed as a static asset and served with HTTP Brotli.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
REVISION = '7467bb544dff9871a1a6dfd15407ecd48bd06bb9'
REPO = 'NotRexed/HillClimbRacingPort'
ORIGINAL = '6a3f846194020d52fda17d132ad942678383b52ca98caf315fb33e02ff2c0a3b'
CONVERTED = '0f5ae48090ef2ffb3f48d2f03229c53e0e318929d7895a8a0f432abbcb833ab8'
STABLE = 'e21b058fc8e5b2664dbcb57d568656b2320225a5138aedd08713261b48b5012a'
BINARYEN = '2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489'
IMPORTS = ['file_list', 'file_open', 'file_stat', 'load_image', 'sleep', 'tex_png', 'thread_switch', 'yield']
ARGS = ['--asyncify', '--pass-arg=asyncify-imports@' + ','.join('env.hcr_js_' + n for n in IMPORTS), '--strip-debug', '-O1']
sha = lambda b: hashlib.sha256(b).hexdigest()

def download(url, target):
    if not target.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            target.write_bytes(response.read())
    return target.read_bytes()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--prepared-wasm', type=Path)
    parser.add_argument('--prepared-brotli', type=Path)
    args = parser.parse_args()
    args.work.mkdir(parents=True, exist_ok=True)
    output = args.prepared_wasm or args.work / 'hcr-asyncify-optimized.wasm'
    if not args.prepared_wasm:
        parts = [download(f'https://raw.githubusercontent.com/{REPO}/{REVISION}/hcr.wasm.part{i}', args.work / f'hcr.wasm.part{i}') for i in range(1, 5)]
        original = b''.join(parts)
        if sha(original) != ORIGINAL:
            raise ValueError('Original engine checksum mismatch')
        source = args.work / 'hcr.wasm'
        source.write_bytes(original)
        name = 'binaryen-version_133-x86_64-linux.tar.gz'
        archive = args.work / name
        packed = download('https://github.com/WebAssembly/binaryen/releases/download/version_133/' + name, archive)
        if sha(packed) != BINARYEN:
            raise ValueError('Compiler checksum mismatch')
        with tarfile.open(archive) as bundle:
            members = [m for m in bundle.getmembers() if m.name.startswith('binaryen-version_133/bin/') and m.isfile()]
            bundle.extractall(args.work, members=members, filter='data')
        subprocess.run([str(args.work / 'binaryen-version_133/bin/wasm-opt'), str(source), *ARGS, '-o', str(output)], check=True)
    converted = output.read_bytes()
    if sha(converted) != CONVERTED:
        raise ValueError('Converted engine differs from the tested build')
    # Avoid the Safari OMG compiler's transient memory spike on large Asyncify
    # functions. The guard preserves every original function instruction.
    guarded = args.work / 'hcr-asyncify-stable.wasm'
    subprocess.run(['node', str(ROOT / 'scripts/guard-hill-wasm.mjs'), str(output), str(guarded)], check=True)
    converted = guarded.read_bytes()
    if sha(converted) != STABLE:
        raise ValueError('Compiler-guarded engine differs from the tested build')
    asset = '/games/ipad-imports/assets/hill-engine-' + STABLE[:16] + '.bin'
    destination = ROOT / ('public' + asset)
    command = ['node', str(ROOT / 'scripts/pack-hill-compat.mjs'), str(guarded), str(destination)]
    if args.prepared_brotli:
        command.append(str(args.prepared_brotli))
    subprocess.run(command, check=True)
    compressed = destination.read_bytes()
    manifest = dict(version=2, source=dict(repo=REPO, revision=REVISION, sha256=ORIGINAL), compiler=dict(version='Binaryen 133', sha256=BINARYEN, arguments=ARGS, guard=dict(inputSha256=CONVERTED, minimumBodyBytes=40000, targetBodyBytes=160000, functions=127, issue='https://bugs.webkit.org/show_bug.cgi?id=304810')), wasm=dict(size=len(converted), sha256=STABLE, url='/api/hill-engine/' + STABLE[:16] + '.wasm', file=asset, encoding='br', bytes=len(compressed), compressedSha256=sha(compressed)))
    (ROOT / 'public/games/ipad-imports/assets/hill-compat.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Prepared the verified engine; {len(compressed)} compressed bytes')

if __name__ == '__main__':
    main()
