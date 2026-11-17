import { describe, expect, it, vi } from 'vitest';
import { desktopLyricsChannels } from '../shared/desktop-lyrics';
import { contextBridge, ipcRenderer } from 'electron';
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(async () => ({ ok: true })), on: vi.fn(), removeListener: vi.fn() },
}));

describe('primary preload desktop-lyrics integration', () => {
  it('adds only the typed primary publisher beside the existing application API', async () => {
    await import('./index');
    const call = vi.mocked(contextBridge.exposeInMainWorld).mock.calls.find(([name]) => name === 'desktop');
    expect(call).toBeDefined();
    const api = call![1] as any;
    expect(api.desktopLyrics, 'main window must have a narrow publisher, not an unwired overlay').toBeDefined();
    expect(Object.keys(api.desktopLyrics).sort()).toEqual(['onState', 'publish', 'state', 'updatePreferences']);
    expect(api.desktopLyrics.invoke).toBeUndefined();
    expect(api.desktopLyrics.hide).toBeUndefined();
    expect(api.music.resolvePlayback).toBeTypeOf('function');
    expect(api.player.onCommand).toBeTypeOf('function');
    expect(vi.mocked(contextBridge.exposeInMainWorld).mock.calls.map(([name]) => name)).toEqual(['desktop']);
    await api.desktopLyrics.state();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(desktopLyricsChannels.mainState);
    await api.desktopLyrics.publish({ epoch: 1, generation: 0, sequence: 1, track: null, clock: null, current: null, next: null });
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(desktopLyricsChannels.publish, expect.objectContaining({ track: null }));
  });
});
