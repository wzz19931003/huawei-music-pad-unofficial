import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sanitizeLyricsPreferences } from './desktop-lyrics-policy.mjs';

export const DESKTOP_LYRICS_STORE_BYTES = 16384;

/** Dedicated non-secret preferences only; never reuses account/settings/queue stores. */
export function createDesktopLyricsStore(directory) {
  const file = join(directory, 'desktop-lyrics.json');
  return Object.freeze({
    async read() {
      let stat;
      try { stat = await fs.lstat(file); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      if (!stat.isFile() || stat.size > DESKTOP_LYRICS_STORE_BYTES) throw new Error('Invalid lyric preferences file');
      const raw = await fs.readFile(file);
      if (raw.length > DESKTOP_LYRICS_STORE_BYTES) throw new Error('Lyric preferences size exceeded');
      const parsed = JSON.parse(raw.toString('utf8'));
      if (parsed?.version !== 1) throw new Error('Unsupported lyric preferences version');
      return sanitizeLyricsPreferences(parsed);
    },
    async write(value) {
      const clean = sanitizeLyricsPreferences(value);
      const raw = Buffer.from(JSON.stringify(clean) + '\n', 'utf8');
      if (raw.length > DESKTOP_LYRICS_STORE_BYTES) throw new Error('Lyric preferences size exceeded');
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = join(directory, `desktop-lyrics-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, raw, { mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, file);
      } finally {
        await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    },
  });
}
