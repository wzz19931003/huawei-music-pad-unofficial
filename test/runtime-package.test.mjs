import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('source exclusion is project-root scoped and preserves debug runtime entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.build.files.includes('!src/**'), 'exclude our source only');
  assert.ok(!pkg.build.files.includes('!**/src/**'), 'debug/src/index.js is production code, not project source');
});
test('installer content guard rejects project sources but permits production dependency src entries', async () => {
  const source = await readFile(new URL('../scripts/check-windows-installer.mjs', import.meta.url), 'utf8');
  const literal = source.match(/^const forbidden = (\/.+\/[a-z]*);$/m)?.[1];
  assert.ok(literal);
  const end = literal.lastIndexOf('/');
  const forbidden = new RegExp(literal.slice(1, end), literal.slice(end + 1));
  for (const path of ['src/main/index.ts', '.local/session.enc', 'tools/fixtures.mjs', 'research/capture.json']) assert.equal(forbidden.test(path), true, path);
  assert.equal(forbidden.test('node_modules/debug/src/index.js'), false);
});

