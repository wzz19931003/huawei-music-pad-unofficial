"""Focused exporter regressions; Python standard library and Git only.

Run directly, outside the Node suite, with HERMES_QA_SCRATCH or TMPDIR set to
an existing disposable QA scratch directory. Only synthetic Git roots are exported.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from contextlib import contextmanager


EXPORTER = Path(__file__).resolve().with_name('export-pad-source.py')
MANIFEST = 'SOURCE-MANIFEST.json'
VERSION = '0.0.0-synthetic-export-regression'
PREFIX = f'huawei-music-pad-{VERSION}/'


class ExportPadSourceTests(unittest.TestCase):
    @staticmethod
    def remove_readonly(operation, path, error):
        if not isinstance(error, PermissionError):
            raise error
        Path(path).chmod(stat.S_IWRITE)
        operation(path)

    @contextmanager
    def fixture(self):
        scratch = os.environ.get('HERMES_QA_SCRATCH') or os.environ.get('TMPDIR')
        if not scratch or not Path(scratch).is_dir():
            raise RuntimeError('Set HERMES_QA_SCRATCH or TMPDIR to an existing QA scratch directory')
        work = Path(tempfile.mkdtemp(prefix='hermes-export-pad-source-', dir=Path(scratch).resolve()))
        try:
            root = work / 'source'
            root.mkdir()
            sources = {
                'LICENSE': b'Synthetic test license; not a release.\n',
                'NOTICE': b'Synthetic test notice.\r\n',
                'package.json': json.dumps({'name': 'synthetic-export-fixture', 'version': VERSION}).encode('utf-8'),
                'package-lock.json': b'{"name":"synthetic-export-fixture","lockfileVersion":3}\n',
                'src/main/index.ts': b'// Synthetic source only.\r\n',
                'src/renderer/App.tsx': b'// Synthetic renderer only.\n',
                'docs/fixture-\u4e2d\u6587.txt': 'Synthetic UTF-8 fixture: \u4e2d\u6587\n'.encode('utf-8'),
            }
            for name, data in sources.items():
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
            copied_exporter = root / 'tools/export-pad-source.py'
            copied_exporter.parent.mkdir()
            shutil.copyfile(EXPORTER, copied_exporter)
            sources['tools/export-pad-source.py'] = copied_exporter.read_bytes()
            # Freeze expected source bytes before the actual exporter executes.
            self.git(root, 'init', '--quiet')
            self.git(root, '-c', 'core.autocrlf=false', 'add', '--all')
            yield root, work / 'snapshot', sources
        finally:
            # Git objects are read-only on Windows, including on failing runs.
            shutil.rmtree(work, onexc=self.remove_readonly)
            self.assertFalse(work.exists(), 'Synthetic fixture root was not removed')
            print('cleanup: synthetic fixture root absent', flush=True)

    def git(self, root, *args):
        result = subprocess.run(['git', *args], cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, f'git failed: {result.stdout}\n{result.stderr}')
        return result.stdout

    def export(self, root, snapshot):
        return subprocess.run(
            [sys.executable, '-I', str(root / 'tools/export-pad-source.py'), '--snapshot', str(snapshot)],
            cwd=root, capture_output=True, text=True, encoding='utf-8', timeout=30,
        )

    def verify_export(self, result, root, snapshot, sources):
        self.assertEqual(result.returncode, 0, f'exporter failed: {result.stdout}\n{result.stderr}')
        summary = json.loads(result.stdout)
        expected = set(sources) | {MANIFEST}
        snapshot_files = {p.relative_to(snapshot).as_posix() for p in snapshot.rglob('*') if p.is_file()}
        self.assertEqual(snapshot_files, expected, 'Snapshot inventory must be exact')
        archive_path = root / 'release' / f'huawei-music-pad-{VERSION}-source.zip'
        self.assertEqual(Path(summary['archive']), archive_path)
        self.assertEqual(Path(summary['snapshot']), snapshot)
        self.assertEqual(summary['version'], VERSION)
        self.assertEqual(summary['sourceFiles'], len(sources))
        self.assertEqual(summary['sha256'], hashlib.sha256(archive_path.read_bytes()).hexdigest())
        self.assertEqual(summary['bytes'], archive_path.stat().st_size)
        self.assertTrue(summary['archiveAndSnapshotBytesVerified'])
        with zipfile.ZipFile(archive_path) as archive:
            entries = archive.namelist()
            self.assertEqual(len(entries), len(set(entries)), 'ZIP must not contain duplicate entries')
            self.assertEqual(entries.count(PREFIX + MANIFEST), 1, 'ZIP must contain one fresh root manifest')
            self.assertEqual(set(entries), {PREFIX + name for name in expected}, 'ZIP inventory must be exact')
            self.assertIsNone(archive.testzip())
            mismatches = []
            for name in sorted(expected):
                snapshot_bytes = (snapshot / name).read_bytes()
                zip_bytes = archive.read(PREFIX + name)
                if snapshot_bytes != zip_bytes:
                    mismatches.append(f'{name} (snapshot={len(snapshot_bytes)}B, ZIP={len(zip_bytes)}B)')
            self.assertFalse(mismatches, 'ZIP/snapshot byte mismatch: ' + ', '.join(mismatches))
        manifest_bytes = (snapshot / MANIFEST).read_bytes()
        manifest = json.loads(manifest_bytes.decode('utf-8'))
        self.assertEqual(manifest['version'], VERSION)
        self.assertEqual(manifest['files'], {name: hashlib.sha256(data).hexdigest() for name, data in sources.items()})
        self.assertEqual(manifest_bytes, json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'))
        for name, frozen_bytes in sources.items():
            actual_bytes = (snapshot / name).read_bytes()
            self.assertEqual(actual_bytes, frozen_bytes, f'Frozen fixture source changed: {name}')
            self.assertEqual(hashlib.sha256(actual_bytes).hexdigest(), manifest['files'][name])
        print(f'verified: {len(sources)} source files; {len(expected)} ZIP/snapshot entries byte-identical; all hashes valid', flush=True)

    def test_snapshot_and_zip_are_byte_identical(self):
        with self.fixture() as (root, snapshot, sources):
            self.verify_export(self.export(root, snapshot), root, snapshot, sources)

    def test_tracked_root_manifest_is_not_a_source_input(self):
        with self.fixture() as (root, snapshot, sources):
            nested = 'src/fixtures/SOURCE-MANIFEST.json'
            sources[nested] = b'{"synthetic":"real nested source, not the generated root manifest"}\n'
            (root / nested).parent.mkdir(parents=True)
            (root / nested).write_bytes(sources[nested])
            old_manifest = b'{"version":"0.0.0-synthetic-stale","files":{"stale.txt":"old hash"}}\n'
            (root / MANIFEST).write_bytes(old_manifest)
            self.git(root, '-c', 'core.autocrlf=false', 'add', '--', MANIFEST, nested)
            self.assertEqual(self.git(root, 'ls-files', '--error-unmatch', '--', MANIFEST).strip(), MANIFEST)
            result = self.export(root, snapshot)
            generated = snapshot / MANIFEST
            self.assertTrue(generated.is_file(), f'Manifest was not generated: {result.stdout}\n{result.stderr}')
            manifest = json.loads(generated.read_bytes().decode('utf-8'))
            self.assertFalse(MANIFEST in manifest['files'], "generated root manifest must not appear in manifest['files']")
            self.verify_export(result, root, snapshot, sources)
            self.assertEqual((root / MANIFEST).read_bytes(), old_manifest, 'Old source-tree manifest must be untouched')
            self.assertNotEqual(generated.read_bytes(), old_manifest, 'Exported manifest must be fresh')
            print('verified: tracked root manifest excluded; nested manifest preserved; single fresh ZIP manifest', flush=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
