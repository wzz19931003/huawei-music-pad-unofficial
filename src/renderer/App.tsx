import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Copy, Mail, Minus, Search, Square, X } from './PadIcons';
import type { AppSettings, AuthStatus, LyricsCacheInfo, Playlist, Track, UpdateState } from '../shared/types';
import { api } from './lib/api';
import { usePlayer } from './lib/player';
import { FavoritesScreen, LoginScreen } from './screens';
import { PlaylistScreen, PlaylistsScreen, SearchScreen, SettingsScreen } from './pages';
import { PadPlayer } from './PadPlayer';
import { UpdatePanel, AboutScreen } from './UpdatePanel';
import { PadNavigation, type PadTab } from './PadNavigation';
import { activePadTab } from './pad-navigation.mjs';
import { PadHomeScreen, PadHallScreen, PadCafeScreen, PadMineScreen, type PadScreenProps } from './PadScreens';
import { TrackRow } from './ui';
import { QueuePanel, TrackMenu, type MenuTarget } from './QueuePanel';
import logo from './assets/app-icon.png';

type Route =
  | { name: 'home' | 'hall' | 'cafe' | 'mine' | 'history' | 'favorites' | 'playlists' | 'settings' | 'updates' | 'about' }
  | { name: 'playlist'; playlist: Playlist }
  | { name: 'search'; query: string };

