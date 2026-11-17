import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DesktopLyricsOverlayApi, DesktopLyricsOverlayPatch, DesktopLyricsResult, DesktopLyricsState } from '../shared/desktop-lyrics';
import { projectLyricsDisplay } from '../main/desktop-lyrics-model.mjs';

export type DesktopLyricsViewProps = {
  state: DesktopLyricsState;
  nowMs: number;
  onPatch(patch: DesktopLyricsOverlayPatch): void;
  onHide(): void;
  actionError?: string;
};

/** Text nodes only. No lyric/title/translation ever becomes HTML, a URL or a style. */
export function DesktopLyricsView({ state, nowMs, onPatch, onHide, actionError }: DesktopLyricsViewProps) {
  const { preferences, snapshot } = state;
  const display = projectLyricsDisplay(snapshot.track ? snapshot : { ...snapshot, current: null, next: null, anchor: null }, nowMs);
  const current = display.current;
  const activeWord = preferences.wordHighlight ? display.activeWord : -1;
  const translated = Boolean(preferences.showTranslation && current?.translation?.trim());
  const secondary = translated ? current?.translation : display.next?.text ?? '';
  const style = { '--dl-font-size': `${preferences.fontSize}px`, '--dl-color': preferences.color,
    '--dl-highlight': preferences.highlightColor } as CSSProperties;
  return <main className="desktop-lyrics" data-locked={preferences.locked} data-stale={display.stale} style={style}>
    {!preferences.locked && <header className="dl-toolbar">
      <div className="dl-drag-handle" title="拖动调整桌面歌词位置">
        <span aria-hidden="true" className="dl-grip">⠿</span>
        <span className="dl-track">{snapshot.track ? `${snapshot.track.title} · ${snapshot.track.artist}` : 'Wmusic · 桌面歌词'}</span>
      </div>
      <button type="button" onClick={() => onPatch({ locked: true })} title="锁定后点击穿透；从主窗口或托盘解锁" aria-label="锁定桌面歌词">锁定</button>
      <button type="button" onClick={onHide} aria-label="隐藏桌面歌词" title="隐藏，不会退出播放器">×</button>
    </header>}
    {preferences.locked && <div className="dl-recovery">已锁定 · 从主窗口或托盘解锁</div>}
    <section className="dl-lines" aria-label="桌面歌词" aria-live="polite" data-active-word={activeWord}>
      <p className="dl-line dl-current" data-lyric-row="current" title={current?.text ?? ''}>
        {activeWord >= 0 && current?.segments ? current.segments.map((segment: { text: string }, index: number) =>
          <span key={index} className={index === activeWord ? 'dl-word dl-word-active' : 'dl-word'}>{segment.text}</span>) : current?.text || (snapshot.track ? display.next ? '前奏 · 等待歌词' : '暂无歌词' : '尚未播放')}
      </p>
      <p className="dl-line dl-secondary" data-lyric-row="secondary" data-translation={translated} title={secondary}>{secondary || '\u00a0'}</p>
    </section>
    {!preferences.locked && <div className="dl-settings" aria-label="桌面歌词设置">
      <label className="dl-size">字号 <input aria-label="字体大小" type="range" min="18" max="64" step="1" value={preferences.fontSize}
        onChange={event => onPatch({ fontSize: Number(event.currentTarget.value) })} /><output>{preferences.fontSize}</output></label>
      <label>文字 <input aria-label="歌词颜色" type="color" value={preferences.color} onChange={event => onPatch({ color: event.currentTarget.value })} /></label>
      <label>高亮 <input aria-label="逐词高亮颜色" type="color" value={preferences.highlightColor} onChange={event => onPatch({ highlightColor: event.currentTarget.value })} /></label>
      <label><input type="checkbox" checked={preferences.showTranslation} onChange={event => onPatch({ showTranslation: event.currentTarget.checked })} />译文</label>
      <label><input type="checkbox" checked={preferences.wordHighlight} onChange={event => onPatch({ wordHighlight: event.currentTarget.checked })} />逐词</label>
    </div>}
    {(actionError || state.notice) && <p className="dl-notice" role="alert">{actionError || state.notice?.message}</p>}
    {!actionError && !state.notice && <p className="dl-status" role="status">
      {state.persistence === 'pending' ? '正在保存设置…' : display.stale ? '等待播放器同步；歌词进度已停止推算' : ''}
    </p>}
  </main>;
}

