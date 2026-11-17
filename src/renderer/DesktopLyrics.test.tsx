import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesktopLyricsState } from '../shared/desktop-lyrics';

const state = (): DesktopLyricsState => ({
  preferences: { version: 1, visible: true, locked: false, fontSize: 32, color: '#ffffff', highlightColor: '#8de7cd', showTranslation: true, wordHighlight: true, position: null },
  snapshot: { epoch: 1, generation: 7, track: { key: 'audio-7', title: '<script>bad()</script>', artist: '测试歌手' },
    anchor: { positionMs: 1400, playing: true, rate: 1, receivedAtMs: 1000 },
    current: { timeMs: 1000, text: '你好', translation: '<img src=x onerror=bad()>', segments: [{ timeMs: 1000, text: '你' }, { timeMs: 1500, text: '好' }] },
    next: { timeMs: 3000, text: '下句' } }, shown: true, persistence: 'saved', notice: null,
});

describe('desktop lyrics isolated renderer', () => {
  it('renders exactly two escaped lyric rows, source translation and only the source-timed active word', async () => {
    const name = './' + 'DesktopLyrics.tsx';
    const mod = await import(/* @vite-ignore */ name).catch(() => ({}));
    expect(mod.DesktopLyricsView, 'missing isolated lyrics renderer').toBeTypeOf('function');
    const render = (value: DesktopLyricsState, nowMs = 1100) => renderToStaticMarkup(mod.DesktopLyricsView({ state: value, nowMs, onPatch: vi.fn(), onHide: vi.fn() }));
    const value = state(); const html = render(value);
    expect((html.match(/data-lyric-row=/g) ?? [])).toHaveLength(2);
    expect(html).toContain('&lt;img src=x onerror=bad()&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>bad()');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('data-active-word="1"');
    expect(html).toContain('aria-label="字体大小"');
    expect(html).toContain('aria-label="歌词颜色"');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('<iframe');
    value.preferences.showTranslation = false;
    expect(render(value)).toContain('下句');
    expect(render(value)).not.toContain('onerror=bad()');
    value.preferences.wordHighlight = false;
    expect(render(value)).not.toContain('dl-word-active');
    value.preferences.locked = true;
    expect(render(value)).toContain('从主窗口或托盘解锁');
    expect(render(value)).not.toContain('<input');
  });

  it('clears previous text on track reset, distinguishes empty lyrics, never invents word timing and surfaces save failure', async () => {
    const { DesktopLyricsView } = await import('./DesktopLyrics');
    const value = state();
    const render = () => renderToStaticMarkup(<DesktopLyricsView state={value} nowMs={1200} onPatch={vi.fn()} onHide={vi.fn()} />);
    value.snapshot.track = null;
    expect(render()).toContain('尚未播放');
    expect(render()).not.toContain('你好');
    expect(render()).not.toContain('onerror=bad()');
    value.snapshot.track = { key: 'new', title: '新曲', artist: '' };
    value.snapshot.current = null; value.snapshot.next = null;
    expect(render()).toContain('暂无歌词');
    value.snapshot.current = { timeMs: null, text: '纯文本歌词', segments: [{ timeMs: null, text: '纯文本歌词' }] };
    expect(render()).not.toContain('dl-word-active');
    expect(render()).toContain('纯文本歌词');
    value.persistence = 'error'; value.notice = { code: 'PERSISTENCE_WRITE_FAILED', message: '设置保存失败，仅在当前运行生效。' };
    expect(render()).toContain('role="alert"');
    expect(render()).toContain('设置保存失败，仅在当前运行生效。');
  });
});
