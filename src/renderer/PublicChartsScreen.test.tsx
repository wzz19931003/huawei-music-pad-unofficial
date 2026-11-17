import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PublicChartCatalog, PublicChartDetail, Track } from '../shared/types';

// Real component + api unwrap; scheduling and desktop IPC DTOs only are synthetic.
const host = vi.hoisted(() => ({ slots: [] as any[], effects: [] as any[], cursor: 0, dirty: false }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState(initial: any) { const at = host.cursor++; if (!(at in host.slots)) host.slots[at] = initial;
    return [host.slots[at], (next: any) => { host.slots[at] = typeof next === 'function' ? next(host.slots[at]) : next; host.dirty = true; }]; },
  useRef(initial: any) { const at = host.cursor++; return host.slots[at] ??= { current: initial }; },
  useCallback(fn: any) { return fn; },
  useEffect(setup: any, deps: any[]) { const at = host.cursor++, old = host.slots[at];
    if (old && deps.length === old.deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
    host.effects.push(() => { old?.cleanup?.(); host.slots[at] = { deps, cleanup: setup() }; }); },
}));
const playerHost = vi.hoisted(() => ({ current: {} as any }));
vi.mock('./lib/player', () => ({ usePlayer: () => playerHost.current }));
const track = (id: string): Track => ({ id, title: `曲目${id}`, artists: [{ name: '歌手' }], available: true });
const chart = { id: 'public-A', title: '热门榜甲', kind: 'chart' as const, count: 299 };
const catalog: PublicChartCatalog = { source: 'huawei-public-h5', scope: 'featured', charts: [chart], fetchedAt: '2026-11-17T15:00:00Z' };
const page = (tracks: Track[], nextStart = 10, hasMore = true): PublicChartDetail => ({ playlist: { ...chart, count: 200 }, tracks, nextStart, hasMore, updatedAtRaw: '20261116224816' });
let Screen: (props: any) => ReactElement;
let tree: ReactElement;
let native: { charts: ReturnType<typeof vi.fn>; chartDetail: ReturnType<typeof vi.fn> };
let props: any;
function render() {
  for (let turn = 0; turn < 20; turn++) {
    host.dirty = false; host.cursor = 0; tree = Screen(props);
    host.effects.splice(0).forEach(effect => effect());
    if (!host.dirty) return;
  }
  throw new Error('component hook host did not settle');
}
async function act(fn: () => unknown = () => {}) {
  fn(); for (let turn = 0; turn < 12; turn++) { if (host.dirty) render(); await Promise.resolve(); } if (host.dirty) render();
}
function elements(node: ReactNode): ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<any>(node)) return [];
  return [node, ...elements((node.props as Record<string, any>).children)];
}
function button(label: string) {
  const found = elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
  expect(found, `missing real control ${label}`).toBeDefined(); return found!.props;
}
function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(item => textOf(item)).join('');
  if (isValidElement<any>(node)) return textOf((node.props as Record<string, any>).children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function text() { return textOf(tree); }
beforeEach(async () => {
  host.slots = []; host.effects = []; host.cursor = 0; host.dirty = false;
  const path = './PublicChartsScreen.tsx';
  const mod = await import(/* @vite-ignore */ path).catch(() => ({}));
  expect(mod.PublicChartsScreen, 'public chart browser missing').toBeTypeOf('function'); Screen = mod.PublicChartsScreen;
  native = { charts: vi.fn().mockResolvedValue({ ok: true, data: catalog }), chartDetail: vi.fn().mockResolvedValue({ ok: true, data: page([track('A')]) }) };
  vi.stubGlobal('window', { desktop: { music: native } });
  props = { authenticated: true, playing: false, onPlay: vi.fn(), onAddToQueue: vi.fn(), onLogin: vi.fn(), onNotice: vi.fn(), onBack: vi.fn() };
});
afterEach(() => { host.slots.forEach(slot => slot?.cleanup?.()); vi.unstubAllGlobals(); });

it('appends deduped pages, stops on no progress and never treats catalog count as detail total', async () => {
  const first = Array.from({ length: 10 }, (_, i) => track(`A${i}`));
  const second = [...first.slice(1), track('B')];
  native.chartDetail.mockResolvedValueOnce({ ok: true, data: page(first, 10) })
    .mockResolvedValueOnce({ ok: true, data: page(second, 20) })
    .mockResolvedValueOnce({ ok: true, data: page(second, 30) });
  render(); await act(); await act(() => button('打开榜单：热门榜甲').onClick());
  await act(() => button('加载更多榜单曲目').onClick());
  expect(native.chartDetail).toHaveBeenLastCalledWith({ id: 'public-A', start: 10, limit: 10, refresh: false });
  expect(elements(tree).filter(node => node.props.track)).toHaveLength(11);
  expect(text()).toContain('已加载 11 首');
  await act(() => button('加载更多榜单曲目').onClick());
  expect(elements(tree).filter(node => node.props.track)).toHaveLength(11);
  expect(elements(tree).some(node => node.props['aria-label'] === '加载更多榜单曲目')).toBe(false);
  expect(text()).toContain('已停止加载');
});

it('retries service failures and cancels late detail pages without replacing current navigation', async () => {
  native.charts.mockResolvedValueOnce({ ok: false, error: { kind: 'network', message: '匿名服务暂不可用', retryable: true } });
  render(); await act(); expect(text()).toContain('匿名服务暂不可用');
  await act(() => button('重试榜单读取').onClick());
  expect(text()).not.toContain('匿名服务暂不可用');
  let release!: (value: any) => void;
  native.chartDetail.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(() => button('打开榜单：热门榜甲').onClick());
  expect(text()).toContain('正在读取榜单曲目');
  await act(() => button('取消榜单读取').onClick());
  await act(() => release({ ok: true, data: page([track('late')]) }));
  expect(elements(tree).some(node => node.props.track?.id === 'late')).toBe(false);
  expect(text()).toContain('已取消读取');
  await act(() => button('返回榜单目录').onClick());
  expect(button('打开榜单：热门榜甲')).toBeDefined();
  await act(() => button('打开榜单：热门榜甲').onClick());
  expect(elements(tree).some(node => node.props.track?.id === 'A')).toBe(true);
});

async function appHost(authenticated = false) {
  const { App } = await import('./App');
  const { PadHomeScreen } = await import('./PadScreens');
  vi.stubGlobal('__APP_VERSION__', '0.0.0-synthetic');
  vi.stubGlobal('window', { desktop: { music: native }, setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  playerHost.current = { queue: [], index: -1, current: undefined, playing: false, buffering: false,
    readClock: vi.fn(() => ({ trackId: null, playing: false })), toggle: vi.fn(), playFrom: vi.fn(),
    enqueueLast: vi.fn(), positionCommit: { current: 0 } };
  // Keep only App's render/actions active; startup/network/native effects are a separate boundary.
  const draw = () => { host.cursor = 0; const result = App(); host.effects = []; return result; };
  draw(); host.slots[0] = { authenticated }; host.slots[2] = false;
  const home = () => elements(draw()).find(node => node.type === PadHomeScreen)!.props;
  return { draw, home, player: playerHost.current };
}

it('actual App opens a dedicated anonymous chart route and connects play/queue without touching personal playlist routing', async () => {
  const app = await appHost();
  expect(app.home().onOpenCharts, 'App must own the real charts route').toBeTypeOf('function');
  app.home().onOpenCharts();
  const route = elements(app.draw()).find(node => node.type === Screen);
  expect(route, 'charts must mount before the personal-library login gate').toBeDefined();
  expect(route!.props.authenticated).toBe(false);
  route!.props.onBack();
  expect(app.home()).toBeDefined();
  host.slots[0] = { authenticated: true };
  app.home().onOpenCharts();
  const signedIn = elements(app.draw()).find(node => node.type === Screen)!;
  signedIn.props.onAddToQueue(track('queue'));
  expect(app.player.enqueueLast).toHaveBeenCalledExactlyOnceWith([track('queue')]);
  signedIn.props.onPlay([track('play')], 0);
  expect(app.player.playFrom).toHaveBeenCalledExactlyOnceWith([track('play')], 0);
  host.slots[3] = { name: 'playlist', playlist: { id: 'owned-A', title: '个人歌单', kind: 'owned' } };
  const personal = elements(app.draw()).find(node => node.props.playlist?.id === 'owned-A');
  expect(personal).toBeDefined(); expect(personal!.type).not.toBe(Screen);
});

it('actual App resume never resets or pauses a playing source, resumes paused current, and otherwise uses the real queue/history', async () => {
  const app = await appHost(true);
  expect(app.home().onResume, 'resume must be an App-owned action, not playFrom on a display list').toBeTypeOf('function');
  const current = track('current');
  Object.assign(app.player, { current, queue: [current], index: 0, playing: true, position: 42,
    readClock: vi.fn(() => ({ trackId: current.id, playing: true, positionSeconds: 42 })), jumpTo: vi.fn() });
  app.home().onResume();
  expect(app.player.toggle).not.toHaveBeenCalled(); expect(app.player.playFrom).not.toHaveBeenCalled();
  app.player.playing = false; app.player.readClock.mockReturnValue({ trackId: current.id, playing: false, positionSeconds: 42 });
  app.home().onResume();
  expect(app.player.toggle).toHaveBeenCalledOnce(); expect(app.player.position).toBe(42);
  expect(app.player.queue).toEqual([current]); expect(app.player.playFrom).not.toHaveBeenCalled();
  app.player.buffering = true; app.home().onResume(); expect(app.player.toggle).toHaveBeenCalledOnce();
  app.player.buffering = false; app.player.current = undefined;
  app.home().onResume(); expect(app.player.jumpTo).toHaveBeenCalledExactlyOnceWith(0);
  app.player.queue = [];
  const home = app.home(); const historySlot = host.slots.findIndex(value => value === home.history);
  host.slots[historySlot] = [track('history')]; app.home().onResume();
  expect(app.player.playFrom).toHaveBeenCalledExactlyOnceWith([track('history')], 0);
  host.slots[historySlot] = []; app.home().onResume();
  expect(app.player.playFrom).toHaveBeenCalledOnce();
  expect(elements(app.draw()).some(node => node.props.role === 'status' && String(node.props.children).includes('暂无可继续播放'))).toBe(true);
});

it('allows signed-out metadata browsing but gates play and queue, with truthful empty details', async () => {
  props.authenticated = false;
  render(); await act(); await act(() => button('打开榜单：热门榜甲').onClick());
  elements(tree).find(node => node.props.track?.id === 'A')!.props.onPlay();
  button('添加到队列：曲目A').onClick();
  expect(props.onLogin).toHaveBeenCalledTimes(2); expect(props.onPlay).not.toHaveBeenCalled(); expect(props.onAddToQueue).not.toHaveBeenCalled();
  native.chartDetail.mockResolvedValueOnce({ ok: true, data: page([], 10, false) });
  await act(() => button('刷新当前榜单').onClick());
  expect(native.chartDetail).toHaveBeenLastCalledWith({ id: 'public-A', start: 0, limit: 10, refresh: true });
  expect(elements(tree).some(node => node.props.title === '此榜单暂无曲目')).toBe(true);
  expect(elements(tree).some(node => node.props.track)).toBe(false);
});

it('returning and changing chart ignores the cancelled page; source refresh replaces rather than duplicates tracks', async () => {
  native.charts.mockResolvedValueOnce({ ok: true, data: { ...catalog, charts: [chart, { ...chart, id: 'public-B', title: '热门榜乙' }] } });
  render(); await act();
  let release!: (value: any) => void;
  native.chartDetail.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(() => button('打开榜单：热门榜甲').onClick());
  await act(() => button('返回榜单目录').onClick());
  native.chartDetail.mockResolvedValueOnce({ ok: true, data: { ...page([track('B')]), playlist: { ...chart, id: 'public-B', title: '热门榜乙', count: 100 } } });
  await act(() => button('打开榜单：热门榜乙').onClick());
  await act(() => release({ ok: true, data: page([track('late-A')]) }));
  expect(elements(tree).filter(node => node.props.track).map(node => node.props.track.id)).toEqual(['B']);
  expect(text()).toContain('详情标注 100 首');
});

it('caps browsing at 50 explicit pages and never auto-fetches the advertised total', async () => {
  native.chartDetail.mockImplementation((input: { start: number }) => Promise.resolve({ ok: true,
    data: page(Array.from({ length: 10 }, (_, i) => track(String(input.start + i))), input.start + 10, true) }));
  render(); await act(); await act(() => button('打开榜单：热门榜甲').onClick());
  expect(native.chartDetail).toHaveBeenCalledTimes(1);
  for (let index = 1; index < 50; index++) await act(() => button('加载更多榜单曲目').onClick());
  expect(native.chartDetail).toHaveBeenCalledTimes(50);
  expect(elements(tree).filter(node => node.props.track)).toHaveLength(500);
  expect(elements(tree).some(node => node.props['aria-label'] === '加载更多榜单曲目')).toBe(false);
});

it('shows a genuinely empty catalog and does not synthesize chart cards', async () => {
  native.charts.mockResolvedValueOnce({ ok: true, data: { ...catalog, charts: [] } });
  render(); await act();
  expect(elements(tree).some(node => node.props.title === '暂无公开热门榜单')).toBe(true);
  expect(elements(tree).some(node => String(node.props['aria-label']).startsWith('打开榜单：'))).toBe(false);
  expect(native.chartDetail).not.toHaveBeenCalled();
});

it('loads the actual public catalog then detail and delegates real tracks to the existing play/queue callbacks', async () => {
  let release!: (value: any) => void;
  native.charts.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  render(); expect(text()).toContain('正在读取公开榜单');
  await act(() => release({ ok: true, data: catalog }));
  expect(native.charts).toHaveBeenCalledExactlyOnceWith({ refresh: false });
  expect(text()).toContain('目录标注 299 首');
  await act(() => button('打开榜单：热门榜甲').onClick());
  expect(native.chartDetail).toHaveBeenCalledExactlyOnceWith({ id: 'public-A', start: 0, limit: 10, refresh: false });
  expect(text()).toContain('详情标注 200 首'); expect(text()).not.toContain('299 首');
  const row = elements(tree).find(node => node.props.track?.id === 'A')!;
  expect(row).toBeDefined(); row.props.onPlay();
  expect(props.onPlay).toHaveBeenCalledExactlyOnceWith([track('A')], 0);
  button('添加到队列：曲目A').onClick(); expect(props.onAddToQueue).toHaveBeenCalledExactlyOnceWith(track('A'));
  expect(text()).not.toMatch(/NEW|涨跌|全球榜/);
});