/** Receives snapshots only; this renderer never imports the player or constructs Audio. */
export function DesktopLyrics({ api = typeof window === 'undefined' ? undefined : window.desktopLyrics }: { api?: DesktopLyricsOverlayApi }) {
  const [state, setState] = useState<DesktopLyricsState | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const [actionError, setActionError] = useState('');
  const [draftPreferences, setDraftPreferences] = useState<DesktopLyricsOverlayPatch>({});
  const active = useRef(false);
  const pendingPatch = useRef<DesktopLyricsOverlayPatch>({});
  const patchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    active.current = true;
    if (!api) { setActionError('桌面歌词桥接不可用，请从主窗口重试。'); return () => { active.current = false; }; }
    let revision = 0;
    let unsubscribe = () => {};
    try {
      unsubscribe = api.onState(value => { if (active.current) { revision++; setState(value); setNowMs(Date.now()); } });
      const requestedAt = revision;
      void api.state().then(result => {
        if (!active.current || revision !== requestedAt) return;
        if (result.ok) { setState(result.data); setNowMs(Date.now()); }
        else setActionError(result.error.message);
      }).catch(() => { if (active.current) setActionError('桌面歌词状态读取失败，请从主窗口重试。'); });
    } catch { setActionError('桌面歌词桥接不可用，请从主窗口重试。'); }
    return () => { active.current = false; unsubscribe(); clearTimeout(patchTimer.current); pendingPatch.current = {}; };
  }, [api]);
  useEffect(() => {
    const anchor = state?.snapshot.anchor;
    if (!anchor?.playing || !state?.preferences.visible) return;
    const initialAge = Math.max(0, Date.now() - anchor.receivedAtMs);
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      const age = initialAge + performance.now() - started;
      setNowMs(anchor.receivedAtMs + age);
      if (age < 1500) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state?.snapshot.anchor, state?.preferences.visible]);
  const runAction = useCallback((action: () => Promise<DesktopLyricsResult<DesktopLyricsState>>, committed?: DesktopLyricsOverlayPatch) => {
    const clearCommittedDraft = () => {
      if (committed) setDraftPreferences(current => Object.fromEntries(Object.entries(current)
        .filter(([key, value]) => committed[key as keyof DesktopLyricsOverlayPatch] !== value)));
    };
    void Promise.resolve().then(action).then(result => {
      if (!active.current) return;
      clearCommittedDraft();
      if (result.ok) { setState(result.data); setActionError(''); setNowMs(Date.now()); }
      else setActionError(result.error.message);
    }).catch(() => { if (active.current) { clearCommittedDraft(); setActionError('桌面歌词操作失败，请从主窗口重试。'); } });
  }, []);
  const onPatch = (patch: DesktopLyricsOverlayPatch) => {
    if (!api) return;
    // React immediately while native commits coalesce. Never pretend to be locked
    // before main verifies that a real recovery route is available.
    const { locked: _locked, ...visualPatch } = patch;
    setDraftPreferences(current => ({ ...current, ...visualPatch }));
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (patch.locked !== undefined) {
      clearTimeout(patchTimer.current); patchTimer.current = undefined;
      const value = pendingPatch.current; pendingPatch.current = {};
      runAction(() => api.updatePreferences(value), value);
    } else if (!patchTimer.current) {
      // Color-picker/slider bursts are coalesced before the native per-capability limit.
      patchTimer.current = setTimeout(() => {
        patchTimer.current = undefined;
        const value = pendingPatch.current; pendingPatch.current = {};
        runAction(() => api.updatePreferences(value), value);
      }, 120);
    }
  };
  if (!state) return <main className="desktop-lyrics dl-loading"><p role={actionError ? 'alert' : 'status'}>{actionError || '正在连接播放器…'}</p></main>;
  return <DesktopLyricsView state={{ ...state, preferences: { ...state.preferences, ...draftPreferences } }} nowMs={nowMs} onPatch={onPatch} onHide={() => { if (api) runAction(() => api.hide()); }} actionError={actionError} />;
}
