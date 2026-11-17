import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeLyricsPreferences } from '../src/main/desktop-lyrics-policy.mjs';

const scratch = process.env.HERMES_QA_SCRATCH || (process.platform === 'win32' ? join(homedir(), 'AppData/Local/hermes/cache/scratch') : process.env.TMPDIR || tmpdir());
async function fixture(run) {
  await fs.mkdir(scratch, { recursive: true });
  const directory = await fs.mkdtemp(join(scratch, 'wmusic-lyrics-store-test-'));
  try { await run(directory); }
  finally {
    await fs.rm(directory, { recursive: true, force: true });
    await assert.rejects(fs.stat(directory), error => error.code === 'ENOENT');
  }
}

test('dedicated lyric preferences round-trip only sanitized nonsecret fields and leave no temporary files', async () => {
  const module = await import('../src/main/desktop-lyrics-store.mjs').catch(() => ({}));
  assert.equal(typeof module.createDesktopLyricsStore, 'function', 'a dedicated bounded store is required, not the credential/settings blob');
  await fixture(async directory => {
    const store = module.createDesktopLyricsStore(directory);
    assert.equal(await store.read(), null);
    const clean = { ...sanitizeLyricsPreferences(null), visible: true, fontSize: 40, position: { x: 25, y: 35 } };
    await store.write({ ...clean, mediaUrl: 'https://example.invalid/synthetic-not-a-media-source', account: { synthetic: true } });
    assert.deepEqual(await store.read(), clean);
    const raw = JSON.parse(await fs.readFile(join(directory, 'desktop-lyrics.json'), 'utf8'));
    assert.deepEqual(raw, clean);
    assert.deepEqual(await fs.readdir(directory), ['desktop-lyrics.json']);
  });
});
