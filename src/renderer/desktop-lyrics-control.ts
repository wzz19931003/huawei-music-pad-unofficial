import type { DesktopLyricsPublisherApi, DesktopLyricsState } from '../shared/desktop-lyrics';

export type DesktopLyricsControlView = { shown: boolean; locked: boolean; pending: boolean };
type ControlApi = Pick<DesktopLyricsPublisherApi, 'state' | 'updatePreferences' | 'onState'>;
type Options = { api?: ControlApi; onView(view: DesktopLyricsControlView | null): void; onNotice(message: string): void };

/** Primary control state only; no Audio, source words, URLs or account state. */
export function connectDesktopLyricsControl({ api, onView, onNotice }: Options) {
  let active = true;
  let busy = false;
  let state: DesktopLyricsState | null = null;
  let view: DesktopLyricsControlView | null = null;
  let lastNotice: string | null = null;
  let observations = 0;
  const notify = (message: string) => {
    if (!active || lastNotice === message) return;
    lastNotice = message;
    onNotice(message);
  };
  onView(null);
  const render = () => {
    if (!active || !state) return;
    const next = { shown: state.shown, locked: state.preferences.locked, pending: busy };
    if (view?.shown === next.shown && view.locked === next.locked && view.pending === next.pending) return;
    view = next;
    onView(next);
  };
  const observe = (next: DesktopLyricsState) => {
    if (!active) return;
    observations++;
    state = next;
    if (next.notice) notify(next.notice.message);
    else lastNotice = null;
    render();
  };
  const unsubscribe = api?.onState(observe);
  const initialObservation = observations;
  if (api) void api.state().then(result => {
    if (!active || observations !== initialObservation) return;
    if (result.ok) observe(result.data);
    else notify(result.error.message);
  }).catch(() => { if (observations === initialObservation) notify('桌面歌词模块未就绪，请更新完整安装包后重试。'); });
  return {
    async toggle() {
      if (!active || !api || !state || busy) return;
      busy = true;
      render();
      try {
        const result = await api.updatePreferences({ visible: !state.shown });
        if (!active) return;
        if (result.ok) observe(result.data);
        else {
          notify(result.error.message);
          // A failed disk save can still have changed the native window. Read the
          // authoritative runtime state; do not claim durable success or roll it back.
          const beforeRead = observations;
          const current = await api.state();
          if (active && observations === beforeRead && current.ok) observe(current.data);
        }
      } catch { notify('无法更新桌面歌词，请稍后重试。'); }
      finally { busy = false; render(); }
    },
    stop() { if (!active) return; active = false; unsubscribe?.(); },
  };
}
