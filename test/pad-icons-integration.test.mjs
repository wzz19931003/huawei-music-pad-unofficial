import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const root = new URL('../src/renderer/', import.meta.url);
test('all application icon imports use the reference-derived library', async () => {
  const files = (await readdir(root)).filter(name => /\.tsx$/.test(name) && !name.includes('.test.'));
  const offenders = [];
  for (const file of files) {
    if (/from\s*['"]lucide-react['"]/.test(await readFile(new URL(file, root), 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'no generic icon implementation remains in application components');
});
