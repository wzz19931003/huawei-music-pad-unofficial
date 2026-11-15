import React, { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Cover } from './ui';
import type { PadScreenProps } from './PadScreens';

// These screens are presentational: exercise their real returned controls and
// callbacks without inventing an IPC backend or needing a second DOM library.
const screenPath = './PadScreens.tsx';
async function loadScreen(name: string) {
  const module = await import(/* @vite-ignore */ screenPath).catch(() => ({}));
  expect(module[name], `${name} must be exported`).toBeTypeOf('function');
  return module[name] as (props: PadScreenProps) => ReactElement;
}

function props(overrides: Partial<PadScreenProps> = {}): PadScreenProps {
  return {
    authenticated: false, favorites: [], history: [], playlists: [], total: 0,
    loading: false, playing: false,
    onPlay: vi.fn(), onOpenFavorites: vi.fn(), onOpenPlaylist: vi.fn(),
    onOpenPlaylists: vi.fn(), onSearch: vi.fn(), onOpenSettings: vi.fn(), onCheckUpdates: vi.fn(), onOpenAbout: vi.fn(),
    onLogin: vi.fn(), onNotice: vi.fn(), onOpenHistory: vi.fn(),
    onToggleFavorite: vi.fn(), onTrackMenu: vi.fn(), ...overrides,
  };
}

type ElementProps = Record<string, any>;
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  if (typeof node.type === 'function' && node.type !== Cover) {
    return elements((node.type as (props: ElementProps) => ReactNode)(node.props));
  }
  return [node, ...elements(node.props.children)];
}
function control(tree: ReactNode, label: string) {
  const found = elements(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);
  expect(found, `button “${label}” must exist`).toBeDefined();
  return found!.props;
}

describe('update and about entries', () => {
  it('distinguishes playlist sleeves from the playback queue glyph', async () => {
    for (const name of ['PadHomeScreen', 'PadMineScreen']) {
      const Screen = await loadScreen(name);
      expect(/data-pad-icon="ListMusic"[^>]*data-icon-variant="sleeve"/.test(renderToStaticMarkup(Screen(props())))).toBe(true);
    }
  });
  it('uses the reference collection-tile glyph for the Mine favorite metric', async () => {
    const Mine = await loadScreen('PadMineScreen');
    const html = renderToStaticMarkup(Mine(props()));
    expect(/data-pad-icon="Heart"[^>]*data-icon-variant="tile"/.test(html)).toBe(true);
  });
  it('keeps software update and about reachable without Huawei login', async () => {
    const Mine = await loadScreen('PadMineScreen');
    const input = { ...props(), onCheckUpdates: vi.fn(), onOpenAbout: vi.fn() };
    const tree = Mine(input);
    control(tree, '检查更新').onClick();
    control(tree, '关于').onClick();
    expect(input.onCheckUpdates).toHaveBeenCalledOnce();
    expect(input.onOpenAbout).toHaveBeenCalledOnce();
    expect(input.onLogin).not.toHaveBeenCalled();
  });
});

const first = { id: 'one', title: '第一首', artists: [{ name: '甲歌手' }], available: true };
const current = { id: 'two', title: '当前歌曲', artists: [{ name: '乙歌手' }], available: true, coverUrl: 'https://example.invalid/two.jpg' };
const blocked = { id: 'no-play', title: '不可播放歌曲', artists: [{ name: '丙歌手' }], available: false };

