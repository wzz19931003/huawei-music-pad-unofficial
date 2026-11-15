// Test-only fixtures: never imported by the renderer or shipped application.
import { readFileSync } from 'node:fs';
const referenceArt = process.env.PAD_QA_REFERENCE_ART ? JSON.parse(readFileSync(process.env.PAD_QA_REFERENCE_ART, 'utf8')) : [];
const titles = ['神秘嘉宾', '园游会', '外婆', '眼睛', '开始懂了', '因为你 所以我', '你比从前快乐', '眼泪成诗', '熊猫人', '午后海岸', '远方来信', '山间回声'];
const artists = ['林宥嘉', '周杰伦', '周杰伦', '王力宏', '孙燕姿', '五月天', '周杰伦', '孙燕姿', '宋健彰 / 詹宇豪', '离线夹具', '离线夹具', '离线夹具'];
const art = (index) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="hsl(${index * 32 + 20} 25% 68%)"/><stop offset="1" stop-color="hsl(${index * 32 + 40} 30% 24%)"/></linearGradient></defs><rect width="500" height="500" fill="url(#a)"/><circle cx="250" cy="220" r="130" fill="none" stroke="white" stroke-opacity=".22" stroke-width="2"/><text x="34" y="410" font-size="44" fill="white" font-family="sans-serif">${titles[index]}</text><text x="36" y="450" font-size="16" fill="white" opacity=".7">OFFLINE UI FIXTURE · ${index + 1}</text></svg>`)}`;
export const tracks = titles.map((title, index) => ({ id: `pad-fixture-${index + 1}`, title, artists: [{ id: `fixture-artist-${index}`, name: artists[index] }], album: { id: `fixture-album-${index}`, title }, coverUrl: typeof referenceArt[index] === 'string' && referenceArt[index].startsWith('data:image/webp;base64,') ? referenceArt[index] : art(index), durationSeconds: 80, available: true }));
export const playlists = [
  { id: 'pad-fixture-owned', title: '离线验收歌单', coverUrl: tracks[0].coverUrl, count: tracks.length, kind: 'owned' },
  { id: 'pad-fixture-collected', title: '离线收藏歌单', coverUrl: tracks[4].coverUrl, count: tracks.length, kind: 'collected' },
];

export async function installPadFixtures(instance, page) {
  await page.addInitScript(() => {
    const Native = window.Audio;
    window.__padAudio = [];
    window.Audio = new Proxy(Native, { construct(target, args) {
      const audio = Reflect.construct(target, args);
      audio.muted = true;
      window.__padAudio.push(audio);
      return audio;
    } });
  });
  await instance.evaluate(({ ipcMain }, { tracks, playlists }) => {
    const ok = data => ({ ok: true, data });
    const replace = (name, callback) => { ipcMain.removeHandler(name); ipcMain.handle(name, callback); };
    globalThis.__padFixture = { favoriteIds: new Set(tracks.slice(0, 9).map(track => track.id)), writes: [], queries: [], url: '', loginCalls: 0 };
    replace('auth:status', () => ok({ authenticated: true, displayName: '离线验收夹具', persistence: 'memory-only' }));
    replace('auth:login', () => { globalThis.__padFixture.loginCalls++; return { ok: false, error: { kind: 'unsupported', message: '离线验收：未连接华为登录服务', retryable: false } }; });
    replace('music:favorites', (_event, input = {}) => {
      const all = tracks.filter(track => globalThis.__padFixture.favoriteIds.has(track.id));
      const start = input.start || 0;
      const rows = all.slice(start, start + 50);
      return ok({ tracks: rows, nextStart: start + rows.length, hasMore: false });
    });
    replace('music:favorites-summary', () => ok({ total: globalThis.__padFixture.favoriteIds.size }));
    replace('music:history', () => ok({ tracks }));
    replace('music:playlists', () => ok({ playlists, truncated: false }));
    replace('music:playlist-detail', (_event, input) => ok({ playlist: playlists.find(list => list.id === input.id), tracks, nextStart: tracks.length, hasMore: false }));
    replace('music:favorite-state', (_event, { trackId }) => ok({ favorite: globalThis.__padFixture.favoriteIds.has(trackId) }));
    replace('music:set-favorite', (_event, { trackId, favorite }) => {
      globalThis.__padFixture.writes.push({ trackId, favorite });
      if (favorite) globalThis.__padFixture.favoriteIds.add(trackId); else globalThis.__padFixture.favoriteIds.delete(trackId);
      return ok({ favorite: globalThis.__padFixture.favoriteIds.has(trackId) });
    });
    replace('music:resolve-playback', () => ok({ url: globalThis.__padFixture.url, actualQuality: 'standard' }));
    replace('music:lyrics', () => ok({ synced: true, source: 'local', lines: Array.from({ length: 16 }, (_, index) => ({ timeMs: index * 5000, text: `离线验收歌词 · 第 ${index + 1} 行` })) }));
    replace('music:search', (_event, input) => { globalThis.__padFixture.queries.push(input.query); return ok({ tracks: tracks.slice(0, 4), nextStart: 4, hasMore: false, total: 4 }); });
    replace('music:report-playback', () => ok(undefined));
  }, { tracks, playlists });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  const url = await page.evaluate(() => {
    const sampleRate = 8000;
    const count = sampleRate * 80;
    const buffer = new ArrayBuffer(44 + count * 2);
    const view = new DataView(buffer);
    const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  });
  await instance.evaluate((_electron, url) => { globalThis.__padFixture.url = url; }, url);
  await page.locator('.boot-screen').waitFor({ state: 'hidden' });
  return { tracks, playlists };
}
