export type DesktopLyricsToggleState = { shown: boolean; locked: boolean };
type Props = { state: DesktopLyricsToggleState | null; pending: boolean; onToggle(): void };

/** Opens only the native lyric view. The existing singleton player owns Audio. */
export function DesktopLyricsToggle({ state, pending, onToggle }: Props) {
  if (!state) return null; // unsupported / not-ready hosts are not fake functional controls
  return <button type="button" className={`pad-control desktop-lyrics-toggle${state.shown ? ' is-active' : ''}`}
    aria-label={state.shown ? '隐藏桌面歌词' : '显示桌面歌词'} aria-pressed={state.shown} aria-busy={pending}
    disabled={pending} title={state.locked ? '桌面歌词已锁定；在托盘菜单选择“解锁桌面歌词（可拖动）”后可调整。' : '桌面歌词'}
    onClick={() => { if (!pending) onToggle(); }}><span aria-hidden="true">词</span></button>;
}
