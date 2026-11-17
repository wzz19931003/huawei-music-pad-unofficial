import { useCallback, useEffect, useRef, useState } from 'react';
import type { LyricsDoc, Playback, Track } from '../../shared/types';
import { api } from './api';
import { buildHeartQueue, nextMode, nextPlaybackStep, normalizePlayMode } from '../playback-modes.mjs';
export { modeLabel, nextMode } from '../playback-modes.mjs';

type Quality = 'standard' | 'lossless';
export type PlayMode = 'all' | 'one' | 'shuffle' | 'heart';
export type HeartStatus = 'idle' | 'loading' | 'ready' | 'no-favorites' | 'no-candidates' | 'cancelled' | 'error';
export type PlaybackDetails = Pick<Playback, 'codec' | 'qualityEvidence' | 'sampleRateHz' | 'bitDepth' | 'channels' | 'contentType'>;

// Existing allowlisted favorites IPC, at most 16 x 50 rows, no summary request.
// Guard progress independently of the API wrapper so repeated pages cannot loop.
function abortableRead<T>(read: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      return read();
    }).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
      signal.removeEventListener('abort', abort); reject(error);
    });
  });
}

async function heartFavorites(signal: AbortSignal): Promise<Track[]> {
  const tracks = new Map<string, Track>();
  let start = 0;
  for (let pageNumber = 0; pageNumber < 16; pageNumber++) {
    const result = await abortableRead(() => window.desktop.music.favorites({ start, limit: 50 }), signal);
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!result.ok) throw new Error('favorites unavailable');
    const page = result.data;
    const before = tracks.size;
    for (const track of page.tracks.slice(0, 50)) if (!tracks.has(track.id)) tracks.set(track.id, track);
    if (!page.hasMore) return [...tracks.values()];
    if (tracks.size === before || !Number.isSafeInteger(page.nextStart) || page.nextStart <= start) break;
    start = page.nextStart;
  }
  // Partial membership cannot prove that a discovered candidate is not already saved.
  throw new Error('Incomplete favorites snapshot');
}

type Options = {
  quality: Quality;
  volume: number;
  /** UI session identity, never credentials; null means logged out. */
  accountKey?: string | null;
  onError: (message: string) => void;
  onVolumeCommit: (volume: number) => void;
  /** 播放模式被用户改动时回报，交给 App 落盘。 */
  onPreferencesChange?: (next: PlayMode) => void;
};

/**
 * 播放器内核：一个 Audio 元素 + 队列 + 单曲解析。
 * 只有当前歌曲变化（index/nonce）才会重新向主进程要播放地址，避免每帧 IPC。
 */