describe('Pad home', () => {
  it('keeps the four reference cards when signed out and routes collection entry to login', async () => {
    const Home = await loadScreen('PadHomeScreen');
    const input = props();
    const tree = Home(input);
    const markup = renderToStaticMarkup(tree);
    expect(elements(tree).filter(node => node.type === 'button' && String(node.props.className).includes('pad-feature-card'))).toHaveLength(4);
    expect(markup).toContain('每日30首');
    expect(markup).toContain('未接入');
    expect(markup).not.toContain('<h1');
    control(tree, '打开我的收藏').onClick();
    expect(input.onLogin).toHaveBeenCalledOnce();
    expect(input.onPlay).not.toHaveBeenCalled();
  });

  it('continues the actual current track instead of playing index zero', async () => {
    const Home = await loadScreen('PadHomeScreen');
    const input = props({ authenticated: true, history: [first, current], favorites: [current], currentId: 'two', playing: true, total: 81 });
    const tree = Home(input);
    expect(renderToStaticMarkup(tree)).toContain('当前歌曲');
    expect(renderToStaticMarkup(tree)).toContain('81 首');
    control(tree, '继续最近播放').onClick();
    expect(input.onPlay).toHaveBeenCalledExactlyOnceWith([first, current], 1);
    control(tree, '打开我的收藏').onClick();
    expect(input.onOpenFavorites).toHaveBeenCalledOnce();
    expect(input.onLogin).not.toHaveBeenCalled();
  });

  it('plays visible songs in their source queue and delegates favorite and context actions', async () => {
    const Home = await loadScreen('PadHomeScreen');
    const input = props({ authenticated: true, favorites: [first, current], total: 2 });
    const tree = Home(input);
    expect(elements(tree).filter(node => node.props.className === 'pad-song-column')).toHaveLength(3);
    control(tree, '播放：当前歌曲').onClick();
    expect(input.onPlay).toHaveBeenCalledExactlyOnceWith(input.favorites, 1);
    control(tree, '取消收藏：第一首').onClick();
    expect(input.onToggleFavorite).toHaveBeenCalledExactlyOnceWith(first);
    const row = elements(tree).find(node => node.props['data-track-id'] === first.id)!;
    const event = { preventDefault: vi.fn() };
    row.props.onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(input.onTrackMenu).toHaveBeenCalledExactlyOnceWith(first, event);
    control(tree, '打开歌单').onClick();
    expect(input.onOpenPlaylists).toHaveBeenCalledOnce();
  });

  it('explains unavailable music and recommendation entries without starting playback', async () => {
    const Home = await loadScreen('PadHomeScreen');
    const input = props({ authenticated: true, history: [blocked], favorites: [blocked] });
    const tree = Home(input);
    control(tree, '继续最近播放').onClick();
    control(tree, '查看最近收藏').onClick();
    const song = control(tree, '播放：不可播放歌曲');
    expect(song['aria-disabled']).toBe(true);
    song.onClick();
    control(tree, '每日30首，未接入').onClick();
    control(tree, '排行榜，未接入').onClick();
    expect(input.onPlay).not.toHaveBeenCalled();
    expect(input.onNotice).toHaveBeenCalledTimes(5);
    expect(renderToStaticMarkup(tree)).toContain('暂不可播放');
  });
});

describe('Pad music hall', () => {
  it('keeps two wide banners and plays real library songs without calling them new releases', async () => {
    const Hall = await loadScreen('PadHallScreen');
    const favorites = Array.from({ length: 8 }, (_, index) => ({ ...first, id: `song-${index}`, title: `收藏曲目${index}` }));
    const playlist = { id: 'owned-1', title: '真正的歌单', kind: 'owned' as const, count: 0 };
    const input = props({ authenticated: true, favorites, history: [current, first], playlists: [playlist] });
    const tree = Hall(input);
    const markup = renderToStaticMarkup(tree);
    expect(elements(tree).filter(node => node.type === 'button' && String(node.props.className).includes('pad-hall-banner'))).toHaveLength(2);
    expect(elements(tree).filter(node => node.type === 'button' && String(node.props.className).includes('pad-track-tile'))).toHaveLength(7);
    expect(markup).toContain('收藏音乐');
    expect(markup).not.toContain('最新发行');
    expect(markup).not.toContain('<h1');
    control(tree, '播放最近听过的音乐').onClick();
    expect(input.onPlay).toHaveBeenLastCalledWith(input.history, 0);
    control(tree, '打开歌单：真正的歌单').onClick();
    expect(input.onOpenPlaylist).toHaveBeenCalledExactlyOnceWith(playlist);
    control(tree, '播放收藏：收藏曲目6').onClick();
    expect(input.onPlay).toHaveBeenLastCalledWith(favorites, 6);
  });

  it('searches only actual history artists and visibly labels unintegrated channels', async () => {
    const Hall = await loadScreen('PadHallScreen');
    const playlist = { id: 'empty-list', title: '空歌单', kind: 'owned' as const, count: 0 };
    const input = props({ authenticated: true, history: [first, { ...first, id: 'duplicate-artist' }, current], playlists: [playlist] });
    const tree = Hall(input);
    control(tree, '搜索歌手：甲歌手').onClick();
    expect(input.onSearch).toHaveBeenCalledExactlyOnceWith('甲歌手');
    expect(elements(tree).filter(node => node.props['aria-label'] === '搜索歌手：甲歌手')).toHaveLength(1);
    expect(control(tree, '古典音乐，未接入')['aria-disabled']).toBe(true);
    control(tree, '古典音乐，未接入').onClick();
    expect(input.onNotice).toHaveBeenCalledOnce();
    expect(input.onPlay).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(tree)).toContain('0 首');
  });

  it('routes the empty signed-out collection entry to login', async () => {
    const Hall = await loadScreen('PadHallScreen');
    const input = props();
    const tree = Hall(input);
    expect(renderToStaticMarkup(tree)).toContain('收藏音乐');
    control(tree, '查看全部').onClick();
    expect(input.onLogin).toHaveBeenCalledOnce();
    expect(input.onOpenHistory).not.toHaveBeenCalled();
  });
});

