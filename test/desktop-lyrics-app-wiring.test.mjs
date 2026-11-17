import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('static publisher wiring uses the latest singleton player, pulses track changes and stops on unmount', async () => {
  const source = await readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
  assert.ok(/^import .*connectDesktopLyricsPublisher.* from '\.\/desktop-lyrics-publisher';/m.test(source), 'App must import the handed-off publisher');
  assert.ok(/getPlayer: \(\) => playerRef\.current/.test(source), 'publisher must sample the current player ref, not a stale render or new Audio');
  assert.ok(/return \(\) => \{[\s\S]*?publisher\.stop\(\)/.test(source), 'publisher must stop on component/document cleanup');
  assert.ok(/lyricsPublisherRef\.current\?\.pulse\(\)/.test(source), 'track/lyric changes need an immediate mirror pulse');
  assert.ok(/\[player\.current\?\.id, player\.lyrics, player\.playing, player\.buffering\]/.test(source), 'pulse dependencies must cover new lyrics/play state without flooding every progress/volume change');
});

// Supplementary wiring only: the maintained native and renderer probes establish behavior.
test('static primary wiring mounts the native control and disposes its subscription', async () => {
  const source = await readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /^import .*connectDesktopLyricsControl.* from '\.\/desktop-lyrics-control';/m);
  assert.match(source, /connectDesktopLyricsControl\(\{\s*api: window\.desktop\?\.desktopLyrics,/);
  assert.match(source, /return \(\) => \{\s*control\.stop\(\)/);
  assert.match(source, /desktopLyricsControl=\{<DesktopLyricsToggle\s/);
  assert.match(source, /onToggle=\{\(\) => \{ void lyricsControlRef\.current\?\.toggle\(\); \}\}/);
});
