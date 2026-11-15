"""Export the current corresponding source, excluding private/build/reference data."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--snapshot', type=Path)
args = parser.parse_args()
pkg = json.loads((root / 'package.json').read_text('utf-8'))
version = pkg['version']
output = root / 'release' / f'huawei-music-pad-{version}-source.zip'
paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode('utf-8').split('\0')
forbidden = {'.git', '.local', 'node_modules', 'release', 'research', 'design-previews', '.hermes'}
skip_prefixes = ('.github/', 'docs/review/', 'docs/screenshots/')
selected = sorted({p for p in paths if p and (root / p).is_file() and not (set(Path(p).parts) & forbidden)
                   and not p.startswith(skip_prefixes) and p != 'docs/login-research.md'
                   and p != 'SOURCE-MANIFEST.json'})
assert all(p in selected for p in ['LICENSE', 'NOTICE', 'package.json', 'package-lock.json', 'src/main/index.ts', 'src/renderer/App.tsx'])
assert not any((root / p).is_symlink() for p in selected)
assert not any(Path(p).name in {'session.enc', 'session.json', 'settings.json', 'queue.json', 'history.json', '.env'} for p in selected)
sha = lambda data: hashlib.sha256(data).hexdigest()
manifest = {'version': version, 'upstream': 'Daydreamcgy/huawei-music-win',
            'upstreamBase': '84a34f50fc5649af5ed425ac3694190a7b14da98',
            'scope': 'Corresponding source; private profiles, test captures, screenshot crops and build outputs excluded.',
            'files': {p: sha((root / p).read_bytes()) for p in selected}}
manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
if args.snapshot:
    assert not args.snapshot.exists(), 'Refusing to overwrite an existing snapshot'
    args.snapshot.mkdir(parents=True)
    for p in selected:
        destination = args.snapshot / p
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / p, destination)
    (args.snapshot / 'SOURCE-MANIFEST.json').write_bytes(manifest_bytes)
    assert all(sha((args.snapshot / p).read_bytes()) == digest for p, digest in manifest['files'].items())
prefix = f'huawei-music-pad-{version}/'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
    for p in selected:
        archive.write(root / p, prefix + p)
    archive.writestr(prefix + 'SOURCE-MANIFEST.json', manifest_bytes)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {prefix + p for p in selected} | {prefix + 'SOURCE-MANIFEST.json'}
    assert all(sha(archive.read(prefix + p)) == digest for p, digest in manifest['files'].items())
print(json.dumps({'archive': str(output), 'version': version, 'sourceFiles': len(selected), 'sha256': sha(output.read_bytes()),
                  'bytes': output.stat().st_size, 'snapshot': str(args.snapshot) if args.snapshot else None,
                  'archiveAndSnapshotBytesVerified': True}, ensure_ascii=False))
