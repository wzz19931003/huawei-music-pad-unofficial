import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../shared/types';
import type { Player } from './PlayerView';
const host = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => ({ current: initial }), useEffect: (fn: () => void) => { host.effects.push(fn); },
}));
import { QueuePanel, TrackMenu } from './QueuePanel';
afterEach(() => { host.effects = []; vi.unstubAllGlobals(); });
const track = { id: 'keyboard-song', title: '键盘菜单曲目', artists: [], available: true };

type QueuePlayer = Pick<Player, 'queue' | 'index' | 'current' | 'playing' | 'removeAt' | 'jumpTo' | 'clearUpcoming'>;
const queueTracks: Track[] = ['甲', '乙', '丙'].map((title, index) => ({
  ...track, id: `queue-${index}`, title: `队列曲目${title}`,
}));
const queuePlayer = (queue: Track[], index: number): QueuePlayer => ({
  queue, index, current: queue[index], playing: true,
  removeAt: vi.fn(), jumpTo: vi.fn(), clearUpcoming: vi.fn(),
});
function elements(node: ReactNode): ReactElement<any>[] {
  return Children.toArray(node).filter(isValidElement).flatMap(child => {
    const element = child as ReactElement<any>;
    return [element, ...elements(element.props.children)];
  });
}
function renderQueue(player: QueuePlayer, onClose = vi.fn()) {
  let tree!: ReactElement<any>;
  function Subject() {
    tree = QueuePanel({ player: player as Player, open: true, onClose })!;
    return tree;
  }
  // Render the real panel and rows, then exercise their actual button handlers.
  renderToStaticMarkup(<Subject />);
  return {
    tree,
    rowFor(track: Track) {
      const row = elements(tree).find(element => element.props.track === track)!;
      expect(row, 'the queue must render the requested track').toBeDefined();
      return (row.type as (props: any) => ReactElement<any>)(row.props);
    },
  };
}
function removeButton(row: ReactElement<any>) {
  const button = elements(row).find(element => element.type === 'button' && element.props['aria-label'] === '从队列移除');
  expect(button, 'the queue row must expose an accessible removal button').toBeDefined();
  expect(button!.props.type).toBe('button');
  expect(button!.props.disabled).not.toBe(true);
  expect([true, 'true']).not.toContain(button!.props['aria-disabled']);
  expect(button!.props.tabIndex ?? 0).toBeGreaterThanOrEqual(0);
  expect(renderToStaticMarkup(row)).toContain('aria-label="从队列移除"');
  return button!;
}

describe('queue row removal', () => {
  it.each([
    { queue: [queueTracks[0]], index: 0 },
    { queue: queueTracks, index: 1 },
    { queue: queueTracks, index: 2 },
  ])('exposes an enabled current-row removal control at queue index $index', ({ queue, index }) => {
    const player = queuePlayer(queue, index);
    const { rowFor } = renderQueue(player);
    removeButton(rowFor(player.current!)).props.onClick();
    expect(player.removeAt).toHaveBeenCalledExactlyOnceWith(index);
    expect(player.jumpTo).not.toHaveBeenCalled();
    expect(player.clearUpcoming).not.toHaveBeenCalled();
  });

  it.each([0, 1])('removes played-row index %i using its original queue index even with duplicate IDs', originalIndex => {
    const queue = [
      { ...track, id: 'duplicate', title: '已播放曲目甲' },
      { ...track, id: 'duplicate', title: '已播放曲目乙' },
      ...queueTracks.slice(1),
    ];
    const player = queuePlayer(queue, 2);
    const { rowFor } = renderQueue(player);
    removeButton(rowFor(queue[originalIndex])).props.onClick();
    expect(player.removeAt).toHaveBeenCalledExactlyOnceWith(originalIndex);
    expect(player.jumpTo).not.toHaveBeenCalled();
    expect(player.clearUpcoming).not.toHaveBeenCalled();
  });
});

