import { describe, expect, it, vi } from 'vitest';
import { desktopLyricsChannels as channels } from '../shared/desktop-lyrics';
import { contextBridge, ipcRenderer } from 'electron';
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: vi.fn() }, ipcRenderer: { invoke: vi.fn(async () => ({ ok: true })), on: vi.fn(), removeListener: vi.fn() } }));

describe('dedicated desktop lyrics preloads', () => {
  it('keeps publication/main controls separate from the narrow overlay bridge and strips IPC event objects', async () => {
    const name = './' + 'desktop-lyrics.ts';
    const mod = await import(/* @vite-ignore */ name).catch(() => ({}));
    expect(mod.createDesktopLyricsPublisher, 'missing primary lyrics preload').toBeTypeOf('function');
    const publisher = mod.createDesktopLyricsPublisher();
    const overlay = mod.createDesktopLyricsOverlayApi();
    expect(Object.keys(publisher).sort()).toEqual(['onState', 'publish', 'state', 'updatePreferences']);
    expect(Object.keys(overlay).sort()).toEqual(['hide', 'onState', 'state', 'updatePreferences']);
    expect(overlay.publish).toBeUndefined();
    expect(overlay.invoke).toBeUndefined();
    await overlay.hide(); expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channels.overlayHide);
    await publisher.state(); expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channels.mainState);
    await overlay.state(); expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channels.overlayState);
    const before = vi.mocked(ipcRenderer.invoke).mock.calls.length;
    expect((await overlay.updatePreferences({ visible: true })).ok).toBe(false);
    expect((await publisher.publish({ mediaUrl: 'https://invalid.test/audio' })).ok).toBe(false);
    expect(vi.mocked(ipcRenderer.invoke).mock.calls.length).toBe(before);
    await overlay.updatePreferences({ color: '#ABCDEF' });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(channels.overlayPreferences, { color: '#abcdef' });
    const listener = vi.fn(); const off = overlay.onState(listener);
    const wrapped = vi.mocked(ipcRenderer.on).mock.calls.at(-1)![1];
    const state = { preferences: { locked: true } };
    wrapped({ sender: 'never-expose' } as any, state);
    expect(listener).toHaveBeenCalledWith(state);
    expect(listener.mock.calls[0]).toHaveLength(1);
    off(); expect(ipcRenderer.removeListener).toHaveBeenLastCalledWith(channels.stateChanged, wrapped);
    mod.installDesktopLyricsOverlayPreload();
    expect(contextBridge.exposeInMainWorld).toHaveBeenLastCalledWith('desktopLyrics', expect.objectContaining({ hide: expect.any(Function) }));
    expect(contextBridge.exposeInMainWorld).not.toHaveBeenCalledWith('desktop', expect.anything());
  });
});
