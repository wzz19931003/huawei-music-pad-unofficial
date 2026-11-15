import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('mode runtime probe honors a requested packaged executable and records runtime identity', async () => {
  const source = await readFile(new URL('../tools/test-pad-modes.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.PAD_QA_EXECUTABLE/);
  assert.match(source, /app\.isPackaged/);
});
test('update-recovery runtime probe honors a requested packaged executable', async () => {
  const source = await readFile(new URL('../tools/test-pad-update-ui.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('process.env.PAD_QA_EXECUTABLE'), true);
});