export function usePlayer({ quality, volume, accountKey, onError, onVolumeCommit, onPreferencesChange }: Options) {
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [nonce, setNonce] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState<LyricsDoc | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [mode, setModeState] = useState<PlayMode>('all');
  const [actualQuality, setActualQuality] = useState<'standard' | 'lossless' | 'unknown'>('unknown');
  const [playbackDetails, setPlaybackDetails] = useState<PlaybackDetails | null>(null);
  const [heartStatus, setHeartStatus] = useState<HeartStatus>('idle');
  const [heartMessage, setHeartMessage] = useState('');
  const heartJob = useRef<AbortController | null>(null);
  const accountRef = useRef(accountKey);
  accountRef.current = accountKey;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const modeRef = useRef<PlayMode>(mode);
  /** 随机走过的索引，供「上一首」回退。 */
  const shuffleHistory = useRef<number[]>([]);
  const shuffleState = useRef<ReturnType<typeof nextPlaybackStep>['shuffleState']>(null);
  const loadToken = useRef(0);
  // A pending request may leave the old source playing. Bind secondary views to
  // the load token actually assigned to this one Audio, not the latest request.
  const audioSource = useRef<{ generation: number; trackId: string | null }>({ generation: 0, trackId: null });
  const onErrorRef = useRef(onError);
  const onPreferencesRef = useRef(onPreferencesChange);
  const nextRef = useRef<(auto?: boolean) => void>(() => undefined);
  const positionCommit = useRef(0);
  /** 恢复上次队列时，第一次载入要跳到这个位置且不自动播。 */
  const pendingSeek = useRef<{ position: number; autoplay: boolean } | null>(null);

  queueRef.current = queue;
  indexRef.current = index;
  modeRef.current = mode;
  onErrorRef.current = onError;
  onPreferencesRef.current = onPreferencesChange;

  const current = index >= 0 ? queue[index] : undefined;

  /** Cancels our wait/commit only; the existing underlying IPC read may finish later. */
  const cancelHeart = useCallback(() => {
    const job = heartJob.current;
    heartJob.current = null;
    if (!job) return;
    job.abort();
    setHeartStatus('cancelled');
    setHeartMessage('已停止等待心动模式结果，保留原播放；在途读取可能仍会完成，其结果不会应用。');
  }, []);

  const resetTraversal = useCallback(() => {
    cancelHeart();
    shuffleState.current = null;
    shuffleHistory.current = [];
  }, [cancelHeart]);

  useEffect(() => { cancelHeart(); }, [accountKey, cancelHeart]);
  useEffect(() => () => {
    const job = heartJob.current;
    heartJob.current = null;
    job?.abort();
    ++loadToken.current;
  }, []);

  /** 按当前队列重播同一首（单曲循环 / 手动重试）。 */
  const reload = useCallback(() => setNonce(value => value + 1), []);

  const playFrom = useCallback((tracks: Track[], startIndex: number) => {
    if (tracks.length === 0) return;
    resetTraversal();
    const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
    pendingSeek.current = null;
    setQueue(tracks);
    queueRef.current = tracks;
    setIndex(safeIndex);
    indexRef.current = safeIndex;
    setNonce(value => value + 1);
  }, []);

  /** 启动时恢复上次队列：定位到那一首、跳到那个进度，但不自动出声。 */
  const restore = useCallback((tracks: Track[], startIndex: number, positionSeconds: number) => {
    if (tracks.length === 0) return;
    resetTraversal();
    const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
    pendingSeek.current = { position: Math.max(0, positionSeconds), autoplay: false };
    setQueue(tracks);
    queueRef.current = tracks;
    setIndex(safeIndex);
    indexRef.current = safeIndex;
    setNonce(value => value + 1);
  }, []);

  /** 下一首播放：插到当前曲目后面，不打乱正在播的那首。 */
  const enqueueNext = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) return;
      const list = queueRef.current;
      const i = indexRef.current;
      if (list.length === 0 || i < 0) {
        playFrom(tracks, 0);
        return;
      }
      const next = [...list.slice(0, i + 1), ...tracks, ...list.slice(i + 1)];
      resetTraversal();
      setQueue(next);
      queueRef.current = next;
    },
    [playFrom],
  );

  /** 添加到播放队列：接在队尾。 */
  const enqueueLast = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) return;
      const list = queueRef.current;
      if (list.length === 0 || indexRef.current < 0) {
        playFrom(tracks, 0);
        return;
      }
      const next = [...list, ...tracks];
      resetTraversal();
      setQueue(next);
      queueRef.current = next;
    },
    [playFrom],
  );

  /** 从队列里扔掉某一项；扔的是正在播的那首就顺位接下一位。 */
  const removeAt = useCallback((position: number) => {
    const list = queueRef.current;
    if (position < 0 || position >= list.length) return;
    resetTraversal();
    const playing = indexRef.current;
    const next = list.filter((_, i) => i !== position);

    if (next.length === 0) {
      queueRef.current = [];
      setQueue([]);
      indexRef.current = -1;
      setIndex(-1);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      audioSource.current = { ...audioSource.current, trackId: null };
      setPlaying(false);
      return;
    }

    if (position === playing) {
      const target = Math.min(playing, next.length - 1);
      indexRef.current = target;
      setIndex(target);
      setNonce(value => value + 1);
    } else if (position < playing) {
      indexRef.current = playing - 1;
      setIndex(playing - 1);
    }
    setQueue(next);
    queueRef.current = next;
  }, []);

  /** 清空待播：只留有正在播的这一首。 */
  const clearUpcoming = useCallback(() => {
    const list = queueRef.current;
    const i = indexRef.current;
    if (i < 0) return;
    resetTraversal();
    const next = list.slice(0, i + 1);
    queueRef.current = next;
    setQueue(next);
  }, []);

  /** 从队列里直接点某一首。 */
  const jumpTo = useCallback((position: number) => {
    const list = queueRef.current;
    if (position < 0 || position >= list.length) return;
    resetTraversal();
    if (position === indexRef.current) return;
    pendingSeek.current = null;
    indexRef.current = position;
    setIndex(position);
    setNonce(value => value + 1);
  }, []);

  const next = useCallback((auto = false) => {
    const tracks = queueRef.current;
    if (tracks.length === 0) return;
    const i = indexRef.current;
    pendingSeek.current = null;

    const step = nextPlaybackStep({ mode: modeRef.current, index: i, length: tracks.length, auto, shuffleState: shuffleState.current });
    shuffleState.current = step.shuffleState;
    if (step.stopped) { audioRef.current?.pause(); setPlaying(false); return; }
    if (modeRef.current === 'shuffle' && !step.replay) {
      shuffleHistory.current.push(i);
      if (shuffleHistory.current.length > 200) shuffleHistory.current.shift();
    }
    indexRef.current = step.index;
    setIndex(step.index);
    if (step.replay) setNonce(value => value + 1);
  }, []);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    pendingSeek.current = null;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    // 随机模式回退到「上一首随机到的」，没有历史再顺序退。
    const history = shuffleHistory.current;
    if (modeRef.current === 'shuffle' && history.length > 0) {
      const target = history.pop() as number;
      shuffleState.current = null;
      indexRef.current = target;
      setIndex(target);
      setNonce(value => value + 1);
      return;
    }
    resetTraversal();
    const target = Math.max(0, indexRef.current - 1);
    indexRef.current = target;
    setIndex(target);
    setNonce(value => value + 1);
  }, []);

  nextRef.current = next;

  // Audio 元素只建一次，事件监听跟着组件生命周期。
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;

    const element = audio;
    const onTime = () => {
      setPosition(element.currentTime);
      positionCommit.current = element.currentTime;
    };
    const onLoaded = () => setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    const onPlaying = () => {
      setPlaying(true);
      setBuffering(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPaused = () => setPlaying(false);
    const onEnded = () => nextRef.current(true);
    const onFailed = () => {
      setBuffering(false);
      setPlaying(false);
      onErrorRef.current('这首歌暂时没能播放，稍后可以再点一次。');
    };

    element.addEventListener('timeupdate', onTime);
    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('playing', onPlaying);
    element.addEventListener('waiting', onWaiting);
    element.addEventListener('pause', onPaused);
    element.addEventListener('ended', onEnded);
    element.addEventListener('error', onFailed);

    return () => {
      element.removeEventListener('timeupdate', onTime);
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('playing', onPlaying);
      element.removeEventListener('waiting', onWaiting);
      element.removeEventListener('pause', onPaused);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('error', onFailed);
      element.pause();
      element.src = '';
      audioSource.current = { ...audioSource.current, trackId: null };
      audioRef.current = null;
    };
    // 只在挂载时初始化，音量由下面的 effect 同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // 切歌：解析播放地址 → 载入 → 播放，同时并行取歌词与收藏状态。
  useEffect(() => {
    const track = queueRef.current[index];
    const token = ++loadToken.current;
    setActualQuality('unknown');
    setPlaybackDetails(null);
    if (!track) return;
    const pending = pendingSeek.current;
    pendingSeek.current = null;
    setLyrics(null);
    setFavorite(false);
    setDuration(0);
    setPosition(0);
    setBuffering(true);

    void (async () => {
      try {
        const playback = await api.resolvePlayback(track.id, quality);
        if (token !== loadToken.current) return;
        const audio = audioRef.current;
        if (!audio) return;
        setActualQuality(playback.actualQuality);
        const { codec, qualityEvidence, sampleRateHz, bitDepth, channels, contentType } = playback;
        setPlaybackDetails({ codec, qualityEvidence, sampleRateHz, bitDepth, channels, contentType });
        audio.src = playback.url;
        audioSource.current = { generation: token, trackId: track.id };

        if (pending) {
          // 恢复上次进度：必须等元数据到了再改 currentTime，否则会被当成 0 丢掉。
          if (audio.readyState < 1) {
            await new Promise<void>(resolve => {
              const done = () => resolve();
              audio.addEventListener('loadedmetadata', done, { once: true });
              window.setTimeout(done, 4000);
            });
          }
          if (token !== loadToken.current) return;
          const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
          const target = duration > 1 ? Math.min(pending.position, duration - 0.5) : pending.position;
          audio.currentTime = Math.max(0, target);
          setPosition(audio.currentTime);
          positionCommit.current = audio.currentTime;
          if (pending.autoplay) await audio.play();
          else setBuffering(false);
          return;
        }

        audio.currentTime = 0;
        await audio.play();
      } catch (error) {
        if (token !== loadToken.current) return;
        setBuffering(false);
        // 用户快速切歌会导致 play() 被 abort，这属于正常打断，不提示。
        if (error instanceof DOMException && error.name === 'AbortError') return;
        onErrorRef.current('这首歌暂时没能播放，稍后可以再点一次。');
      }
    })();

    void api
      .lyrics(track)
      .then(doc => {
        if (token === loadToken.current) setLyrics(doc);
      })
      .catch(() => undefined);

    void api
      .favoriteState(track.id)
      .then(value => {
        if (token === loadToken.current) setFavorite(value);
      })
      .catch(() => undefined);
    // nonce 变化表示「同一首重播」，也要重新走一遍解析。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, nonce, quality]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setPosition(seconds);
  }, []);

  const setVolume = useCallback(
    (value: number) => {
      const next = Math.min(1, Math.max(0, value));
      if (audioRef.current) audioRef.current.volume = next;
      onVolumeCommit(next);
    },
    [onVolumeCommit],
  );

  // Mirror a confirmed library write without reloading or interrupting the current audio.
  const syncFavorite = useCallback((trackId: string, value: boolean) => {
    if (queueRef.current[indexRef.current]?.id === trackId) setFavorite(value);
  }, []);

  const toggleFavorite = useCallback(async () => {
    const track = queueRef.current[indexRef.current];
    if (!track) return;
    const next = !favorite;
    setFavorite(next);
    try {
      const value = await api.setFavorite(track.id, next);
      setFavorite(value);
    } catch {
      setFavorite(!next);
      onErrorRef.current(next ? '收藏没有成功，请稍后再试。' : '取消收藏没有成功，请稍后再试。');
    }
  }, [favorite]);

  /** Explicit selection; heart only commits after real metadata discovery succeeds. */
  const selectMode = useCallback(async (requested: PlayMode): Promise<boolean> => {
    cancelHeart();
    const next = normalizePlayMode(requested);
    if (next === 'heart') {
      if (accountRef.current === null) {
        setHeartStatus('error'); setHeartMessage('请先登录后再使用心动模式。'); return false;
      }
      const controller = new AbortController();
      heartJob.current = controller;
      const account = accountRef.current;
      const active = () => heartJob.current === controller && !controller.signal.aborted && accountRef.current === account;
      setHeartStatus('loading');
      setHeartMessage('正在读取收藏，进行客户端元数据关联与探索…');
      try {
        const favorites = await heartFavorites(controller.signal);
        if (!active()) return false;
        const result = await buildHeartQueue({ favorites, signal: controller.signal,
          loadArtist: async id => {
            const response = await window.desktop.music.artist({ id });
            if (!response.ok) throw new Error('artist unavailable');
            return response.data;
          },
          search: query => api.search(query),
        });
        if (!active()) return false;
        heartJob.current = null;
        if (result.status !== 'ready') {
          setHeartStatus(result.status === 'aborted' ? 'cancelled' : result.status);
          setHeartMessage(result.status === 'aborted' ? '心动模式读取已取消，保留原播放模式与队列。'
            : result.status === 'no-favorites' ? '没有可播放的收藏，未切换心动模式。' : '客户端关联与探索未找到可用的未收藏曲目，已保留原播放模式与队列。');
          return false;
        }
        playFrom(result.queue, 0);
        setHeartStatus('ready');
        setHeartMessage(result.discoveryCount
          ? `心动模式：收藏与未收藏曲目交替播放（客户端元数据关联与探索，含 ${result.discoveryCount} 首探索曲目，非官方推荐）。`
          : '心动模式：收藏与关联曲目交替播放（本轮未找到收藏歌手或专辑外的可用探索结果；客户端关联，非官方推荐）。');
      } catch {
        if (!active()) return false;
        heartJob.current = null;
        setHeartStatus('error');
        setHeartMessage('读取收藏或相关歌曲失败，已保留原播放模式与队列。');
        return false;
      }
    } else {
      setHeartStatus('idle');
      setHeartMessage('');
    }
    resetTraversal();
    modeRef.current = next;
    setModeState(next);
    onPreferencesRef.current?.(next);
    return true;
  }, [playFrom, resetTraversal, cancelHeart]);

  /** Legacy cycle control delegates to the same explicit selection policy. */
  const cycleMode = useCallback(() => { void selectMode(nextMode(modeRef.current)); }, [selectMode]);

  /** 启动时把落盘的模式灌进按钮（以前是硬编码 all + false）。 */
  const setPreferences = useCallback((next: PlayMode) => {
    resetTraversal();
    modeRef.current = normalizePlayMode(next);
    setModeState(modeRef.current);
  }, []);

  // Read-only clock for synchronized secondary views. Never creates another Audio
  // and never returns a media URL, account/session data or cached React progress.
  const readClock = useCallback(() => {
    const audio = audioRef.current;
    const position = audio?.currentTime;
    const length = audio?.duration;
    const rate = audio?.playbackRate;
    return {
      generation: audioSource.current.generation,
      trackId: audioSource.current.trackId,
      positionSeconds: typeof position === 'number' && Number.isFinite(position) ? Math.max(0, position) : 0,
      durationSeconds: typeof length === 'number' && Number.isFinite(length) ? Math.max(0, length) : 0,
      playing: Boolean(audio && !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 3),
      playbackRate: typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1,
      sampledAtMs: Date.now(),
    };
  }, []);

  return {
    queue,
    index,
    current,
    playing,
    buffering,
    position,
    duration,
    volume,
    lyrics,
    favorite,
    mode,
    heartStatus,
    heartMessage,
    actualQuality,
    playbackDetails,
    quality,
    playFrom,
    restore,
    enqueueNext,
    enqueueLast,
    removeAt,
    clearUpcoming,
    jumpTo,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    reload,
    toggleFavorite,
    syncFavorite,
    cycleMode,
    selectMode,
    cancelHeart,
    setPreferences,
    positionCommit,
    readClock,
  };
}
