import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const modulePath = './DesktopLyricsToggle';
const load = async () => import(/* @vite-ignore */ modulePath).catch(() => ({})) as Promise<Record<string, any>>;

describe('primary desktop lyrics control', () => {
  it('toggles only the native overlay, shows authoritative state, and never creates a second player', async () => {
    const { DesktopLyricsToggle } = await load();
    expect(DesktopLyricsToggle, 'the native overlay needs an actual primary-player control').toBeTypeOf('function');
    const onToggle = vi.fn();
    expect(DesktopLyricsToggle({ state: null, pending: false, onToggle })).toBeNull();
    const props = { state: { shown: false, locked: false }, pending: false, onToggle };
    const tree = DesktopLyricsToggle(props);
    expect(tree.type).toBe('button');
    expect(tree.props.type).toBe('button');
    expect(tree.props['aria-label']).toBe('显示桌面歌词');
    expect(tree.props['aria-pressed']).toBe(false);
    tree.props.onClick();
    expect(onToggle).toHaveBeenCalledExactlyOnceWith();
    const visible = renderToStaticMarkup(<DesktopLyricsToggle {...props} state={{ shown: true, locked: true }} />);
    expect(visible).toContain('aria-label="隐藏桌面歌词"');
    expect(visible).toContain('aria-pressed="true"');
    expect(visible).toContain('托盘');
    expect(visible).not.toMatch(/<audio|<video|<iframe|href=|src=/);
    onToggle.mockClear();
    const pending = DesktopLyricsToggle({ ...props, pending: true });
    expect(pending.props.disabled).toBe(true);
    expect(pending.props['aria-busy']).toBe(true);
    pending.props.onClick();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
