import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Heart, HeartPulse, ListMusic, Loader2, Music2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from './PadIcons';
import type { usePlayer } from './lib/player';
import { modeLabel } from './lib/player';
import { artistsOf, Cover } from './ui';
import { PLAY_MODES } from './playback-modes.mjs';
import { describePlaybackQuality } from './quality-display.mjs';
import './pad-mode-menu.css';

type Player = ReturnType<typeof usePlayer>;
type Props = { player: Player; open: boolean; onOpen: () => void; onClose: () => void; queueOpen: boolean; onToggleQueue: () => void; onFavoriteChanged?: () => void; desktopLyricsControl?: React.ReactNode };
const time = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

function PlaybackButton({ player, large = false }: { player: Player; large?: boolean }) {
  return <button type="button" className={`pad-play-toggle${large ? ' is-large' : ''}`} disabled={!player.current}
    aria-label={player.playing ? '暂停' : '播放'} onClick={player.toggle}>
    {player.buffering ? <Loader2 className="spin" /> : player.playing ? <Pause variant={large ? 'badge' : 'default'} fill="currentColor" /> : <Play variant={large ? 'badge' : 'default'} fill="currentColor" />}
  </button>;
}

const modeIcon = (mode: Player['mode']) => mode === 'heart' ? HeartPulse : mode === 'shuffle' ? Shuffle : mode === 'one' ? Repeat1 : Repeat;

