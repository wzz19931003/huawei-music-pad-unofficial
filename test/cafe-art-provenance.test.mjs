import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('public café artwork is reproducible original artwork, not the reference screenshot crop', async () => {
  const bytes = await readFile(new URL('../src/renderer/assets/pad-cafe-atmosphere.webp', import.meta.url));
  assert.notEqual(createHash('sha256').update(bytes).digest('hex'), 'd5f4e8719c5d56191bde7a2611978f86158a3b0f9e4f156b677d4928ae7c06ed');
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  const source = await readFile(new URL('../scripts/generate-pad-cafe-art.py', import.meta.url), 'utf8');
  assert.match(source, /no external image inputs/i);
  assert.doesNotMatch(source, /native-inputs|\.jpg|Image\.open/);
});