describe('existing queue controls', () => {
  it.each([
    { index: 0, originalIndex: 1 },
    { index: 0, originalIndex: 2 },
    { index: 1, originalIndex: 2 },
  ])('keeps upcoming removal mapped to index $originalIndex when current is $index', ({ index, originalIndex }) => {
    const player = queuePlayer(queueTracks, index);
    const { rowFor } = renderQueue(player);
    removeButton(rowFor(queueTracks[originalIndex])).props.onClick();
    expect(player.removeAt).toHaveBeenCalledExactlyOnceWith(originalIndex);
    expect(player.jumpTo).not.toHaveBeenCalled();
  });

  it('keeps row jumps separate from removal and preserves clear-upcoming', () => {
    const player = queuePlayer(queueTracks, 1);
    const { tree, rowFor } = renderQueue(player);
    for (const track of queueTracks) {
      const jump = elements(rowFor(track)).find(element => element.type === 'button' && element.props.className === 'queue-row-main')!;
      jump.props.onClick();
    }
    expect(player.jumpTo).toHaveBeenCalledTimes(2);
    expect(player.jumpTo).toHaveBeenNthCalledWith(1, 0);
    expect(player.jumpTo).toHaveBeenNthCalledWith(2, 2);
    expect(player.removeAt).not.toHaveBeenCalled();
    const clear = elements(tree).find(element => element.type === 'button' && element.props.children === '清空待播')!;
    expect(clear.props.disabled).toBe(false);
    clear.props.onClick();
    expect(player.clearUpcoming).toHaveBeenCalledExactlyOnceWith();
  });

  it('focuses Close on entry and restores the opener on Escape', () => {
    const origin = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal('document', { activeElement: origin });
    const onClose = vi.fn();
    const { tree } = renderQueue(queuePlayer(queueTracks, 1), onClose);
    const close = elements(tree).find(element => element.props['aria-label'] === '关闭队列')!;
    const scroll = elements(tree).find(element => element.props.className === 'queue-scroll')!;
    const closeNode = { focus: vi.fn() };
    const scrollNode = { scrollTo: vi.fn() };
    close.props.ref.current = closeNode;
    scroll.props.ref.current = scrollNode;
    host.effects.splice(0).forEach(effect => effect());
    expect(closeNode.focus).toHaveBeenCalledOnce();
    expect(scrollNode.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
    expect(tree.props.inert).toBe(false);
    const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    tree.props.onKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(origin.focus).toHaveBeenCalledOnce();
  });
});

describe('song menu keyboard interaction', () => {
  it('focuses the first action, wraps arrows/Home/End, and restores the origin on Escape', () => {
    const onClose = vi.fn(); const origin = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal('window', { innerWidth: 900, innerHeight: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const tree = TrackMenu({ target: { track, x: -2, y: -3, returnFocus: origin } as any,
      onClose, onPlayNow: vi.fn(), onPlayNext: vi.fn(), onAddToQueue: vi.fn() });
    expect(tree.props['aria-label']).toBe('歌曲操作：键盘菜单曲目');
    expect(tree.props.style.left).toBeGreaterThanOrEqual(12);
    const items = Children.toArray(tree.props.children).filter(isValidElement) as ReactElement<any>[];
    expect(items).toHaveLength(3);
    expect(items.every(item => item.props.role === 'menuitem' && item.props.tabIndex === -1)).toBe(true);
    const nodes = items.map(() => ({ focus: vi.fn() }));
    const menu = { querySelectorAll: () => nodes };
    vi.stubGlobal('document', { activeElement: nodes[0] });
    // Execute the real key handler with a deterministic DOM boundary.
    const press = (key: string) => {
      const event = { key, currentTarget: menu, preventDefault: vi.fn(), stopPropagation: vi.fn() };
      tree.props.onKeyDown(event as any); return event;
    };
    expect(tree.props.ref).toBeDefined();
    tree.props.ref.current = menu;
    host.effects.forEach(effect => effect());
    expect(nodes[0].focus).toHaveBeenCalled();
    press('ArrowUp'); expect(nodes[2].focus).toHaveBeenCalledOnce();
    press('ArrowDown'); expect(nodes[1].focus).toHaveBeenCalledOnce();
    press('End'); expect(nodes[2].focus).toHaveBeenCalledTimes(2);
    press('Home'); expect(nodes[0].focus).toHaveBeenCalledTimes(2);
    const escape = press('Escape');
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(escape.stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce(); expect(origin.focus).toHaveBeenCalledOnce();
  });
});