function ModeMenu({ player }: { player: Player }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  const menuId = useId();
  const setOpen = (value: boolean) => { if (ref.current) ref.current.open = value; setExpanded(value); };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const Icon = modeIcon(player.mode);
  return <details className="pad-player-mode pad-mode-picker" ref={ref}
    onToggle={event => setExpanded(event.currentTarget.open)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => {
    const details = ref.current;
    if (!details) return;
    if (event.key === 'Escape' && details.open) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); details.querySelector('summary')?.focus();
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); setOpen(true);
      const items = [...details.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : at < 0 ? event.key === 'ArrowUp' ? items.length - 1 : 0
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <summary className="pad-control pad-mode-trigger" role="button" aria-haspopup="menu" aria-expanded={expanded} aria-controls={menuId} aria-label={`播放模式：${modeLabel(player.mode)}`}
      onClick={event => { event.preventDefault(); setOpen(!ref.current?.open); }}>
      <Icon /><span>{modeLabel(player.mode)}</span><ChevronDown size={14} />
    </summary>
    <div className="pad-mode-menu" role="menu" id={menuId} aria-label="选择播放模式">
      {PLAY_MODES.map(item => {
        const ItemIcon = modeIcon(item.id);
        return <button type="button" key={item.id} role="menuitemradio" tabIndex={-1} data-mode={item.id} aria-checked={player.mode === item.id}
          onClick={() => {
            setOpen(false); ref.current?.querySelector('summary')?.focus();
            void player.selectMode(item.id);
          }}><ItemIcon size={20} /><span>{item.label}</span>{player.mode === item.id ? <span aria-hidden="true">✓</span> : null}</button>;
      })}
    </div>
  </details>;
}

function HeartStatus({ player, mini = false }: { player: Player; mini?: boolean }) {
  if (!player.heartMessage) return null;
  return <div className={`pad-heart-status${mini ? ' is-mini' : ''}`} role="status" aria-label="心动模式状态"
    aria-live="polite" aria-busy={player.heartStatus === 'loading'}>
    {player.heartStatus === 'loading' ? <Loader2 className="spin" size={16} /> : null}<span>{player.heartMessage}</span>
    {player.heartStatus === 'loading' ? <button type="button" onClick={player.cancelHeart}>停止等待</button> : null}
  </div>;
}

/** One transport shared by library/full views; Audio stays in usePlayer. */
export function PadPlayer({ player, open, onOpen, onClose, queueOpen, onToggleQueue, onFavoriteChanged, desktopLyricsControl }: Props) {
  const linesRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const followAfter = useRef(0);
  const lastAudibleVolume = useRef(player.volume > 0 ? player.volume : .6);
  useEffect(() => { if (player.volume > 0) lastAudibleVolume.current = player.volume; }, [player.volume]);
  const track = player.current;
  const total = player.duration || track?.durationSeconds || 0;
  const lines = player.lyrics?.lines ?? [];
  const activeIndex = useMemo(() => {
    if (!player.lyrics?.synced) return -1;
    let result = -1;
    for (let index = 0; index < lines.length; index++) {
      const stamp = lines[index].timeMs;
      if (stamp !== null && stamp <= player.position * 1000) result = index;
    }
    return result;
  }, [lines, player.position, player.lyrics?.synced]);

  useEffect(() => {
    if (!open || performance.now() < followAfter.current) return;
    const container = linesRef.current;
    const line = activeRef.current;
    if (!container || !line) return;
    const rect = container.getBoundingClientRect();
    const target = line.getBoundingClientRect().top - rect.top + container.scrollTop - rect.height * .35;
    container.scrollTo({ top: Math.max(0, target), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activeIndex, open]);


  const favorite = async () => { await player.toggleFavorite(); onFavoriteChanged?.(); };

  const quality = describePlaybackQuality({ actualQuality: player.actualQuality, ...(player.playbackDetails ?? {}) }, { pending: player.buffering && !player.playbackDetails });

  return <>{open ? <section className="pad-player-screen" aria-label="现在就听">
    {track?.coverUrl ? <img className="pad-player-background" src={track.coverUrl} alt="" draggable={false} /> : <div className="pad-player-background is-fallback"><Music2 /></div>}
    <div className="pad-player-shade" />

    {!track ? <div className="pad-empty-player"><Music2 /><h1>选择一首歌，开始聆听</h1><p>从收藏、歌单或搜索中选择音乐。</p><button type="button" className="primary-button" onClick={onClose}>返回音乐库</button></div>
      : <div className="pad-player-right">
        <div className="pad-lyrics-scroll" ref={linesRef} onWheel={() => { followAfter.current = performance.now() + 5000; }}
          onPointerDown={() => { followAfter.current = performance.now() + 5000; }} aria-label="歌词">
          {lines.length ? lines.map((line, index) => <button type="button" key={`${line.timeMs}-${index}`} ref={index === activeIndex ? activeRef : undefined}
            className={`pad-lyric-line${index === activeIndex ? ' is-active' : ''}`} disabled={line.timeMs === null}
            onClick={() => line.timeMs !== null && player.seek(line.timeMs / 1000)}>
            {line.text}{line.translation ? <span>{line.translation}</span> : null}
          </button>) : <div className="pad-lyrics-empty"><p>{player.lyrics ? '暂无歌词' : '正在读取歌词…'}</p><span>{player.lyrics ? '服务暂未提供这首歌的歌词' : '歌词将随播放自动显示'}</span></div>}
        </div>
        <div className="pad-player-info"><h1 title={track.title}>{track.title}</h1><p>{artistsOf(track)}</p>
          <div className="pad-player-badges"><span data-quality-state={quality.status} data-quality-evidence={player.playbackDetails?.qualityEvidence} title={quality.detail} tabIndex={0} aria-label={`${quality.label}：${quality.detail}`}>{quality.label}</span><span className="is-unavailable" title="当前未接入空间音频">空间音频 · 未接入</span></div>
        </div>
      </div>}
  </section> : null}
  <HeartStatus player={player} mini />
  <footer className="pad-mini-player desktop-playerbar" aria-label="播放条" data-player-view={open ? 'full' : 'mini'}>
    <button type="button" className="pad-mini-track" aria-label={open ? '收起播放页' : '打开播放页'} aria-expanded={open} onClick={open ? onClose : onOpen}>
      <Cover key={track?.coverUrl ?? 'empty'} src={track?.coverUrl} radius={8} />
      <span className="pad-mini-meta"><strong>{track?.title ?? '未在播放'}</strong><span>{track ? artistsOf(track) : '选择一首喜欢的歌'}</span></span>
      <ChevronDown className={open ? '' : 'desktop-expand'} size={16} />
    </button>
    <div className="desktop-player-center">
      <div className="pad-player-actions desktop-transport" role="group" aria-label="播放控制">
        <button type="button" className="pad-control" aria-label="上一首" disabled={!track} onClick={player.previous}><SkipBack /></button>
        <PlaybackButton player={player} large={open} />
        <button type="button" className="pad-control pad-next" aria-label="下一首" disabled={!track} onClick={() => player.next()}><SkipForward /></button>
        <ModeMenu player={player} />
      </div>
      <div className="pad-seek-block"><span>{time(player.position)}</span><input type="range" className="pad-seek" aria-label="播放进度" min={0} max={Math.max(.1, total)} step={.1}
          value={Math.min(player.position, Math.max(.1, total))} disabled={total <= 0} style={{ '--progress': `${total > 0 ? Math.min(100, player.position / total * 100) : 0}%` } as React.CSSProperties}
          onChange={event => player.seek(Number(event.target.value))} />
        <span>{time(total)}</span>
      </div>
    </div>
    <div className="desktop-player-tools">
      <button type="button" className={`pad-control pad-like${player.favorite ? ' is-active' : ''}`} disabled={!track}
        aria-label={player.favorite ? '取消收藏' : '收藏'} aria-pressed={player.favorite} onClick={() => void favorite()}><Heart fill={player.favorite ? 'currentColor' : 'none'} /></button>
      <button type="button" className={`pad-control${queueOpen ? ' is-active' : ''}`} aria-label="播放队列" aria-expanded={queueOpen} onClick={onToggleQueue}><ListMusic /></button>
      {desktopLyricsControl}
        <div className="pad-volume-control" role="group" aria-label="音量控制">
          <button type="button" className="pad-control" aria-label={player.volume === 0 ? '取消静音' : '静音'} aria-pressed={player.volume === 0}
            onClick={() => player.setVolume(player.volume === 0 ? lastAudibleVolume.current : 0)}>
            {player.volume === 0 ? <VolumeX /> : <Volume2 />}
          </button>
          <input type="range" aria-label="音量" min={0} max={1} step={.01} value={player.volume} onChange={event => player.setVolume(Number(event.target.value))} />
          <output aria-label="音量百分比">{Math.round(player.volume * 100)}%</output>
        </div>
    </div>
  </footer></>;
}
