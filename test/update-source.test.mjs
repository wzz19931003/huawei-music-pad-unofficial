import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('updates use the authorized independent repository and preserve no-auto-publish builds', async () => {
  const { UPDATE_SOURCE } = await import('../src/main/update-source.mjs');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(UPDATE_SOURCE, { provider: 'github', owner: 'wzz19931003', repo: 'huawei-music-pad-unofficial', releaseType: 'release' });
  assert.deepEqual(pkg.build.publish, UPDATE_SOURCE);
  assert.notEqual(UPDATE_SOURCE.owner, 'Daydreamcgy');
  const builder = await readFile(new URL('../scripts/build-desktop.mjs', import.meta.url), 'utf8');
  assert.match(builder, /publish: 'never'/);
  assert.equal(pkg.name, 'huawei-music-desktop');
  assert.equal(pkg.build.appId, 'org.hwmusicdesktop.unofficial');
});
