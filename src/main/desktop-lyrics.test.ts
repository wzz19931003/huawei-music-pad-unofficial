import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as electron from 'electron';
import { desktopLyricsChannels as channels } from '../shared/desktop-lyrics';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  const windows: any[] = [];
  const handlers = new Map<string, (...args: any[]) => any>();
  const sessions: any[] = [];
  class Contents extends EventEmitter {
    url = ''; dead = false;
    mainFrame = { url: '', parent: null, detached: false };
    send = vi.fn();
    getURL() { return this.url; }
    isDestroyed() { return this.dead; }
    setWindowOpenHandler = vi.fn();
    setVisualZoomLevelLimits = vi.fn(async () => undefined);
  }
  class Window extends EventEmitter {
    webContents = new Contents();
    shown = false; dead = false; bounds: any;
    constructor(public options: any) { super(); this.bounds = { x: 0, y: 0, ...options }; windows.push(this); }
    async loadURL(url: string) { this.webContents.url = url; this.webContents.mainFrame.url = url; this.webContents.emit('did-finish-load'); this.emit('ready-to-show'); }
    isDestroyed() { return this.dead; }
    isVisible() { return this.shown; }
    showInactive = vi.fn(() => { this.shown = true; });
    hide = vi.fn(() => { this.shown = false; });
    setIgnoreMouseEvents = vi.fn();
    setMovable = vi.fn();
    setFocusable = vi.fn();
    setAlwaysOnTop = vi.fn();
    getBounds() { const { x, y, width, height } = this.bounds; return { x, y, width, height }; }
    setBounds = vi.fn((bounds: any) => { this.bounds = bounds; this.emit('move'); });
    destroy() { this.dead = true; this.emit('closed'); }
    close() { let prevented = false; this.emit('close', { preventDefault() { prevented = true; } }); if (!prevented) this.destroy(); }
  }
  const screen = Object.assign(new EventEmitter(), {
    getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    getPrimaryDisplay: () => ({ id: 1 }),
  });
  const session = { fromPartition: vi.fn(() => {
    const value = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() },
    });
    sessions.push(value); return value;
  }) };
  return { app: new EventEmitter(), BrowserWindow: Window, ipcMain: { handle: vi.fn((name, handler) => handlers.set(name, handler)), removeHandler: vi.fn(name => handlers.delete(name)) },
    screen, session, __test: { windows, handlers, sessions, Contents } };
});

const native = (electron as any).__test;
let controller: any;
let main: any;
let written: any[];
const getController = async (extra = {}) => {
  const name = './' + 'desktop-lyrics.ts';
  const mod = await import(/* @vite-ignore */ name).catch(() => ({}));
  expect(mod.createDesktopLyricsController, 'missing native controller').toBeTypeOf('function');
  return mod.createDesktopLyricsController({
    getMainWindow: () => main, mainDocumentUrl: 'file:///C:/app/index.html',
    entry: { htmlPath: 'C:/app/desktop-lyrics.html', preloadPath: 'C:/app/desktop-lyrics.cjs' },
    hasRecovery: () => true,
    storage: { read: async () => null, write: async (prefs: unknown) => { written.push(prefs); } }, ...extra,
  });
};
const eventFor = (contents: any) => ({ sender: contents, senderFrame: contents.mainFrame });
const call = (channel: string, contents: any, input?: unknown) => native.handlers.get(channel)(eventFor(contents), input);
const publish = (epoch: number, extra = {}) => ({ epoch, generation: 7, sequence: 1, track: { key: 'audio-7', title: '歌曲', artist: '歌手' },
  clock: { positionMs: 1200, playing: true, rate: 1 }, current: { timeMs: 1000, text: '歌词' }, next: null, ...extra });

beforeEach(() => {
  native.windows.length = 0; native.sessions.length = 0; native.handlers.clear(); written = [];
  const contents = new native.Contents(); contents.url = 'file:///C:/app/index.html'; contents.mainFrame.url = contents.url;
  main = { webContents: contents, isDestroyed: () => false };
});
afterEach(async () => { if (controller) await controller.dispose(); controller = undefined; vi.useRealTimers(); });

