import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test('Pad distribution uses the approved Wmusic display name', () => {
  assert.equal(pkg.build.productName, 'Wmusic');
});

test('Pad distribution preserves the upstream data identity and includes license notices', () => {
  assert.equal(pkg.name, 'huawei-music-desktop');
  assert.equal(pkg.build.appId, 'org.hwmusicdesktop.unofficial');

  for (const file of ['LICENSE', 'NOTICE']) assert.ok(pkg.build.files.includes(file), `${file} must be explicitly included in the application payload`);
});
