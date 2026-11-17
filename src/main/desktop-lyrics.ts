import { app, BrowserWindow, ipcMain, screen, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { desktopLyricsChannels as channels, DESKTOP_LYRICS_OVERLAY_ARGUMENT } from '../shared/desktop-lyrics';
import type { DesktopLyricsErrorCode, DesktopLyricsMainPatch, DesktopLyricsNotice, DesktopLyricsPreferences,
  DesktopLyricsResult, DesktopLyricsState } from '../shared/desktop-lyrics';
import { createLyricsTimeline } from './desktop-lyrics-model.mjs';
import { createLyricsRateLimit, isAllowedLyricsResource, isLocalLyricsDocumentUrl, isTrustedLyricsSender, lyricsWindowBounds,
  sanitizeLyricsPreferences, validateLyricsPreferencePatch } from './desktop-lyrics-policy.mjs';

export type DesktopLyricsStorage = {
  /** Parent-owned dedicated non-secret store under normal app.getPath('userData'). */
  read(): unknown | Promise<unknown>;
  /** Store this sanitized DTO only; implementations must report failed writes by throwing. */
  write(preferences: DesktopLyricsPreferences): void | Promise<void>;
};
export type DesktopLyricsControllerOptions = {
  getMainWindow(): BrowserWindow | null;
  /** Exact local primary document, including any build-controlled dev URL. No prefixes. */
  mainDocumentUrl: string;
  entry: { htmlPath: string; preloadPath: string; developmentUrl?: string };
  storage: DesktopLyricsStorage;
  /** Must reflect an actually wired main-window / tray unlock route, not just a hidden window. */
  hasRecovery(): boolean;
  onNotice?(notice: DesktopLyricsNotice): void;
  onState?(state: DesktopLyricsState): void;
};
export type DesktopLyricsController = {
  getState(): DesktopLyricsState;
  /** Call immediately after each primary BrowserWindow creation/replacement. Idempotent. */
  attachMainWindow(): void;
  /** Clears track/clock and starts a fresh main-owned publication epoch. */
  reset(): number;
  setVisible(visible: boolean): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  /** Native tray/main recovery; does not depend on hover forwarding in a locked window. */
  setLocked(locked: boolean): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  updatePreferences(patch: DesktopLyricsMainPatch): Promise<DesktopLyricsResult<DesktopLyricsState>>;
  dispose(): Promise<void>;
};

const messages: Record<DesktopLyricsErrorCode, string> = {
  DENIED: '桌面歌词请求未获授权。', INVALID: '桌面歌词数据或设置无效。', STALE: '桌面歌词已忽略过期播放数据。',
  RATE_LIMITED: '桌面歌词请求过于频繁，请稍后重试。', DISPOSED: '桌面歌词已关闭。',
  PERSISTENCE_READ_FAILED: '桌面歌词设置读取失败，当前使用默认设置；尚未覆盖原设置。',
  PERSISTENCE_WRITE_FAILED: '桌面歌词设置保存失败，本次更改仅在当前运行中生效。',
  WINDOW_FAILED: '桌面歌词窗口加载失败，请从主窗口重试。',
};
const failure = (code: DesktopLyricsErrorCode): DesktopLyricsResult<never> => ({ ok: false, error: { code, message: messages[code] } });
const success = <T>(data: T): DesktopLyricsResult<T> => ({ ok: true, data });
function boundedStoreOperation<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Store deadline')), 3000); });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

/** Create once per app lifetime, AFTER app.whenReady(). This never touches application IPC. */
export async function createDesktopLyricsController(options: DesktopLyricsControllerOptions): Promise<DesktopLyricsController> {
  if (!isAbsolute(options.entry.htmlPath) || !isAbsolute(options.entry.preloadPath)) throw new Error('Desktop lyrics entries must be absolute');
  const overlayUrl = options.entry.developmentUrl ?? pathToFileURL(options.entry.htmlPath).href;
  if (!isLocalLyricsDocumentUrl(overlayUrl) || !isLocalLyricsDocumentUrl(options.mainDocumentUrl)) throw new Error('Desktop lyrics documents must be exact local URLs');
  const assetRootUrl = new URL('./', overlayUrl).href;
  const timeline = createLyricsTimeline();
  let preferences = sanitizeLyricsPreferences(null) as DesktopLyricsPreferences;
  let notice: DesktopLyricsNotice | null = null;
  let persistence: DesktopLyricsState['persistence'] = 'saved';
  let overlay: BrowserWindow | null = null;
  let loadingWindow: Promise<BrowserWindow> | null = null;
  let disposed = false;
  let disposal: Promise<void> | null = null;
  let quitting = false;
  let writing: Promise<boolean> | null = null;
  let storeInFlight: Promise<void> | null = null;
  let dirty = false;
  const registered: string[] = [];
  const securityCleanup = new Set<() => void>();
  const limits: ReturnType<typeof createLyricsRateLimit>[] = [];
  let attachedMain: Electron.WebContents | null = null;
  let detachMain = () => {};
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  let adjustingBounds = false;
  const boundsFor = (position: DesktopLyricsPreferences['position']) => lyricsWindowBounds(position,
    screen.getAllDisplays(), screen.getPrimaryDisplay().id, preferences.fontSize);
  function reflow() {
    if (!overlay || overlay.isDestroyed() || disposed) return;
    const current = overlay.getBounds();
    const bounds = boundsFor(current);
    if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
      adjustingBounds = true;
      try { overlay.setBounds(bounds, false); } finally { adjustingBounds = false; }
    }
    preferences = { ...preferences, position: { x: bounds.x, y: bounds.y } };
  }
  const onDisplayChange = () => { if (overlay && !disposed) { reflow(); void persist(); } };
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);
  const canRecover = () => { try { return options.hasRecovery() === true; } catch { return false; } };
  function applyLock() {
    if (!overlay || overlay.isDestroyed()) return;
    overlay.setAlwaysOnTop(true, 'floating');
    overlay.setMovable(!preferences.locked);
    overlay.setFocusable(!preferences.locked);
    if (preferences.locked) overlay.setIgnoreMouseEvents(true, { forward: true });
    else overlay.setIgnoreMouseEvents(false);
  }

  const getState = (): DesktopLyricsState => ({ snapshot: timeline.snapshot() as DesktopLyricsState['snapshot'],
    preferences: structuredClone(preferences), shown: Boolean(overlay && !overlay.isDestroyed() && overlay.isVisible()), persistence,
    notice: notice ? { ...notice } : null });
  function broadcast() {
    if (disposed) return;
    const state = getState();
    const main = options.getMainWindow();
    for (const [window, url] of [[main, options.mainDocumentUrl], [overlay, overlayUrl]] as const) {
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.getURL() === url) {
        try { window.webContents.send(channels.stateChanged, state); } catch { /* torn-down renderer */ }
      }
    }
    try { options.onState?.(state); } catch { /* an observer cannot break native lifecycle */ }
  }
  function report(code: DesktopLyricsErrorCode) {
    notice = { code, message: messages[code] };
    try { options.onNotice?.({ ...notice }); } catch { /* never expose the original exception */ }
    broadcast();
  }
  function reset() {
    if (disposed) return timeline.snapshot().epoch;
    const epoch = timeline.reset();
    if (preferences.locked && !canRecover()) {
      preferences = { ...preferences, locked: false };
      applyLock();
      void persist();
    }
    for (const limit of limits) limit.reset();
    broadcast();
    return epoch;
  }
  const onBeforeQuit = () => {
    quitting = true;
    timeline.reset();
    broadcast();
  };
  app.on('before-quit', onBeforeQuit);
  function attachMainWindow() {
    if (disposed) return;
    const window = options.getMainWindow();
    const contents = window && !window.isDestroyed() ? window.webContents : null;
    if (contents === attachedMain) return;
    detachMain();
    attachedMain = contents;
    reset();
    if (!contents || contents.isDestroyed()) return;
    const onNavigation = (_event: Electron.Event, _url: string, inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !inPlace) reset();
    };
    const onGone = () => { reset(); };
    contents.on('did-start-navigation', onNavigation);
    // The old document can republish the navigation epoch until its replacement finishes loading.
    contents.on('did-finish-load', reset);
    contents.on('render-process-gone', onGone);
    contents.on('destroyed', onGone);
    detachMain = () => {
      contents.removeListener('did-start-navigation', onNavigation);
      contents.removeListener('did-finish-load', reset);
      contents.removeListener('render-process-gone', onGone);
      contents.removeListener('destroyed', onGone);
    };
  }
  async function persist(): Promise<boolean> {
    dirty = true;
    persistence = 'pending';
    broadcast();
    if (!writing) {
      writing = (async () => {
        let saved = true;
        while (dirty) {
          dirty = false;
          const value = sanitizeLyricsPreferences(preferences) as DesktopLyricsPreferences;
          try {
            // A deadline does not cancel parent I/O. Never overlap it with a newer write.
            if (storeInFlight) throw new Error('Store still busy');
            const operation = Promise.resolve().then(() => options.storage.write(value));
            storeInFlight = operation;
            void operation.finally(() => { if (storeInFlight === operation) storeInFlight = null; }).catch(() => {});
            await boundedStoreOperation(operation);
            saved = true;
            persistence = dirty ? 'pending' : 'saved';
            if (notice?.code === 'PERSISTENCE_WRITE_FAILED' || notice?.code === 'PERSISTENCE_READ_FAILED') notice = null;
          } catch {
            saved = false;
            persistence = 'error';
            report('PERSISTENCE_WRITE_FAILED');
          }
        }
        broadcast();
        return saved;
      })().finally(() => { writing = null; });
    }
    return writing;
  }
  try { preferences = sanitizeLyricsPreferences(await boundedStoreOperation(Promise.resolve().then(() => options.storage.read()))) as DesktopLyricsPreferences; }
  catch { persistence = 'error'; report('PERSISTENCE_READ_FAILED'); }
  if (preferences.locked && !canRecover()) preferences = { ...preferences, locked: false };

  function ensureWindow(): Promise<BrowserWindow> {
    if (loadingWindow) return loadingWindow;
    if (overlay && !overlay.isDestroyed()) return Promise.resolve(overlay);
    loadingWindow = createOverlayWindow().finally(() => { loadingWindow = null; });
    return loadingWindow;
  }
  async function createOverlayWindow() {
    const isolatedSession = session.fromPartition(`desktop-lyrics-${randomUUID()}`, { cache: false });
    isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.setDevicePermissionHandler(() => false);
    isolatedSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    const denyDownload = (event: Electron.Event) => event.preventDefault();
    isolatedSession.on('will-download', denyDownload);
    isolatedSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedLyricsResource(details, overlayUrl, assetRootUrl) }));
    const cleanupSession = () => {
      isolatedSession.removeListener('will-download', denyDownload);
      isolatedSession.webRequest.onBeforeRequest(null);
      // Keep deny-all permission callbacks for this non-persistent, now-unused session.
      securityCleanup.delete(cleanupSession);
    };
    securityCleanup.add(cleanupSession);
    const bounds = boundsFor(preferences.position);
    preferences = { ...preferences, position: { x: bounds.x, y: bounds.y } };
    const window = new BrowserWindow({
      title: 'Wmusic · 桌面歌词', ...bounds, show: false, frame: false, transparent: true,
      backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true, resizable: false,
      maximizable: false, minimizable: false, fullscreenable: false,
      webPreferences: { preload: options.entry.preloadPath, session: isolatedSession,
        additionalArguments: [DESKTOP_LYRICS_OVERLAY_ARGUMENT], sandbox: true, contextIsolation: true,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        webSecurity: true, webviewTag: false, allowRunningInsecureContent: false, devTools: false },
    });
    overlay = window;
    applyLock();
    const denyNavigation = (event: Electron.Event) => event.preventDefault();
    window.webContents.on('will-navigate', denyNavigation);
    window.webContents.on('will-frame-navigate', denyNavigation);
    window.webContents.on('will-redirect', denyNavigation);
    window.webContents.on('will-attach-webview', denyNavigation);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('render-process-gone', () => {
      if (disposed) return;
      window.destroy();
      report('WINDOW_FAILED');
    });
    window.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (disposed || !isMainFrame || url === overlayUrl) return;
      preferences = { ...preferences, visible: false };
      window.hide();
      window.destroy();
      report('WINDOW_FAILED');
      void persist();
    });
    window.on('close', event => { if (!disposed && !quitting) { event.preventDefault(); void updatePreferences({ visible: false }); } });
    window.on('closed', () => { if (overlay === window) overlay = null; cleanupSession(); });
    window.on('move', () => {
      if (disposed || adjustingBounds || preferences.locked) return;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => { moveTimer = undefined; reflow(); void persist(); }, 180);
    });
    window.webContents.on('did-finish-load', broadcast);
    try { await window.loadURL(overlayUrl); }
    catch { if (!window.isDestroyed()) window.destroy(); if (!disposed) report('WINDOW_FAILED'); throw new Error('Desktop lyrics window failed'); }
    if (notice?.code === 'WINDOW_FAILED') notice = null;
    return window;
  }
  async function updatePreferences(input: DesktopLyricsMainPatch): Promise<DesktopLyricsResult<DesktopLyricsState>> {
    if (disposed || quitting) return failure('DISPOSED');
    const patch = validateLyricsPreferencePatch(input, 'main') as DesktopLyricsMainPatch | null;
    if (!patch) return failure('INVALID');
    if (patch.locked === true && !canRecover()) return failure('DENIED');
    preferences = { ...preferences, ...patch };
    if (preferences.visible) {
      try {
        const window = await ensureWindow();
        if (disposed || quitting) return failure('DISPOSED');
        // Loading is asynchronous: the latest native preference, not the older
        // caller's intent, controls whether this window may become visible.
        if (preferences.visible) window.showInactive();
        else window.hide();
      } catch { return failure(disposed || quitting ? 'DISPOSED' : 'WINDOW_FAILED'); }
    } else if (overlay && !overlay.isDestroyed()) overlay.hide();
    if (disposed || quitting) return failure('DISPOSED');
    reflow();
    applyLock();
    const saved = await persist();
    return saved ? success(getState()) : failure('PERSISTENCE_WRITE_FAILED');
  }
  function register(role: 'main' | 'overlay', channel: string, handler: (input: unknown) => unknown, perSecond = 10, burst = 6) {
    const limit = createLyricsRateLimit(perSecond, burst);
    limits.push(limit);
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (disposed || quitting) return failure('DISPOSED');
      if (role === 'main') attachMainWindow();
      const window = role === 'main' ? options.getMainWindow() : overlay;
      if (!isTrustedLyricsSender(event, window?.webContents, role === 'main' ? options.mainDocumentUrl : overlayUrl)) return failure('DENIED');
      if (!limit.take()) return failure('RATE_LIMITED');
      if (args.length > 1) return failure('INVALID');
      return handler(args[0]);
    });
    registered.push(channel);
  }
  register('main', channels.mainState, input => input === undefined ? success(getState()) : failure('INVALID'));
  register('overlay', channels.overlayState, input => input === undefined ? success(getState()) : failure('INVALID'));
  register('main', channels.publish, input => {
    const result = timeline.accept(input);
    if (!result.ok) return failure(result.code as DesktopLyricsErrorCode);
    broadcast();
    return success(undefined);
  }, 30, 12);
  register('main', channels.mainPreferences, input => updatePreferences(input as DesktopLyricsMainPatch));
  register('overlay', channels.overlayPreferences, input => {
    const patch = validateLyricsPreferencePatch(input, 'overlay');
    return patch ? updatePreferences(patch) : failure('INVALID');
  });
  register('overlay', channels.overlayHide, input => input === undefined ? updatePreferences({ visible: false }) : failure('INVALID'));

  function dispose(): Promise<void> {
    if (disposal) return disposal;
    const flushMove = moveTimer !== undefined;
    clearTimeout(moveTimer);
    moveTimer = undefined;
    if (flushMove) reflow();
    disposed = true;
    app.removeListener('before-quit', onBeforeQuit);
    screen.removeListener('display-added', onDisplayChange);
    screen.removeListener('display-removed', onDisplayChange);
    screen.removeListener('display-metrics-changed', onDisplayChange);
    detachMain();
    attachedMain = null;
    timeline.reset();
    for (const channel of registered) ipcMain.removeHandler(channel);
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    overlay = null;
    for (const cleanup of securityCleanup) cleanup();
    if (flushMove) void persist();
    disposal = Promise.resolve(writing).then(() => undefined);
    return disposal;
  }
  const controller: DesktopLyricsController = {
    getState, updatePreferences, attachMainWindow, reset, dispose,
    setVisible: visible => updatePreferences({ visible }),
    setLocked: locked => updatePreferences({ locked }),
  };
  attachMainWindow();
  if (preferences.visible) {
    try {
      const window = await ensureWindow();
      // Restoring visibility must honor Hide and lifecycle changes made during load.
      if (!disposed && !quitting && preferences.visible && !window.isDestroyed()) window.showInactive();
    } catch { /* state/onNotice honestly reports this */ }
  }
  return controller;
}
