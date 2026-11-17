import { contextBridge, ipcRenderer } from 'electron';
import { desktopLyricsChannels as channels, DESKTOP_LYRICS_OVERLAY_ARGUMENT } from '../shared/desktop-lyrics';
import type { DesktopLyricsOverlayApi, DesktopLyricsPublisherApi, DesktopLyricsState } from '../shared/desktop-lyrics';
import { validateLyricsPreferencePatch, validatePublication } from '../main/desktop-lyrics-policy.mjs';

const invalid = () => Promise.resolve({ ok: false as const, error: { code: 'INVALID' as const, message: '桌面歌词数据或设置无效。' } });
function subscribe(listener: (state: DesktopLyricsState) => void) {
  if (typeof listener !== 'function') throw new TypeError('Desktop lyrics listener must be a function');
  const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopLyricsState) => listener(state);
  ipcRenderer.on(channels.stateChanged, wrapped);
  return () => { ipcRenderer.removeListener(channels.stateChanged, wrapped); };
}

/** Import this factory into the EXISTING primary preload; expose as desktop.desktopLyrics. */
export function createDesktopLyricsPublisher(): DesktopLyricsPublisherApi {
  return Object.freeze({
    state: () => ipcRenderer.invoke(channels.mainState),
    publish: value => {
      const clean = validatePublication(value);
      return clean ? ipcRenderer.invoke(channels.publish, clean) : invalid();
    },
    updatePreferences: patch => {
      const clean = validateLyricsPreferencePatch(patch, 'main');
      return clean ? ipcRenderer.invoke(channels.mainPreferences, clean) : invalid();
    },
    onState: subscribe,
  });
}

/** No player/account/filesystem/network/general IPC capabilities are installed here. */
export function createDesktopLyricsOverlayApi(): DesktopLyricsOverlayApi {
  return Object.freeze({
    state: () => ipcRenderer.invoke(channels.overlayState),
    updatePreferences: patch => {
      const clean = validateLyricsPreferencePatch(patch, 'overlay');
      return clean ? ipcRenderer.invoke(channels.overlayPreferences, clean) : invalid();
    },
    hide: () => ipcRenderer.invoke(channels.overlayHide),
    onState: subscribe,
  });
}
export function installDesktopLyricsOverlayPreload(): void {
  contextBridge.exposeInMainWorld('desktopLyrics', createDesktopLyricsOverlayApi());
}

// Bundle this same module to its OWN sandbox-compatible .cjs entry. Importing the
// publisher factory into the main preload does not install the overlay bridge.
if (process.isMainFrame && process.argv.includes(DESKTOP_LYRICS_OVERLAY_ARGUMENT)) installDesktopLyricsOverlayPreload();