function WindowControls({ maximized }: { maximized: boolean }) {
  return (
    <div className="window-controls">
      <button type="button" className="window-button" onClick={() => void api.window.minimize()} aria-label="最小化" title="最小化">
        <Minus size={15} />
      </button>
      <button
        type="button"
        className="window-button"
        onClick={() => void api.window.toggleMaximize()}
        aria-label={maximized ? '还原' : '最大化'}
        title={maximized ? '还原' : '最大化'}
      >
        {maximized ? <Copy size={13} /> : <Square size={12} />}
      </button>
      <button type="button" className="window-button is-close" onClick={() => void api.window.close()} aria-label="关闭" title="关闭">
        <X size={16} />
      </button>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [searchQuery, setSearchQuery] = useState('');
  const [favFilter, setFavFilter] = useState('');
  const [maximized, setMaximized] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | undefined>(undefined);

  const [favorites, setFavorites] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [total, setTotal] = useState(0);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle', currentVersion: __APP_VERSION__, message: '尚未检查更新' });
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [updateActionBusy, setUpdateActionBusy] = useState(false);
  const updateActionBusyRef = useRef(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [lyricsCache, setLyricsCache] = useState<LyricsCacheInfo | null>(null);
  const [quality, setQuality] = useState<AppSettings['quality']>('lossless');
  const [volume, setVolume] = useState(0.8);

  const toastTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const mainRef = useRef<HTMLElement | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  const player = usePlayer({
    quality,
    volume,
    accountKey: auth?.authenticated ? `ui-session-${accountEpoch}` : null,
    onError: showToast,
    onVolumeCommit: next => {
      setVolume(next);
      void api.updateSettings({ volume: next }).catch(() => undefined);
    },
    // Modern enum preserves heart; legacy fields remain interoperable.
    onPreferencesChange: next => {
      void api
        .updateSettings({
          playMode: next,
          repeatMode: next === 'one' ? 'one' : next === 'shuffle' ? 'off' : 'all',
          shuffle: next === 'shuffle',
        })
        .catch(() => showToast('播放模式设置未能保存，重启后可能恢复旧模式。'));
    },
  });

  useEffect(() => {
    let mounted = true;
    const unsubscribe = api.updates.onState(state => { if (mounted) setUpdateState(state); });
    void api.updates.state().then(state => { if (mounted) setUpdateState(state); }).catch(() => {
      if (mounted) setUpdateActionError('更新模块未就绪，请使用完整安装包。');
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const playerRef = useRef(player);
  playerRef.current = player;

  const play = useCallback(
    (tracks: Track[], index: number) => {
      player.playFrom(tracks, index);
      setPlayerOpen(true);
    },
    [player],
  );

  /** 右键菜单：立即播放（已在队列里就直接跳过去）。 */
  const handleMenuPlay = useCallback((track: Track) => {
    const latest = playerRef.current;
    if (latest.queue.length === 0) {
      latest.playFrom([track], 0);
    } else {
      const at = latest.queue.findIndex(item => item.id === track.id);
      if (at >= 0) {
        latest.jumpTo(at);
      } else {
        latest.enqueueNext([track]);
        latest.jumpTo(latest.index + 1);
      }
    }
    setPlayerOpen(true);
  }, []);

  const handlePlayNext = useCallback(
    (track: Track) => {
      playerRef.current.enqueueNext([track]);
      showToast(`「${track.title}」下一首播放`);
    },
    [showToast],
  );

  const handleAddToQueue = useCallback(
    (track: Track) => {
      playerRef.current.enqueueLast([track]);
      showToast(`「${track.title}」已添加到播放队列`);
    },
    [showToast],
  );

  const handleTrackMenu = useCallback((track: Track, event: React.MouseEvent) => {
    setMenu({ track, x: event.clientX, y: event.clientY });
  }, []);

  // 启动：读登录态、设置；已登录就直接拉资料库。
  useEffect(() => {
    void (async () => {
      const status = await api.authStatus();
      if (status?.ok) setAuth(status.data);

      const loaded = await api.settings().catch(() => null);
      if (loaded) {
        setSettings(loaded);
        setQuality(loaded.quality);
        setVolume(loaded.volume);
      }
      setBooting(false);
    })();
  }, []);

  // 无边框窗口：跟踪最大化状态，双击标题栏也能同步图标。
  useEffect(() => {
    void api.window.isMaximized().then(setMaximized).catch(() => undefined);
    return api.window.onMaximized(setMaximized);
  }, []);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const [favs, hist] = await Promise.all([
        api.favorites().catch(error => {
          setLibraryError(error instanceof Error ? error.message : String(error));
          return { tracks: [] as Track[], total: 0 };
        }),
        api.history().catch(() => [] as Track[]),
      ]);
      setFavorites(favs.tracks);
      setTotal(favs.total);
      setHistory(hist);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth?.authenticated) void loadLibrary();
    else {
      setFavorites([]);
      setHistory([]);
      setTotal(0);
    }
  }, [auth?.authenticated, loadLibrary]);

  // 歌单列表：登录后拉一次，失败不阻塞主界面。
  useEffect(() => {
    if (!auth?.authenticated) {
      setPlaylists([]);
      return;
    }
    setPlaylistsLoading(true);
    api
      .playlists()
      .then(setPlaylists)
      .catch(() => undefined)
      .finally(() => setPlaylistsLoading(false));
  }, [auth?.authenticated]);

  // 搜索：停顿 350ms 再发请求，边打字边跳页面会很吵。
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;
    const timer = window.setTimeout(() => setRoute({ name: 'search', query }), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // 进设置页时才统计歌词缓存。
  useEffect(() => {
    if (route.name !== 'settings') return;
    void api.lyricsCacheInfo().then(setLyricsCache).catch(() => undefined);
  }, [route.name]);

  // 换页回到顶部：从歌单滚到一半切到收藏，不该停在半截。
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route]);

  // 队列持久化：切歌/换队列后延迟落盘，避免频繁写。
  useEffect(() => {
    if (player.queue.length === 0) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void api.saveQueue(player.queue, player.index, player.position);
    }, 1200);
    return () => window.clearTimeout(saveTimer.current);
  }, [player.queue, player.index]);

  // 进阶：正在播时每 10 秒把进度也存一次，重开客户端能接着听。
  useEffect(() => {
    const timer = window.setInterval(() => {
      const latest = playerRef.current;
      if (latest.queue.length === 0 || latest.index < 0) return;
      void api.saveQueue(latest.queue, latest.index, latest.positionCommit.current);
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  // 启动时恢复上次队列（定位到那一首、那个进度，但不自动出声）。
  const restoredRef = useRef(false);
  useEffect(() => {
    if (booting || restoredRef.current) return;
    if (!auth?.authenticated) return;
    restoredRef.current = true;
    void api.loadQueue().then(result => {
      if (!result || !result.ok || !result.data || result.data.tracks.length === 0) return;
      if (playerRef.current.queue.length > 0) return;
      playerRef.current.restore(result.data.tracks, result.data.index, result.data.positionSeconds);
    });
  }, [booting, auth?.authenticated]);

  // 播放模式以落盘的设置为准（条上的模式按钮会写回去）。
  useEffect(() => {
    if (!settings) return;
    playerRef.current.setPreferences(
      settings.playMode ?? (settings.shuffle ? 'shuffle' : settings.repeatMode === 'one' ? 'one' : 'all'),
    );
  }, [settings?.playMode, settings?.repeatMode, settings?.shuffle]);

  // 空格：播放/暂停（输入框里不抢键）；Esc 收播放页。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPlayerOpen(false);
        setQueueOpen(false);
        setMenu(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        if (target?.closest('button, a, [role="button"], [contenteditable="true"]')) return;
        event.preventDefault();
        player.toggle();
      }
      if (event.key === 'Escape') {
        setPlayerOpen(false);
        setQueueOpen(false);
        setMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  const handleLogin = useCallback(async () => {
    playerRef.current.cancelHeart();
    setLoginPending(true);
    setLoginMessage('正在打开华为登录页…');
    const unsubscribe = api.onAuthProgress(message => setLoginMessage(message));
    try {
      const result = await api.login();
      if (result.ok) {
        setAccountEpoch(value => value + 1);
        setAuth(result.data);
        if (result.data.authenticated) showToast('登录成功，正在读取你的收藏。');
      } else {
        showToast(result.error.message);
      }
    } catch {
      showToast('登录流程没有完成，请重试。');
    } finally {
      unsubscribe();
      setLoginPending(false);
      setLoginMessage(undefined);
    }
  }, [showToast]);

  const handleCancelLogin = useCallback(async () => {
    await api.cancelLogin().catch(() => null);
  }, []);

  const handleLogout = useCallback(async () => {
    // Stop waiting before the logout IPC; a late read cannot replace playback.
    playerRef.current.cancelHeart();
    const result = await api.logout().catch(() => null);
    if (result?.ok) {
      setAuth(null);
      setPlayerOpen(false);
      setRoute({ name: 'home' });
      showToast('已退出登录。');
    } else {
      showToast('退出登录没有成功。');
    }
  }, [showToast]);

  const pendingFavoriteIds = useRef(new Set<string>());
  const handleToggleFavorite = useCallback(async (track: Track) => {
    if (pendingFavoriteIds.current.has(track.id)) return;
    const wasSaved = favorites.some(item => item.id === track.id);
    pendingFavoriteIds.current.add(track.id);
    try {
      const value = await api.setFavorite(track.id, !wasSaved);
      playerRef.current.syncFavorite(track.id, value);
      setFavorites(current => value
        ? current.some(item => item.id === track.id) ? current : [...current, track]
        : current.filter(item => item.id !== track.id));
      if (value !== wasSaved) setTotal(current => Math.max(0, current + (value ? 1 : -1)));
      showToast(value ? '已收藏。' : '已取消收藏。');
    } catch {
      showToast('收藏状态没有更新成功，请稍后再试。');
    } finally {
      pendingFavoriteIds.current.delete(track.id);
    }
  }, [favorites, showToast]);

  const handleUpdateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      try {
        const next = await api.updateSettings(patch);
        setSettings(next);
        if (patch.quality) setQuality(next.quality);
      } catch {
        showToast('设置没有保存成功。');
      }
    },
    [showToast],
  );

  const handleCloseBehavior = useCallback(
    async (value: AppSettings['closeBehavior']) => {
      try {
        setSettings(await api.window.setCloseBehavior(value));
        showToast(value === 'tray' ? '关闭窗口后会收进托盘。' : '关闭窗口就直接退出。');
      } catch {
        showToast('关闭行为没有保存成功。');
      }
    },
    [showToast],
  );

  const handleClearLyrics = useCallback(
    async (local: boolean) => {
      try {
        setLyricsCache(await api.clearLyricsCache(local));
        showToast(local ? '本地导入的歌词已清空。' : '歌词缓存已清空。');
      } catch {
        showToast('清理失败，稍后再试。');
      }
    },
    [showToast],
  );

  const openFavorites = useCallback(() => {
    if (!auth?.authenticated) {
      showToast('先登录才能读取收藏。');
      return;
    }
    setRoute({ name: 'favorites' });
  }, [auth?.authenticated, showToast]);

  const openPlaylist = useCallback((playlist: Playlist) => {
    setRoute({ name: 'playlist', playlist });
  }, []);

  const runUpdateAction = async (action: 'check' | 'download' | 'install') => {
    if (updateActionBusyRef.current) return;
    updateActionBusyRef.current = true;
    setUpdateActionBusy(true);
    setUpdateActionError(null);
    try {
      if (action === 'check') {
        const native = await api.updates.state();
        setUpdateState(native);
        if (['checking', 'downloading', 'downloaded', 'installing'].includes(native.status) ||
          native.status === 'error' && native.errorCode === 'UPDATE_INSTALL_FAILED') return;
      }
      if (action === 'install') {
        const latest = playerRef.current;
        if (latest.queue.length && latest.index >= 0) {
          const saved = await api.saveQueue(latest.queue, latest.index, latest.positionCommit.current);
          if (!saved?.ok) throw new Error('queue save failed');
        }
        if (latest.playing) latest.toggle();
      }
      setUpdateState(await api.updates[action]());
    } catch {
      setUpdateActionError('更新操作未完成，播放进度或更新服务未就绪，请重试。');
      // A failed renderer action cannot revoke a download verified by main.
      await api.updates.state().then(setUpdateState).catch(() => undefined);
    } finally {
      updateActionBusyRef.current = false;
      setUpdateActionBusy(false);
    }
  };
  const openUpdates = () => {
    setSearchQuery(''); setPlayerOpen(false); setQueueOpen(false); setMenu(null);
    setRoute({ name: 'updates' });
    void runUpdateAction('check');
  };
  const openAbout = () => { setSearchQuery(''); setPlayerOpen(false); setRoute({ name: 'about' }); };
  const updateProps = { state: updateState, actionError: updateActionError, busy: updateActionBusy, onCheck: () => void runUpdateAction('check'), onDownload: () => void runUpdateAction('download'), onInstall: () => void runUpdateAction('install') };
  const authenticated = Boolean(auth?.authenticated);
  const displayName = auth?.displayName;

  if (booting) {
    return (
      <div className="boot-screen">
        <img src={logo} alt="" className="boot-logo" />
        <span>正在启动…</span>
      </div>
    );
  }

  const navigatePad = (tab: PadTab) => {
    setSearchQuery('');
    setQueueOpen(false);
    setMenu(null);
    if (tab === 'player') { setPlayerOpen(true); return; }
    setPlayerOpen(false);
    setRoute({ name: tab });
  };
  const titles: Record<string, string> = {
    home: '首页', hall: '音乐厅', cafe: 'café听', mine: '我的', favorites: '我的收藏',
    playlists: '我的歌单', playlist: route.name === 'playlist' ? route.playlist.title : '歌单',
    search: '搜索', settings: '设置', history: '最近播放', updates: '软件更新', about: '关于',
  };
  const secondary = !['home', 'hall', 'cafe', 'mine'].includes(route.name);
  const screenProps: PadScreenProps = {
    authenticated, displayName, favorites, history, playlists, total,
    loading: libraryLoading || playlistsLoading, currentId: player.current?.id, playing: player.playing,
    onPlay: play, onOpenFavorites: openFavorites, onOpenPlaylist: openPlaylist,
    onOpenPlaylists: () => setRoute({ name: 'playlists' }), onSearch: setSearchQuery,
    onOpenSettings: () => setRoute({ name: 'settings' }), onLogin: () => void handleLogin(),
    onCheckUpdates: openUpdates, onOpenAbout: openAbout,
    onNotice: showToast, onOpenHistory: () => setRoute({ name: 'history' }),
    onToggleFavorite: track => void handleToggleFavorite(track), onTrackMenu: handleTrackMenu,
  };

  return (
    <div className={`app pad-app${playerOpen ? ' is-player' : ''}`} data-page={playerOpen ? 'player' : route.name}>
      <header className="titlebar pad-windowbar">
        <span className="pad-unofficial">华为音乐（非官方）<span> / Pad 布局</span></span>
        <WindowControls maximized={maximized} />
      </header>
      <div className="stage pad-stage" inert={playerOpen} aria-hidden={playerOpen || undefined}>
        <div className="pad-page-head">
          <div className="pad-heading">
            {secondary ? <button className="icon-button pad-back" type="button" onClick={() => navigatePad('mine')} aria-label="返回我的"><ChevronLeft size={24} /></button> : null}
            <h1>{titles[route.name]}</h1>
          </div>
          {route.name !== 'mine' ? <label className="titlebar-search pad-search">
            <Search size={20} aria-hidden="true" />
            <input value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
              placeholder="歌曲、歌手，搜索更多音乐" spellCheck={false} aria-label="搜索歌曲" />
            {searchQuery ? <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => { setSearchQuery(''); setRoute({ name: 'home' }); }}><X size={16} /></button> : null}
          </label> : <button type="button" className="icon-button pad-inbox" aria-label="消息" title="消息功能尚未接入" onClick={() => showToast('消息功能尚未接入，请在官方客户端查看。')}><Mail size={26} /></button>}
        </div>
        <main className="main pad-main" ref={mainRef} data-pad-page={route.name}>
          {route.name === 'home' ? <PadHomeScreen {...screenProps} />
          : route.name === 'hall' ? <PadHallScreen {...screenProps} />
          : route.name === 'cafe' ? <PadCafeScreen {...screenProps} />
          : route.name === 'mine' ? <PadMineScreen {...screenProps} />
          : route.name === 'updates' ? <div className="screen"><UpdatePanel {...updateProps} /></div>
          : route.name === 'about' ? <AboutScreen {...updateProps} />
          : !authenticated && route.name !== 'search' && route.name !== 'settings' ? <LoginScreen pending={loginPending} message={loginMessage} onLogin={() => void handleLogin()} />
          : route.name === 'favorites' ? <FavoritesScreen tracks={favorites} total={total} loading={libraryLoading}
              currentId={player.current?.id} playing={player.playing} filter={favFilter} onFilterChange={setFavFilter}
              onPlay={play} onToggleFavorite={track => void handleToggleFavorite(track)} onTrackMenu={handleTrackMenu} />
          : route.name === 'playlists' ? <PlaylistsScreen playlists={playlists} loading={playlistsLoading} onOpen={openPlaylist} />
          : route.name === 'playlist' ? <PlaylistScreen key={route.playlist.id} playlist={route.playlist} currentId={player.current?.id}
              playing={player.playing} onPlay={play} onBack={() => setRoute({ name: 'playlists' })} onTrackMenu={handleTrackMenu} />
          : route.name === 'search' ? <SearchScreen key={route.query} query={route.query} currentId={player.current?.id}
              playing={player.playing} onPlay={play} onTrackMenu={handleTrackMenu} />
          : route.name === 'history' ? <div className="screen"><p className="screen-sub">华为播放历史（只读） · 已加载 {history.length} 首</p>
              {history.length ? history.map((track, index) => <TrackRow key={`${track.id}-${index}`} track={track} order={index + 1}
                active={player.current?.id === track.id} playing={player.playing} onPlay={() => play(history, index)} onMenu={event => handleTrackMenu(track, event)} />)
                : <p className="pad-no-content">暂无播放记录</p>}</div>
          : <SettingsScreen auth={auth} settings={settings} cache={lyricsCache} displayName={displayName}
              onUpdate={patch => void handleUpdateSettings(patch)} onCloseBehavior={value => void handleCloseBehavior(value)}
              onLogout={() => void handleLogout()} onLogin={() => void handleLogin()} onClearCache={local => void handleClearLyrics(local)} onQuit={() => void api.app.quit()}
              onCheckUpdates={openUpdates} onOpenAbout={openAbout} version={updateState.currentVersion} />}
          {libraryError && authenticated ? <div className="inline-error" role="alert">{libraryError}</div> : null}
        </main>
      </div>
      <PadPlayer player={player} open={playerOpen} onOpen={() => setPlayerOpen(true)} onClose={() => setPlayerOpen(false)}
        onToggleQueue={() => setQueueOpen(value => !value)} queueOpen={queueOpen} onFavoriteChanged={() => void loadLibrary()} />
      <PadNavigation active={activePadTab(route.name, playerOpen)} onNavigate={navigatePad} />
      <QueuePanel player={player} open={queueOpen} onClose={() => setQueueOpen(false)} />
      {menu ? <TrackMenu target={menu} onClose={() => setMenu(null)} onPlayNow={() => handleMenuPlay(menu.track)}
        onPlayNext={() => handlePlayNext(menu.track)} onAddToQueue={() => handleAddToQueue(menu.track)} /> : null}
      {loginPending ? <div className="login-strip"><span>{loginMessage ?? '正在打开华为登录页…'}</span>
        <button type="button" className="ghost-button" onClick={() => void handleCancelLogin()}>取消登录</button></div> : null}
      {toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null}
    </div>
  );
}
