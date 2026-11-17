import { fetch as httpFetch } from 'undici';
import { playlistFrom, tracksFrom } from './main/library.mjs';

const PORTAL = 'https://portal-drcn.music.dbankcloud.cn';
const CATALOG_PATH = '/music-operation-service/v1/service/page/detail/all?pageType=9202&hasRecommend=0';

export const PUBLIC_CHART_PAGE_SIZE = 10;
export const PUBLIC_CHART_TRACK_CAP = 500;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export class PublicChartError extends Error {
  /** @param {string} message @param {import('./shared/types').ErrorKind} kind */
  constructor(message, kind = 'invalid', retryable = false, code = 'PUBLIC_CHART_INVALID') {
    super(message); this.name = 'PublicChartError'; this.kind = kind; this.retryable = retryable; this.code = code;
  }
}
const invalid = () => { throw new PublicChartError('公开榜单参数无效'); };
const malformed = () => { throw new PublicChartError('公开榜单响应无效或超出范围', 'unsupported', true, 'PUBLIC_CHART_SCHEMA'); };
function objectInput(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid();
}
/** @param {any} input @returns {{refresh: boolean}} */
export function validateChartCatalogInput(input = {}) {
  objectInput(input, ['refresh']);
  if (input.refresh !== undefined && typeof input.refresh !== 'boolean') invalid();
  return { refresh: input.refresh ?? false };
}
/** @param {any} input @returns {{id: string, start: number, limit: number, refresh: boolean}} */
export function validateChartDetailInput(input) {
  objectInput(input, ['id', 'start', 'limit', 'refresh']);
  const { id, start = 0, limit = PUBLIC_CHART_PAGE_SIZE, refresh = false } = input;
  if (!validId(id) || !Number.isInteger(start) || start < 0 || start >= PUBLIC_CHART_TRACK_CAP || start % PUBLIC_CHART_PAGE_SIZE !== 0
    || limit !== PUBLIC_CHART_PAGE_SIZE || typeof refresh !== 'boolean' || refresh && start !== 0) invalid();
  return { id, start, limit, refresh };
}
function text(value, max, required = false) {
  if (value === undefined || value === null || value === '') { if (required) malformed(); return undefined; }
  if (typeof value !== 'string' || value.length > max || !value.trim()) malformed();
  return value;
}
function identifier(value, required = false) {
  if (!required && (value === undefined || value === '')) return undefined;
  if (!validId(value)) malformed();
  return value;
}
function count(value) {
  if (value === undefined || value === '') return undefined;
  if (!(typeof value === 'string' && /^\d{1,6}$/.test(value)) || Number(value) > 100000) malformed();
  return value;
}
function picture(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) malformed();
  return Object.fromEntries(['bigImgURL', 'middleImgURL', 'smallImgURL'].map(key => [key, text(value[key], 2048)]));
}
function summary(value) {
  if (value?.contentType !== '7') malformed();
  const parsed = playlistFrom({ contentID: identifier(value.contentID, true), contentName: text(value.contentName, 300, true),
    contentType: '7', totalCount: count(value.totalCount), picture: picture(value.picture) });
  if (!parsed) malformed();
  const { id, title, kind, count: total, coverUrl } = parsed;
  return { id, title, kind, ...(total === undefined ? {} : { count: total }), ...(coverUrl ? { coverUrl } : {}) };
}
function track(value) {
  if (value?.contentType !== '1') malformed();
  const ids = value.artistID ?? [];
  if (!Array.isArray(ids) || ids.length > 32) malformed();
  // Known bounded metadata only: never parse contentExInfo or accept its media URLs.
  return { contentType: '1', contentID: identifier(value.contentID, true), contentName: text(value.contentName, 300, true),
    artistID: ids.map(id => identifier(id, true)), artistName: text(value.artistName, 1000),
    albumID: identifier(value.albumID), albumName: text(value.albumName, 300), picture: picture(value.picture) };
}

