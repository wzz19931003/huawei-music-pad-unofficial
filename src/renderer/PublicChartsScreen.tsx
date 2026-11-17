import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Playlist, PublicChartCatalog, PublicChartDetail, Track } from '../shared/types';
import { api } from './lib/api';
import { Cover, EmptyState, TrackRow } from './ui';

type Props = {
  authenticated: boolean; currentId?: string; playing: boolean;
  onPlay: (tracks: Track[], index: number) => void;
  onAddToQueue: (track: Track) => void;
  onLogin: () => void; onNotice: (message: string) => void; onBack: () => void;
  onTrackMenu?: (track: Track, event: MouseEvent) => void;
};

/** Public metadata only. Playback and queue controls use the existing account/player path. */
export function PublicChartsScreen(props: Props) {
  const [catalog, setCatalog] = useState<PublicChartCatalog | null>(null);
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [detail, setDetail] = useState<PublicChartDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const epoch = useRef(0);
  const retry = useRef<() => void>(() => undefined);
  async function loadCatalog(refresh = false) {
    retry.current = () => { void loadCatalog(true); };
    const token = ++epoch.current; setLoading(true); setError(null); setCatalog(null);
    try { const result = await api.charts(refresh); if (token === epoch.current) setCatalog(result); }
    catch (reason) { if (token === epoch.current) setError(reason instanceof Error ? reason.message : '公开榜单读取失败'); }
    finally { if (token === epoch.current) setLoading(false); }
  }
  async function loadPage(chart: Playlist, start: number, previous: Track[], refresh = false) {
    retry.current = () => { void loadPage(chart, start, previous, refresh); };
    const token = ++epoch.current; setLoading(true); setError(null); setStopped(false);
    if (refresh && start === 0) setDetail(null);
    try {
      const result = await api.chartDetail({ id: chart.id, start, limit: 10, refresh });
      if (token !== epoch.current) return;
      if (result.playlist.id !== chart.id) throw new Error('榜单详情不匹配，请返回目录重试。');
      const seen = new Set(previous.map(track => track.id));
      const fresh = result.tracks.filter(track => { if (seen.has(track.id)) return false; seen.add(track.id); return true; });
      const tracks = [...previous, ...fresh].slice(0, 500);
      // Same conservative 500-track / 50-page ceiling as main. Never auto-fetch a full chart.
      const noProgress = fresh.length === 0 || !Number.isInteger(result.nextStart) || result.nextStart !== start + 10;
      const capped = result.nextStart >= 500 || tracks.length >= 500;
      setStopped(noProgress || capped);
      setDetail({ ...result, tracks, hasMore: result.hasMore && !noProgress && !capped });
    } catch (reason) { if (token === epoch.current) setError(reason instanceof Error ? reason.message : '榜单详情读取失败'); }
    finally { if (token === epoch.current) setLoading(false); }
  }
  function open(chart: Playlist) {
    setSelected(chart); setDetail(null);
    void loadPage(chart, 0, []);
  }
  useEffect(() => { void loadCatalog(); return () => { ++epoch.current; }; }, []);
  function permitted(track: Track, run: () => void) {
    if (!props.authenticated) { props.onLogin(); return; }
    if (!track.available) { props.onNotice(`「${track.title}」暂不可播放。`); return; }
    run();
  }
  return <div className="screen public-charts" aria-label="官方公开热门榜单" aria-busy={loading}>
    <p className="screen-sub">华为官方公开栏目 · 仅热门榜单，并非全量排行榜。播放仍需账号与相应权益。</p>
    {selected ? <>
      <button type="button" className="ghost-button" aria-label="返回榜单目录" onClick={() => { ++epoch.current; setSelected(null); setDetail(null); setLoading(false); setError(null); }}>返回榜单目录</button>
      <button type="button" className="ghost-button" aria-label="刷新当前榜单" disabled={loading} onClick={() => void loadPage(selected, 0, [], true)}>刷新榜单</button>
      <h2>{detail?.playlist.title ?? selected.title}</h2>
      {detail ? <p className="screen-sub">已加载 {detail.tracks.length} 首{detail.playlist.count === undefined ? '' : ` · 详情标注 ${detail.playlist.count} 首`}
        {detail.updatedAtRaw ? ` · 来源更新字段：${detail.updatedAtRaw}` : ''}</p> : null}
      {detail?.tracks.map((track, index) => <div className="public-chart-track" key={track.id}>
        <TrackRow track={track} order={index + 1} active={props.currentId === track.id} playing={props.playing}
          onPlay={() => permitted(track, () => props.onPlay(detail.tracks, index))}
          onMenu={props.onTrackMenu ? event => permitted(track, () => props.onTrackMenu?.(track, event)) : undefined} />
        <button type="button" className="ghost-button" aria-label={`添加到队列：${track.title}`} onClick={() => permitted(track, () => props.onAddToQueue(track))}>添加到队列</button>
      </div>)}
      {detail && !detail.tracks.length && !loading ? <EmptyState title="此榜单暂无曲目" /> : null}
      {detail?.hasMore ? <button type="button" className="ghost-button" disabled={loading} aria-label="加载更多榜单曲目"
        onClick={() => void loadPage(selected, detail.nextStart, detail.tracks)}>加载更多</button> : null}
      {stopped && !loading ? <p role="status">已停止加载：没有新增曲目或已达到本次浏览上限。</p> : null}
    </> : <>
      <button type="button" className="ghost-button" aria-label="返回首页" onClick={props.onBack}>返回首页</button>
      <button type="button" className="ghost-button" aria-label="刷新榜单目录" disabled={loading} onClick={() => void loadCatalog(true)}>刷新</button>
      <div className="pad-mine-playlist-grid">{catalog?.charts.map(chart => <button type="button" className="pad-mine-playlist" key={chart.id}
        aria-label={`打开榜单：${chart.title}`} onClick={() => void open(chart)}>
        <Cover key={chart.coverUrl ?? chart.id} src={chart.coverUrl} size={64} /><span className="pad-mine-playlist-text"><strong>{chart.title}</strong>
          <small>{chart.count === undefined ? '公开榜单' : `目录标注 ${chart.count} 首`}</small></span></button>)}</div>
      {catalog && !catalog.charts.length && !loading ? <EmptyState title="暂无公开热门榜单" hint="此栏目没有可显示的榜单，不填充其他来源。" /> : null}
    </>}
    {loading ? <><p role="status">{selected ? '正在读取榜单曲目…' : '正在读取公开榜单…'}</p>
      <button type="button" className="ghost-button" aria-label="取消榜单读取" onClick={() => { ++epoch.current; setLoading(false); setError('已取消读取，可重试或返回。'); }}>取消读取</button></> : null}
    {error ? <div className="inline-error" role="alert">{error}
      <button type="button" className="ghost-button" aria-label="重试榜单读取" onClick={() => retry.current()}>重试</button></div> : null}
  </div>;
}
