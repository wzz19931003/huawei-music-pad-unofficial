import test from 'node:test';
import assert from 'node:assert/strict';
import { toUpdateView } from '../src/main/update-view.mjs';
import { normalizeReleaseNotes } from '../src/main/update-release-notes.mjs';

test('view projects only bounded note DTOs for a live candidate, while older states remain compatible', () => {
  const base = { status: 'available', currentVersion: '1.0.0', version: '1.1.0', progress: null, errorCode: null };
  const notes = normalizeReleaseNotes('新增：队列筛选', '1.1.0', '1.0.0');
  const valid = toUpdateView({ ...base, ...notes });
  assert.deepEqual(valid.releaseNotes, notes.releaseNotes);
  assert.notEqual(valid.releaseNotes, notes.releaseNotes, 'projection must copy the whitelist, not forward objects');
  const older = toUpdateView(base);
  assert.deepEqual(older.releaseNotes, []);
  assert.equal(older.releaseNotesTruncated, false);
  for (const status of ['idle', 'checking', 'development', 'unconfigured']) {
    assert.deepEqual(toUpdateView({ ...base, ...notes, status }).releaseNotes, []);
  }
  assert.deepEqual(toUpdateView({ ...base, ...notes, status: 'error', errorCode: 'UPDATE_CHECK_FAILED' }).releaseNotes, []);
  assert.deepEqual(toUpdateView({ ...base, ...notes, version: '1.0.1' }).releaseNotes, []);
  assert.deepEqual(toUpdateView({ ...base, ...notes, currentVersion: '1.1.0' }).releaseNotes, []);
  let reads = 0;
  const accessor = { version: '1.1.0', get sections() { reads += 1; throw new Error('must not run'); } };
  for (const releaseNotes of [null, 'legacy raw string', [accessor], [{ version: 'v1.1.0', sections: [] }],
    [{ version: '1.1.0', sections: [{ kind: 'text', items: ['<img src="https://tracker.invalid/">'] }] }],
    [{ version: '1.1.0', sections: [{ kind: 'text', items: ['x'.repeat(281)] }] }],
    [{ version: '1.1.0', sections: [{ kind: 'invented', items: ['不得造分类'] }] }],
  ]) {
    const result = toUpdateView({ ...base, releaseNotes, releaseNotesTruncated: true });
    assert.deepEqual(result.releaseNotes, []);
    assert.equal(result.releaseNotesTruncated, false);
  }
  assert.equal(reads, 0);
});

test('update presentation distinguishes unchecked from a completed no-update check', () => {
  const state = { status: 'idle', currentVersion: '0.1.1', version: null, progress: null, errorCode: null };
  assert.equal(toUpdateView(state).message, '尚未检查更新');
  assert.equal(toUpdateView(state, { checked: true }).message, '当前已是最新版本');
  assert.equal(toUpdateView(state).version, undefined);
});
test('update presentation localizes errors and never forwards raw transport messages', () => {
  const result = toUpdateView({ status: 'error', currentVersion: '0.1.1', errorCode: 'UPDATE_INSTALL_FAILED', message: 'secret-path' });
  assert.match(result.message, /安装失败/);
  assert.equal(result.errorCode, 'UPDATE_INSTALL_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /secret-path/);
});