// A dedicated anonymous read capability, never a renderer-supplied URL or session client.
export function createPublicCharts({ fetchImpl = httpFetch, now = () => performance.now() } = {}) {
  let knownIds = new Set();
  let generation = 0;
  let lifetime = new AbortController();
  function invalidate() {
    generation++; knownIds = new Set(); lifetime.abort(); lifetime = new AbortController();
  }
  function current(epoch) {
    if (epoch !== generation) throw new PublicChartError('榜单状态已更改，请重新读取目录', 'invalid', true, 'PUBLIC_CHART_STALE');
  }
  let denied = false;
  const inFlight = new Map();
  // Main-owned process-lifetime budget: refresh/account invalidation never resets it.
  let tokens = 4, refilledAt = now();
  function request(path) {
    if (denied) throw new PublicChartError('官方公开榜单拒绝匿名读取，本次运行已停止请求。', 'permission', false, 'PUBLIC_CHART_DENIED');
    const key = `${generation}:${path}`;
    if (inFlight.has(key)) return inFlight.get(key);
    if (inFlight.size >= 2) throw new PublicChartError('榜单读取繁忙，请稍后重试。', 'network', true, 'PUBLIC_CHART_BUSY');
    const time = Math.max(refilledAt, now());
    tokens = Math.min(4, tokens + (time - refilledAt) / 1000); refilledAt = time;
    if (tokens < 1) throw new PublicChartError('榜单读取过于频繁，请稍后重试。', 'network', true, 'PUBLIC_CHART_RATE_LIMIT');
    tokens--;
    const pending = fetchBody(path).finally(() => {
      if (inFlight.get(key) === pending) inFlight.delete(key);
    });
    inFlight.set(key, pending);
    return pending;
  }
  async function fetchBody(path) {
    const response = await fetchImpl(PORTAL + path, {
      method: 'GET', redirect: 'error', credentials: 'omit',
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(25_000)]), headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        // HTTP denial is authoritative even if the errored body cannot be cancelled.
        denied = true; invalidate();
        await response.body?.cancel().catch(() => undefined);
        throw new PublicChartError('官方公开榜单拒绝匿名读取，本次运行已停止请求。', 'permission', false, 'PUBLIC_CHART_DENIED');
      }
      await response.body?.cancel();
      throw new PublicChartError('公开榜单网络请求失败', 'network', true, 'PUBLIC_CHART_HTTP');
    }
    const maxBytes = path === CATALOG_PATH ? 2 * 1024 * 1024 : 512 * 1024;
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) { await response.body?.cancel(); throw new PublicChartError('公开榜单响应过大', 'unsupported', true, 'PUBLIC_CHART_BODY_LIMIT'); }
    if (!response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel(); malformed();
    }
    const reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new PublicChartError('公开榜单响应过大', 'unsupported', true, 'PUBLIC_CHART_BODY_LIMIT');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    finally { reader.releaseLock(); }
    const joined = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
    catch { malformed(); }
    if (body?.result?.resultCode !== '000000') malformed();
    return body;
  }
  return {
    invalidate,
    async detail(input) {
      const { id, start, limit } = validateChartDetailInput(input);
      if (!knownIds.has(id)) throw new PublicChartError('请先从当前榜单目录选择');
      const epoch = generation;
      const body = await request(`/music-operation-service/v1/service/chart/detail/bychartid?${new URLSearchParams({ chartID: id, start: String(start), limit: String(limit) })}`);
      current(epoch);
      const info = body?.chartInfoEx;
      if (info?.chartInfo?.contentID !== id || !Array.isArray(info.songSimpleInfos) || info.songSimpleInfos.length > limit) malformed();
      const playlist = summary(info.chartInfo);
      const tracks = [...new Map(tracksFrom(info.songSimpleInfos.map(track)).map(item => [item.id, item])).values()];
      const updatedAtRaw = text(info.chartInfo.releaseDate, 14);
      if (updatedAtRaw !== undefined && !/^\d{14}$/.test(updatedAtRaw)) malformed();
      return { playlist, tracks, updatedAtRaw, nextStart: start + limit,
        hasMore: tracks.length > 0 && info.songSimpleInfos.length === limit && start + limit < PUBLIC_CHART_TRACK_CAP
          && (playlist.count === undefined || start + limit < playlist.count) };
    },
    async catalog(input = {}) {
      validateChartCatalogInput(input);
      if (!inFlight.has(`${generation}:${CATALOG_PATH}`)) invalidate();
      const epoch = generation;
      const body = await request(CATALOG_PATH);
      current(epoch);
      if (!Array.isArray(body.columnInfoExs) || body.columnInfoExs.length > 64) malformed();
      const cards = [];
      for (const column of body.columnInfoExs) {
        if (column?.columnInfo?.contentType !== '7' || column.columnInfo.contentName !== '热门榜单') continue;
        if (!Array.isArray(column.contentSimpleInfos) || column.contentSimpleInfos.length + cards.length > 32) malformed();
        cards.push(...column.contentSimpleInfos.filter(card => card?.contentType === '7').map(summary));
      }
      const charts = [...new Map(cards.map(card => [card.id, card])).values()];
      knownIds = new Set(charts.map(chart => chart.id));
      return { source: 'huawei-public-h5', scope: 'featured', charts, fetchedAt: new Date().toISOString() };
    },
  };
}
