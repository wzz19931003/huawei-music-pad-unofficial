import { X, ListPlus, ListStart, Play, Trash2 } from './PadIcons';
import { useEffect, useRef, useState } from 'react';
import type { Track } from '../shared/types';
import type { Player } from './PlayerView';
import { Cover, artistsOf } from './ui';

/** 正在播放 / 接下来 / 已播放的一行。 */
function QueueTrack({
  track,
  order,
  active = false,
  dim = false,
  playing = false,
  onJump,
  onRemove,
}: {
  track: Track;
  order: number;
  active?: boolean;
  dim?: boolean;
  playing?: boolean;
  onJump: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className={`queue-row ${active ? 'is-active' : ''} ${dim ? 'is-dim' : ''}`}>
      <button type="button" className="queue-row-main" onClick={onJump} title={track.title}>
        <span className="queue-order">
          {active ? (
            <span className="eq" data-playing={playing}>
              <i />
              <i />
              <i />
            </span>
          ) : (
            String(order).padStart(2, '0')
          )}
        </span>
        <Cover src={track.coverUrl} size={32} radius={7} />
        <span className="queue-meta">
          <span className="queue-title">{track.title}</span>
          <span className="queue-artist">{artistsOf(track)}</span>
        </span>
      </button>
      {onRemove ? (
        <button type="button" className="queue-remove" onClick={onRemove} aria-label="从队列移除" title="从队列移除">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** 收起动画跑完才卸载，和 styles.css 里 queue-panel-out 的时长对齐。 */
const LEAVE_MS = 200;

/** 右侧播放队列：正在播放 + 接下来 + 已播放，点哪首跳哪首。 */
export function QueuePanel({
  player,
  open,
  onClose,
}: {
  player: Player;
  open: boolean;
  onClose: () => void;
}) {
  const current = player.current;
  const upcoming = player.queue.slice(player.index + 1);
  const played = player.index > 0 ? player.queue.slice(0, player.index) : [];
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const originRef = useRef<HTMLElement | null>(null);

  // 抽屉有开有合：开着时留在树上，收起动画放完再卸载。
  // 开合都走 CSS 动画（keyframes 自带起手帧），不依赖 rAF——
  // 窗口被挡住时 rAF 会被节流到几百毫秒，用它来「等下一帧」抽屉会卡住不出现。
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  // Non-modal desktop drawer: enter its controls and return focus on dismissal.
  useEffect(() => {
    if (!open || !mounted) return;
    originRef.current = document.activeElement as HTMLElement | null;
    scrollRef.current?.scrollTo({ top: 0 });
    closeButtonRef.current?.focus();
  }, [open, mounted]);

  const dismiss = () => {
    onClose();
    if (originRef.current?.isConnected) originRef.current.focus();
  };

  if (!mounted) return null;

  return (
    <aside
      className={`queue-panel ${closing ? 'is-closing' : 'is-open'}`}
      aria-label="播放队列"
      aria-hidden={closing}
      inert={closing || !open}
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); dismiss();
      }}
    >
      <header className="queue-head">
        <div className="queue-head-text">
          <h2>播放队列</h2>
          <span className="queue-sub">{player.queue.length > 0 ? `${player.queue.length} 首` : '空'}</span>
        </div>
        <div className="queue-head-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => player.clearUpcoming()}
            disabled={upcoming.length === 0}
            title="只留下正在播放的这一首"
          >
            清空待播
          </button>
          <button type="button" className="icon-button" ref={closeButtonRef} onClick={dismiss} aria-label="关闭队列" title="关闭队列">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="queue-scroll" ref={scrollRef}>
        {!current ? (
          <p className="queue-empty">队列还是空的。双击一首歌，或者右键「下一首播放」。</p>
        ) : (
          <>
            <section className="queue-section">
              <h3 className="queue-section-title">正在播放</h3>
              <QueueTrack track={current} order={player.index + 1} active playing={player.playing} onJump={() => undefined} onRemove={() => player.removeAt(player.index)} />
            </section>

            <section className="queue-section">
              <h3 className="queue-section-title">
                接下来
                <span className="queue-section-count">{upcoming.length}</span>
              </h3>
              {upcoming.length === 0 ? (
                <p className="queue-empty">队列到底了。</p>
              ) : (
                upcoming.map((track, i) => (
                  <QueueTrack
                    key={`${track.id}-${player.index + 1 + i}`}
                    track={track}
                    order={player.index + 2 + i}
                    onJump={() => player.jumpTo(player.index + 1 + i)}
                    onRemove={() => player.removeAt(player.index + 1 + i)}
                  />
                ))
              )}
            </section>

            {played.length > 0 ? (
              <section className="queue-section">
                <h3 className="queue-section-title">
                  已播放
                  <span className="queue-section-count">{played.length}</span>
                </h3>
                {played.map((track, i) => (
                  <QueueTrack key={`${track.id}-${i}`} track={track} order={i + 1} dim onJump={() => player.jumpTo(i)} onRemove={() => player.removeAt(i)} />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

export type MenuTarget = { track: Track; x: number; y: number; returnFocus?: HTMLElement };

/** 列表里右键歌曲弹出的动作菜单：立即播放 / 下一首播放 / 添加到播放队列。 */
export function TrackMenu({
  target,
  onClose,
  onPlayNow,
  onPlayNext,
  onAddToQueue,
  onRemove,
  inQueue,
}: {
  target: MenuTarget;
  onClose: () => void;
  onPlayNow: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onRemove?: () => void;
  inQueue?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const originRef = useRef(target.returnFocus ?? document.activeElement as HTMLElement | null);
  if (target.returnFocus) originRef.current = target.returnFocus;
  const dismiss = (restore = false) => {
    closeRef.current();
    if (restore && originRef.current?.isConnected) originRef.current.focus();
  };
  useEffect(() => {
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[0]?.focus();
    const close = () => dismiss();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) dismiss(true);
    };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [target.track.id, target.x, target.y]);

  const width = 208;
  const height = inQueue ? 176 : 140;
  const left = Math.max(12, Math.min(target.x, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(target.y, window.innerHeight - height - 12));

  const run = (action: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation();
    action();
    dismiss(true);
  };

  return (
    <div
      className="track-menu"
      ref={menuRef}
      style={{ left, top, width }}
      onClick={event => event.stopPropagation()}
      onContextMenu={event => event.preventDefault()}
      role="menu"
      aria-label={`歌曲操作：${target.track.title}`}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); dismiss(true); return;
        }
        if (event.key === 'Tab') { dismiss(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : at < 0 ? event.key === 'ArrowUp' ? items.length - 1 : 0
          : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}
    >
      <button type="button" className="track-menu-item" onClick={run(onPlayNow)} role="menuitem" tabIndex={-1}>
        <Play size={14} fill="currentColor" />
        立即播放
      </button>
      <button type="button" className="track-menu-item" onClick={run(onPlayNext)} role="menuitem" tabIndex={-1}>
        <ListStart size={14} />
        下一首播放
      </button>
      <button type="button" className="track-menu-item" onClick={run(onAddToQueue)} role="menuitem" tabIndex={-1}>
        <ListPlus size={14} />
        添加到播放队列
      </button>
      {inQueue && onRemove ? (
        <button type="button" className="track-menu-item is-danger" onClick={run(onRemove)} role="menuitem" tabIndex={-1}>
          <Trash2 size={14} />
          从队列移除
        </button>
      ) : null}
    </div>
  );
}
