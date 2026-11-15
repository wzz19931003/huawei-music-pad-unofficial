import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PadPlayer } from './PadPlayer';
import type { usePlayer } from './lib/player';

const playerAt = (volume: number) => ({
  current: { id: 'volume-test', title: '音量测试', artists: [], available: true },
  volume, playing: false, buffering: false, duration: 100, position: 0,
  lyrics: { synced: false, lines: [] }, favorite: false, mode: 'all', actualQuality: 'unknown', quality: 'standard',
  toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), cycleMode: vi.fn(), toggleFavorite: vi.fn(),
  selectMode: vi.fn(), cancelHeart: vi.fn(), heartStatus: 'idle', heartMessage: '', playbackDetails: null,
}) as unknown as ReturnType<typeof usePlayer>;

const render = (volume: number) => renderToStaticMarkup(<PadPlayer player={playerAt(volume)} open onOpen={vi.fn()} onClose={vi.fn()} queueOpen={false} onToggleQueue={vi.fn()} />);

describe('Pad player standalone volume', () => {
  it('uses the observed hollow organic transport badge for the large control', () => {
    expect(render(.6)).toContain('data-part="organic-transport-badge"');
  });
  it('renders a visible volume slider without opening more options', () => {
    const html = render(.6);
    expect(html).not.toContain('aria-label="播放选项"');
    expect(html).toContain('aria-label="音量控制"');
    expect(html).toContain('aria-label="音量"');
    expect(html).toContain('aria-label="静音"');
    expect(html).toContain('60%');
  });
});

describe('Pad player four-choice mode selection', () => {
  it('renders an explicit radio menu in catalog order instead of a cycle-only button', () => {
    const html = render(.6);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-label="选择播放模式"');
    expect((html.match(/role="menuitemradio"/g) ?? [])).toHaveLength(4);
    expect((html.match(/aria-checked="true"/g) ?? [])).toHaveLength(1);
    const labels = ['列表', '单曲循环', '随机播放', '心动模式'];
    const positions = labels.map(label => html.indexOf(`data-mode="${['all', 'one', 'shuffle', 'heart'][labels.indexOf(label)]}"`));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it('keeps heart loading and truthful rejection visible without opening more options', () => {
    const player = playerAt(.6);
    player.heartStatus = 'loading'; player.heartMessage = '正在读取收藏并查找相关新歌…';
    const props = { player, open: true, onOpen: vi.fn(), onClose: vi.fn(), queueOpen: false, onToggleQueue: vi.fn() };
    const loading = renderToStaticMarkup(<PadPlayer {...props} />);
    expect(loading).toContain('aria-label="心动模式状态"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain(player.heartMessage);
    player.heartStatus = 'no-candidates'; player.heartMessage = '没有找到相关的新歌，未切换心动模式。';
    expect(renderToStaticMarkup(<PadPlayer {...props} />)).toContain(player.heartMessage);
  });
});
