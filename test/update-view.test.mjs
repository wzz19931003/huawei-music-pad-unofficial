import test from 'node:test';
import assert from 'node:assert/strict';
import { toUpdateView } from '../src/main/update-view.mjs';

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
