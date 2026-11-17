import { describe, expect, it, vi } from 'vitest';
import type { DesktopLyricsState } from '../shared/desktop-lyrics';
const modulePath = './desktop-lyrics-control';
const load = async () => import(/* @vite-ignore */ modulePath).catch(() => ({})) as Promise<Record<string, any>>;
const nativeState = (patch: Partial<DesktopLyricsState> = {}): DesktopLyricsState => ({
  snapshot: { epoch: 1, generation: null, track: null, anchor: null, current: null, next: null },
  preferences: { version: 1, visible: false, locked: false, fontSize: 32, color: '#ffffff', highlightColor: '#f26d8b', showTranslation: true, wordHighlight: true, position: null },
  shown: false, persistence: 'saved', notice: null, ...patch,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('primary native-lyrics control lifecycle', () => {
  it('does not roll back a newer native event when an older initial state reply arrives late', async () => {
    const { connectDesktopLyricsControl } = await load();
    let finish!: (value: unknown) => void;
    let listener!: (state: DesktopLyricsState) => void;
    const onView = vi.fn();
    const control = connectDesktopLyricsControl({ api: {
      state: vi.fn(() => new Promise(resolve => { finish = resolve; })), updatePreferences: vi.fn(),
      onState: (callback: (state: DesktopLyricsState) => void) => { listener = callback; return vi.fn(); },
    }, onView, onNotice: vi.fn() });
    listener(nativeState({ shown: true }));
    const calls = onView.mock.calls.length;
    finish({ ok: true, data: nativeState() });
    await flush();
    expect(onView).toHaveBeenCalledTimes(calls);
    expect(onView).toHaveBeenLastCalledWith({ shown: true, locked: false, pending: false });
    control.stop();
  });
  it('reports persisted native failures once per active notice, not once per mirrored clock frame', async () => {
    const { connectDesktopLyricsControl } = await load();
    const message = '桌面歌词设置读取失败，当前使用默认设置；尚未覆盖原设置。';
    const failed = nativeState({ persistence: 'error', notice: { code: 'PERSISTENCE_READ_FAILED', message } });
    let listener!: (state: DesktopLyricsState) => void;
    const onNotice = vi.fn();
    const control = connectDesktopLyricsControl({ api: { state: vi.fn().mockResolvedValue({ ok: true, data: failed }),
      updatePreferences: vi.fn(), onState: (callback: (state: DesktopLyricsState) => void) => { listener = callback; return vi.fn(); } }, onView: vi.fn(), onNotice });
    await flush();
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(message);
    listener(failed); listener({ ...failed, snapshot: { ...failed.snapshot, generation: 8 } });
    expect(onNotice).toHaveBeenCalledOnce();
    listener(nativeState());
    listener(failed);
    expect(onNotice).toHaveBeenCalledTimes(2);
    control.stop();
    listener(failed);
    expect(onNotice).toHaveBeenCalledTimes(2);
  });
  it('reads back native visibility after a failed save instead of reporting a successful durable toggle', async () => {
    const { connectDesktopLyricsControl } = await load();
    const onView = vi.fn(); const onNotice = vi.fn();
    const failed = { code: 'PERSISTENCE_WRITE_FAILED', message: '桌面歌词设置保存失败，本次更改仅在当前运行中生效。' };
    const runtime = nativeState({ shown: true, persistence: 'error', notice: failed as any });
    const api = { state: vi.fn().mockResolvedValueOnce({ ok: true, data: nativeState() }).mockResolvedValue({ ok: true, data: runtime }),
      onState: vi.fn(() => vi.fn()), updatePreferences: vi.fn().mockResolvedValue({ ok: false, error: failed }) };
    const control = connectDesktopLyricsControl({ api, onView, onNotice });
    await flush();
    await control.toggle();
    expect(api.state).toHaveBeenCalledTimes(2);
    expect(onView).toHaveBeenLastCalledWith({ shown: true, locked: false, pending: false });
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(failed.message);
    control.stop();
  });
  it('uses native state only, coalesces duplicate toggles, ignores clock-only UI churn and unsubscribes', async () => {
    const { connectDesktopLyricsControl } = await load();
    expect(connectDesktopLyricsControl).toBeTypeOf('function');
    let listener!: (state: DesktopLyricsState) => void;
    const unsubscribe = vi.fn();
    const onView = vi.fn(); const onNotice = vi.fn();
    let finish!: (result: unknown) => void;
    const api = { state: vi.fn().mockResolvedValue({ ok: true, data: nativeState() }),
      updatePreferences: vi.fn(() => new Promise(resolve => { finish = resolve; })),
      onState: vi.fn(callback => { listener = callback; return unsubscribe; }) };
    const control = connectDesktopLyricsControl({ api, onView, onNotice });
    await flush();
    expect(onView).toHaveBeenLastCalledWith({ shown: false, locked: false, pending: false });
    const views = onView.mock.calls.length;
    listener(nativeState({ snapshot: { ...nativeState().snapshot, generation: 10 } }));
    expect(onView).toHaveBeenCalledTimes(views);
    const request = control.toggle();
    void control.toggle();
    expect(api.updatePreferences).toHaveBeenCalledExactlyOnceWith({ visible: true });
    expect(onView).toHaveBeenLastCalledWith({ shown: false, locked: false, pending: true });
    const shown = nativeState({ shown: true });
    listener(shown);
    expect(onView).toHaveBeenLastCalledWith({ shown: true, locked: false, pending: true });
    finish({ ok: true, data: shown });
    await request;
    expect(onView).toHaveBeenLastCalledWith({ shown: true, locked: false, pending: false });
    expect(onNotice).not.toHaveBeenCalled();
    control.stop();
    const afterStop = onView.mock.calls.length;
    listener(nativeState());
    await control.toggle();
    expect(onView).toHaveBeenCalledTimes(afterStop);
    expect(api.updatePreferences).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
    const absent = connectDesktopLyricsControl({ api: undefined, onView, onNotice });
    expect(onView).toHaveBeenLastCalledWith(null);
    await absent.toggle(); absent.stop();
    expect(onNotice).not.toHaveBeenCalled();
  });
});