describe('desktop lyrics native capability boundary', () => {
  it('shows an ordinary sandboxed transparent topmost local window without stealing focus, then relays a bounded real clock', async () => {
    controller = await getController();
    const initial = controller.getState();
    expect(initial.shown).toBe(false);
    expect((await controller.setVisible(true)).ok).toBe(true);
    const window = native.windows[0];
    expect(window.options).toMatchObject({ transparent: true, frame: false, alwaysOnTop: true, show: false, skipTaskbar: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
    expect(window.showInactive).toHaveBeenCalled();
    expect(window.webContents.url).toBe('file:///C:/app/desktop-lyrics.html');
    const reply = await call(channels.publish, main.webContents, publish(initial.snapshot.epoch));
    expect(reply.ok).toBe(true);
    expect(controller.getState().snapshot.track.title).toBe('歌曲');
    expect(window.webContents.send).toHaveBeenLastCalledWith(channels.stateChanged, expect.objectContaining({ snapshot: expect.objectContaining({ current: { timeMs: 1000, text: '歌词' } }) }));
    expect(written.at(-1)).toMatchObject({ version: 1, visible: true });
    expect(written.at(-1)).not.toHaveProperty('snapshot');
  });

  it('denies navigation, popups, downloads, permissions and arbitrary network/file loads in a dedicated memory session', async () => {
    controller = await getController();
    await controller.setVisible(true);
    const window = native.windows[0];
    const isolated = native.sessions[0];
    expect(electron.session.fromPartition).toHaveBeenLastCalledWith(expect.stringMatching(/^desktop-lyrics-/), { cache: false });
    expect(isolated.setPermissionCheckHandler).toHaveBeenCalled();
    const checked = isolated.setPermissionCheckHandler.mock.calls[0][0];
    expect(checked()).toBe(false);
    const permission = vi.fn();
    isolated.setPermissionRequestHandler.mock.calls[0][0](window.webContents, 'media', permission);
    expect(permission).toHaveBeenCalledWith(false);
    expect(isolated.setDevicePermissionHandler.mock.calls[0][0]()).toBe(false);
    const streams = vi.fn(); isolated.setDisplayMediaRequestHandler.mock.calls[0][0]({}, streams);
    expect(streams).toHaveBeenCalledWith({});
    for (const type of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
      const event = { preventDefault: vi.fn() }; window.webContents.emit(type, event);
      expect(event.preventDefault, type).toHaveBeenCalled();
    }
    expect(window.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: 'deny' });
    const download = { preventDefault: vi.fn() }; isolated.emit('will-download', download);
    expect(download.preventDefault).toHaveBeenCalled();
    const request = isolated.webRequest.onBeforeRequest.mock.calls[0][0];
    const done = vi.fn(); request({ url: 'https://invalid.test/song', resourceType: 'xhr' }, done);
    expect(done).toHaveBeenCalledWith({ cancel: true });
    const local = vi.fn(); request({ url: 'file:///C:/app/assets/lyrics.js', resourceType: 'script' }, local);
    expect(local).toHaveBeenCalledWith({ cancel: false });
  });

  it('separates primary publication from overlay settings and resets on reload/crash/replacement without widening existing IPC', async () => {
    controller = await getController();
    await controller.setVisible(true);
    const overlay = native.windows[0].webContents;
    let epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, overlay, publish(epoch))).error.code).toBe('DENIED');
    expect((await call(channels.overlayPreferences, main.webContents, { fontSize: 40 })).error.code).toBe('DENIED');
    const iframe = { sender: main.webContents, senderFrame: { ...main.webContents.mainFrame, parent: main.webContents.mainFrame } };
    expect((await native.handlers.get(channels.publish)(iframe, publish(epoch))).error.code).toBe('DENIED');
    expect((await call(channels.publish, main.webContents, publish(epoch))).ok).toBe(true);
    main.webContents.emit('did-start-navigation', {}, 'file:///C:/app/index.html', false, true);
    expect(controller.getState().snapshot.track, 'reload must clear previous lyrics').toBeNull();
    epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, main.webContents, publish(epoch, { generation: 0 }))).ok).toBe(true);
    expect((await call(channels.publish, main.webContents, publish(epoch - 1, { generation: 99 }))).error.code).toBe('STALE');
    main.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(controller.getState().snapshot.anchor).toBeNull();
    const old = main.webContents;
    const fresh = new native.Contents(); fresh.url = old.url; fresh.mainFrame.url = old.url;
    main = { webContents: fresh, isDestroyed: () => false };
    controller.attachMainWindow();
    expect(old.listenerCount('render-process-gone')).toBe(0);
    epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, fresh, publish(epoch, { generation: 0 }))).ok).toBe(true);
    const untouched = vi.fn(); native.handlers.set('app:unrelated', untouched);
    await controller.dispose();
    expect(controller.getState().snapshot.track).toBeNull();
    expect(native.handlers.get('app:unrelated')).toBe(untouched);
    expect(native.handlers.has(channels.publish)).toBe(false);
    expect(fresh.listenerCount('render-process-gone')).toBe(0);
  });

  it('accepts generation-zero clear after reload completion even when the old document republished the navigation epoch', async () => {
    controller = await getController();
    await controller.setVisible(true);
    const contents = main.webContents;
    const overlay = native.windows[0].webContents;
    const initialEpoch = controller.getState().snapshot.epoch;
    const source = {
      sequence: 0,
      current: { timeMs: 1000, text: '歌词', segments: [{ timeMs: 1000, text: '歌' }, { timeMs: 1100, text: '词' }] },
      next: { timeMs: 2000, text: '下一行', segments: [{ timeMs: 2000, text: '下一行' }] },
    };
    expect(await call(channels.publish, contents, publish(initialEpoch, source))).toEqual({ ok: true, data: undefined });

    contents.emit('did-start-navigation', {}, contents.url, false, true);
    const [navigationChannel, navigationState] = contents.send.mock.calls.at(-1);
    expect(navigationChannel).toBe(channels.stateChanged);
    const navigationEpoch = navigationState.snapshot.epoch;
    expect(navigationEpoch).toBeGreaterThan(initialEpoch);
    expect(navigationState.snapshot).toMatchObject({ track: null, anchor: null, current: null, next: null });
    // The still-live old document consumes the broadcast and republishes its real high generation.
    expect(await call(channels.publish, contents, publish(navigationEpoch, source))).toEqual({ ok: true, data: undefined });
    const poisoned = controller.getState().snapshot;
    expect(poisoned).toMatchObject({ epoch: navigationEpoch, generation: 7, track: { key: 'audio-7' },
      anchor: { positionMs: 1200, playing: true, rate: 1 }, current: source.current, next: source.next });
    const clear = { generation: 0, sequence: 0, track: null, clock: null, current: null, next: null };
    expect(await call(channels.publish, contents, { epoch: navigationEpoch, ...clear })).toMatchObject({
      ok: false, error: { code: 'STALE' },
    });
    expect(controller.getState().snapshot).toEqual(poisoned);

    contents.emit('did-finish-load');
    const [readyChannel, readyState] = contents.send.mock.calls.at(-1);
    expect(readyChannel).toBe(channels.stateChanged);
    const readyEpoch = readyState.snapshot.epoch;
    expect(await call(channels.publish, contents, { epoch: readyEpoch, ...clear }),
      'the completed main document must not inherit the old publisher generation').toEqual({ ok: true, data: undefined });
    expect(readyEpoch).toBeGreaterThan(navigationEpoch);
    const empty = { epoch: readyEpoch, generation: 0, track: null, anchor: null, current: null, next: null };
    expect(controller.getState().snapshot).toEqual(empty);
    expect(overlay.send).toHaveBeenLastCalledWith(channels.stateChanged, expect.objectContaining({ snapshot: empty }));
    for (const epoch of [initialEpoch, navigationEpoch]) {
      expect(await call(channels.publish, contents, publish(epoch, { ...source, sequence: 99 }))).toMatchObject({
        ok: false, error: { code: 'STALE' },
      });
      expect(controller.getState().snapshot).toEqual(empty);
    }
  });

  it.each(['same-document', 'subframe'])('keeps the publication epoch and ordering through %s navigation', async boundary => {
    controller = await getController();
    const contents = main.webContents;
    const epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, contents, publish(epoch))).ok).toBe(true);
    const before = controller.getState().snapshot;
    const sameDocument = boundary === 'same-document';
    contents.emit('did-start-navigation', {}, contents.url, sameDocument, sameDocument);
    if (sameDocument) contents.emit('did-navigate-in-page', {}, contents.url, true);
    else contents.emit('did-frame-finish-load', {}, false, 1, 2);
    expect(controller.getState().snapshot).toEqual(before);
    expect((await call(channels.publish, contents, publish(epoch, { sequence: 2 }))).ok).toBe(true);
    const continued = controller.getState().snapshot;
    expect(await call(channels.publish, contents, publish(epoch, { generation: 0, sequence: 3 }))).toMatchObject({
      ok: false, error: { code: 'STALE' },
    });
    expect(controller.getState().snapshot).toEqual(continued);
  });

  it('detaches primary lifecycle listeners on replacement and disposal without duplicate attachment', async () => {
    controller = await getController();
    const old = main.webContents;
    const events = ['did-start-navigation', 'did-finish-load', 'render-process-gone', 'destroyed'];
    controller.attachMainWindow();
    controller.attachMainWindow();
    for (const event of events) expect(old.listenerCount(event), event).toBe(1);

    const fresh = new native.Contents(); fresh.url = old.url; fresh.mainFrame.url = old.url;
    main = { webContents: fresh, isDestroyed: () => false };
    controller.attachMainWindow();
    const epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, fresh, publish(epoch, { generation: 0 }))).ok).toBe(true);
    const active = controller.getState().snapshot;
    for (const event of events) {
      expect(old.listenerCount(event), `replaced ${event}`).toBe(0);
      expect(fresh.listenerCount(event), `current ${event}`).toBe(1);
    }
    old.emit('did-finish-load');
    old.emit('did-start-navigation', {}, old.url, false, true);
    old.emit('render-process-gone', {}, { reason: 'crashed' });
    old.emit('destroyed');
    expect(controller.getState().snapshot).toEqual(active);
    expect(await call(channels.publish, old, publish(epoch))).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(controller.getState().snapshot).toEqual(active);

    fresh.emit('did-finish-load');
    const ready = controller.getState().snapshot;
    expect(ready.epoch).toBeGreaterThan(epoch);
    expect(ready).toMatchObject({ generation: null, track: null, anchor: null, current: null, next: null });
    expect((await call(channels.publish, fresh, publish(ready.epoch, { generation: 0 }))).ok).toBe(true);
    await controller.dispose();
    const disposed = controller.getState().snapshot;
    for (const event of events) expect(fresh.listenerCount(event), `disposed ${event}`).toBe(0);
    fresh.emit('did-finish-load');
    fresh.emit('did-start-navigation', {}, fresh.url, false, true);
    fresh.emit('render-process-gone', {}, { reason: 'crashed' });
    fresh.emit('destroyed');
    expect(controller.getState().snapshot).toEqual(disposed);
    expect(native.handlers.has(channels.publish)).toBe(false);
  });

  it('locks native input only with a real recovery route; tray unlock restores drag/focus and close hides instead of trapping quit', async () => {
    let recovery = false;
    controller = await getController({ hasRecovery: () => recovery });
    await controller.setVisible(true);
    const window = native.windows[0];
    expect(controller.setLocked).toBeTypeOf('function');
    expect((await controller.setLocked(true)).error.code).toBe('DENIED');
    expect(controller.getState().preferences.locked).toBe(false);
    recovery = true;
    expect((await controller.setLocked(true)).ok).toBe(true);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
    expect(window.setMovable).toHaveBeenLastCalledWith(false);
    expect(window.setFocusable).toHaveBeenLastCalledWith(false);
    expect((await controller.setLocked(false)).ok).toBe(true);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
    expect(window.setMovable).toHaveBeenLastCalledWith(true);
    expect(window.setFocusable).toHaveBeenLastCalledWith(true);
    expect(window.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'floating');
    await controller.setLocked(true); recovery = false; controller.reset();
    expect(controller.getState().preferences.locked, 'loss of every recovery route fails open to an interactive overlay').toBe(false);
    window.close();
    await vi.waitFor(() => expect(written.at(-1)?.visible).toBe(false));
    expect(window.dead).toBe(false);
    expect(window.shown).toBe(false);
    await controller.dispose();
    expect(window.dead).toBe(true);
  });

  it('restores only sanitized preferences and clamps native drag/display-removal positions before persisting', async () => {
    vi.useFakeTimers();
    const displays = [{ id: 1, workArea: { x: 0, y: 0, width: 1000, height: 700 } }];
    const originalDisplays = electron.screen.getAllDisplays;
    vi.spyOn(electron.screen, 'getAllDisplays').mockImplementation(() => displays as any);
    try {
      controller = await getController({ storage: { read: async () => ({ version: 1, position: { x: 99000, y: -9000 }, fontSize: 40, token: 'must-drop' }),
        write: async (prefs: unknown) => { written.push(prefs); } } });
      await controller.setVisible(true);
      const window = native.windows[0];
      expect(window.getBounds().x).toBe(100);
      expect(window.getBounds().y).toBe(0);
      window.bounds = { ...window.getBounds(), x: -900, y: 800 };
      window.emit('move');
      await vi.advanceTimersByTimeAsync(250);
      expect(window.getBounds().x).toBe(0);
      expect(window.getBounds().y + window.getBounds().height).toBeLessThanOrEqual(700);
      expect(written.at(-1)).not.toHaveProperty('token');
      expect(written.at(-1).position).toEqual({ x: window.bounds.x, y: window.bounds.y });
      displays[0].workArea = { x: 100, y: 50, width: 640, height: 480 };
      electron.screen.emit('display-removed', {}, { id: 2 } as any);
      await vi.advanceTimersByTimeAsync(250);
      expect(window.bounds.x).toBe(100);
      expect(window.bounds.width).toBe(640);
      await controller.dispose();
      expect(electron.screen.listenerCount('display-removed')).toBe(0);
    } finally { vi.mocked(electron.screen.getAllDisplays).mockRestore(); expect(electron.screen.getAllDisplays).toBe(originalDisplays); }
  });

  it('reports failed/stalled saves honestly without leaking exceptions or overlapping a timed-out store write', async () => {
    vi.useFakeTimers();
    const notices: any[] = [];
    let finish!: () => void;
    const stalled = new Promise<void>(resolve => { finish = resolve; });
    const write = vi.fn(() => stalled);
    controller = await getController({ storage: { read: () => { throw new Error('private-path-and-token'); }, write }, onNotice: (notice: unknown) => notices.push(notice) });
    expect(controller.getState().notice.code).toBe('PERSISTENCE_READ_FAILED');
    expect(write).not.toHaveBeenCalled();
    let reply: any;
    const pending = controller.setVisible(true).then((result: unknown) => { reply = result; });
    try {
      await vi.advanceTimersByTimeAsync(3100);
      expect(reply, 'a stalled save must settle visibly instead of freezing controls forever').toMatchObject({ ok: false, error: { code: 'PERSISTENCE_WRITE_FAILED' } });
      expect(controller.getState().shown).toBe(true);
      expect(controller.getState().persistence).toBe('error');
      expect(JSON.stringify(notices)).not.toContain('private-path-and-token');
      const retry = await controller.setLocked(false);
      expect(retry.ok).toBe(false);
      expect(write).toHaveBeenCalledTimes(1);
    } finally { finish(); await pending; }
  });

  it('honors a trusted Hide while restored-visible initialization is still loading', async () => {
    const prototype = electron.BrowserWindow.prototype as any;
    const original = prototype.loadURL;
    let finish!: () => void;
    let started!: () => void;
    const initialLoad = new Promise<void>(resolve => { finish = resolve; });
    const loadStarted = new Promise<void>(resolve => { started = resolve; });
    const spy = vi.spyOn(prototype, 'loadURL').mockImplementationOnce(async function(this: any, url: unknown) {
      started();
      await initialLoad;
      await original.call(this, url);
    });
    const initializing = getController({ storage: {
      read: async () => ({ version: 1, visible: true }),
      write: async (prefs: unknown) => { written.push(prefs); },
    } });
    try {
      await loadStarted;
      const window = native.windows[0];
      expect(window.showInactive).not.toHaveBeenCalled();
      expect(await call(channels.mainPreferences, main.webContents, { visible: false })).toMatchObject({
        ok: true, data: { preferences: { visible: false }, shown: false, persistence: 'saved' },
      });
      expect(written.at(-1)).toMatchObject({ version: 1, visible: false });
      finish();
      controller = await initializing;
      const state = controller.getState();
      expect({ desiredVisible: state.preferences.visible, shown: state.shown }).toEqual({ desiredVisible: false, shown: false });
      expect(window.showInactive, 'initial restoration must not override the later registered Hide').not.toHaveBeenCalled();
    } finally {
      finish();
      try { controller = await initializing; } finally { spy.mockRestore(); }
    }
  });

  it('does not call showInactive after before-quit during restored-visible initialization', async () => {
    const prototype = electron.BrowserWindow.prototype as any;
    const original = prototype.loadURL;
    let finish!: () => void;
    let started!: () => void;
    const initialLoad = new Promise<void>(resolve => { finish = resolve; });
    const loadStarted = new Promise<void>(resolve => { started = resolve; });
    const spy = vi.spyOn(prototype, 'loadURL').mockImplementationOnce(async function(this: any, url: unknown) {
      started();
      await initialLoad;
      await original.call(this, url);
    });
    const initializing = getController({ storage: {
      read: async () => ({ version: 1, visible: true }),
      write: async (prefs: unknown) => { written.push(prefs); },
    } });
    try {
      await loadStarted;
      const window = native.windows[0];
      expect(window.showInactive).not.toHaveBeenCalled();
      electron.app.emit('before-quit', {} as any);
      expect(await call(channels.mainPreferences, main.webContents, { visible: false })).toMatchObject({
        ok: false, error: { code: 'DISPOSED' },
      });
      expect(window.isDestroyed()).toBe(false);
      finish();
      controller = await initializing;
      expect(window.showInactive, 'the startup source path must not issue a late show during quit').not.toHaveBeenCalled();
      expect(controller.getState()).toMatchObject({ preferences: { visible: true }, shown: false });
      expect(written).toHaveLength(0);
    } finally {
      finish();
      try { controller = await initializing; } finally { spy.mockRestore(); }
    }
  });

  it('does not resurrect a hidden/disposed overlay when an earlier asynchronous load finally completes', async () => {
    const prototype = electron.BrowserWindow.prototype as any;
    const original = prototype.loadURL;
    let finish = () => {};
    const spy = vi.spyOn(prototype, 'loadURL').mockImplementation(function(this: any, url: unknown) {
      return new Promise<void>(resolve => { finish = () => { void original.call(this, url).then(resolve); }; });
    });
    try {
      controller = await getController();
      const opening = controller.setVisible(true);
      await controller.setVisible(false);
      finish(); await opening;
      expect(controller.getState().preferences.visible).toBe(false);
      expect(controller.getState().shown, 'late load cannot override a newer Hide').toBe(false);
      await controller.dispose();
      controller = await getController();
      const late = controller.setVisible(true);
      await controller.dispose();
      finish();
      expect(await late).toMatchObject({ ok: false, error: { code: 'DISPOSED' } });
      expect(native.windows.at(-1).shown).toBe(false);
      controller = await getController();
      const quittingLoad = controller.setVisible(true);
      electron.app.emit('before-quit', {} as any);
      finish();
      expect(await quittingLoad).toMatchObject({ ok: false, error: { code: 'DISPOSED' } });
      expect(native.windows.at(-1).shown, 'a late load cannot show a new overlay during application quit').toBe(false);
    } finally { finish(); spy.mockRestore(); }
  });

  it('honestly hides/destroys a crashed or off-document overlay and permits main/tray recovery with session cleanup', async () => {
    controller = await getController();
    await controller.setVisible(true);
    const first = native.windows[0];
    first.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(first.dead, 'do not reuse a crashed WebContents as a healthy overlay').toBe(true);
    expect(controller.getState().shown).toBe(false);
    expect(controller.getState().preferences.visible).toBe(true);
    expect(controller.getState().notice.code).toBe('WINDOW_FAILED');
    expect(native.sessions[0].webRequest.onBeforeRequest).toHaveBeenLastCalledWith(null);
    expect((await controller.setVisible(true)).ok).toBe(true);
    const recovered = native.windows[1];
    expect(controller.getState().notice).toBeNull();
    recovered.webContents.emit('did-navigate-in-page', {}, 'file:///C:/app/desktop-lyrics.html#untrusted', true);
    expect(recovered.dead).toBe(true);
    expect(controller.getState().preferences.visible).toBe(false);
    await vi.waitFor(() => expect(written.at(-1)?.visible).toBe(false));
  });

  it('never vetoes application quit, while ordinary overlay Close still means Hide', async () => {
    controller = await getController();
    await controller.setVisible(true);
    const window = native.windows[0];
    electron.app.emit('before-quit', {} as any);
    window.close();
    expect(window.dead, 'application quit must not be cancelled by the overlay close-to-hide handler').toBe(true);
    expect(controller.getState().snapshot.track).toBeNull();
    await controller.dispose();
    expect(electron.app.listenerCount('before-quit')).toBe(0);
  });

  it('flushes the last validated drag position on dispose and every concurrent dispose caller waits for the same save', async () => {
    let delay = false;
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    controller = await getController({ storage: { read: () => null, write: async (prefs: unknown) => { written.push(prefs); if (delay) await pending; } } });
    await controller.setVisible(true);
    const window = native.windows[0];
    window.bounds = { ...window.getBounds(), x: 100, y: 150 };
    window.emit('move');
    delay = true;
    let secondDone = false;
    const first = controller.dispose();
    const second = controller.dispose().then(() => { secondDone = true; });
    try {
      await Promise.resolve(); await Promise.resolve();
      expect(written.at(-1).position, 'quit inside the drag debounce still saves the real last position').toEqual({ x: 100, y: 150 });
      expect(secondDone).toBe(false);
    } finally { finish(); await Promise.all([first, second]); }
  });

  it('coalesces concurrent opening/settings while a trusted local document is still loading', async () => {
    const prototype = electron.BrowserWindow.prototype as any;
    const original = prototype.loadURL;
    let finish = () => {};
    const spy = vi.spyOn(prototype, 'loadURL').mockImplementation(function(this: any, url: unknown) {
      return new Promise<void>(resolve => { finish = () => { void original.call(this, url).then(resolve); }; });
    });
    controller = await getController();
    const opening = controller.setVisible(true);
    const settings = controller.updatePreferences({ fontSize: 36 });
    try {
      await Promise.resolve(); await Promise.resolve();
      expect(native.windows).toHaveLength(1);
      expect(native.windows[0].shown, 'no blank half-loaded overlay flash').toBe(false);
    } finally { finish(); await Promise.all([opening, settings]); spy.mockRestore(); }
    expect(native.windows[0].shown).toBe(true);
    expect(controller.getState().preferences.fontSize).toBe(36);
  });

  it('bounds malformed publications/rates and refuses every IPC capability once application quit has started', async () => {
    vi.useFakeTimers();
    controller = await getController();
    await controller.setVisible(true);
    let epoch = controller.getState().snapshot.epoch;
    const invalid = publish(epoch, { current: { timeMs: 0, text: 'x'.repeat(2049) } });
    expect((await call(channels.publish, main.webContents, invalid)).error.code).toBe('INVALID');
    expect(controller.getState().snapshot.track).toBeNull();
    expect((await call(channels.overlayPreferences, native.windows[0].webContents, { visible: false })).error.code).toBe('INVALID');
    const replies = [];
    for (let sequence = 1; sequence <= 20; sequence++) replies.push(await call(channels.publish, main.webContents, publish(epoch, { sequence })));
    expect(replies.filter(reply => reply.ok)).toHaveLength(11);
    expect(replies.at(-1).error.code).toBe('RATE_LIMITED');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await call(channels.publish, main.webContents, publish(epoch, { sequence: 30 }))).ok).toBe(true);
    electron.app.emit('before-quit', {} as any);
    epoch = controller.getState().snapshot.epoch;
    expect((await call(channels.publish, main.webContents, publish(epoch, { generation: 0 }))).error?.code).toBe('DISPOSED');
    expect(controller.getState().snapshot.track).toBeNull();
  });
});