describe('Pad café', () => {
  it('keeps the teal banner, four book categories and seven square categories without inventing playable shows', async () => {
    const Cafe = await loadScreen('PadCafeScreen');
    const input = props({ authenticated: true, favorites: [current], history: [first] });
    const tree = Cafe(input);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('pad-cafe-banner');
    expect(markup).toContain('有声内容尚未接入');
    expect(markup).not.toContain('当前歌曲');
    expect(markup).not.toContain('第一首');
    expect(markup).not.toContain('pad-tile-play');
    expect(markup).not.toContain('<h1');
    const buttons = elements(tree).filter(node => node.type === 'button');
    expect(buttons).toHaveLength(11);
    for (const button of buttons) {
      expect(button.props['aria-disabled']).toBe(true);
      button.props.onClick();
    }
    expect(input.onNotice).toHaveBeenCalledTimes(11);
    expect(input.onPlay).not.toHaveBeenCalled();
  });
});

describe('Pad mine', () => {
  it('shows supplied account and library counts and routes real library entries through callbacks', async () => {
    const Mine = await loadScreen('PadMineScreen');
    const playlist = { id: 'mine-list', title: '我的真实歌单', kind: 'owned' as const, count: 0 };
    const input = props({ authenticated: true, displayName: '测试用户', total: 81, favorites: [first, current], history: [current], playlists: [playlist] });
    const tree = Mine(input);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('测试用户');
    expect(markup).toContain('81');
    expect(markup).toContain('已加载 1 首');
    expect(markup).toContain('0 首');
    expect(markup).not.toContain('<h1');
    control(tree, '打开我的收藏').onClick();
    control(tree, '打开最近播放').onClick();
    control(tree, '打开我的歌单').onClick();
    control(tree, '打开歌单：我的真实歌单').onClick();
    control(tree, '设置').onClick();
    expect(input.onOpenFavorites).toHaveBeenCalledOnce();
    expect(input.onOpenHistory).toHaveBeenCalledOnce();
    expect(input.onOpenPlaylists).toHaveBeenCalledOnce();
    expect(input.onOpenPlaylist).toHaveBeenCalledExactlyOnceWith(playlist);
    expect(input.onOpenSettings).toHaveBeenCalledOnce();
    expect(input.onPlay).not.toHaveBeenCalled();
  });

  it('does not turn loading or unsupported account information into zero totals', async () => {
    const Mine = await loadScreen('PadMineScreen');
    const input = props({ authenticated: true, loading: true });
    const tree = Mine(input);
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain('读取中');
    expect(markup).not.toContain('自建歌单 0');
    expect(markup).not.toContain('收藏歌单 0');
    expect(markup).not.toContain('VIP');
    control(tree, '本地音乐，未接入').onClick();
    control(tree, '关注歌手，未接入').onClick();
    control(tree, '权益兑换，未接入').onClick();
    expect(input.onNotice).toHaveBeenCalledTimes(3);
    expect(input.onPlay).not.toHaveBeenCalled();
  });
});

describe('account boundaries', () => {
  it.each(['PadHomeScreen', 'PadHallScreen', 'PadMineScreen'])('does not expose stale personal data after logout in %s', async name => {
    const Screen = await loadScreen(name);
    const playlist = { id: 'stale-list', title: '上个账号的歌单', kind: 'owned' as const };
    const tree = Screen(props({ displayName: '上个账号', favorites: [current], history: [first], playlists: [playlist], total: 81 }));
    const markup = renderToStaticMarkup(tree);
    expect(markup).not.toContain('当前歌曲');
    expect(markup).not.toContain('第一首');
    expect(markup).not.toContain('上个账号');
    expect(markup).not.toContain('81 首');
  });
});
