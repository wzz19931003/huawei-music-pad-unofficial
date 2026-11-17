import { afterEach, describe, expect, it, vi } from 'vitest';

const modulePath = './desktop-controls.ts';
const callbacks = () => ({ toggle: vi.fn(), next: vi.fn(), previous: vi.fn() });
afterEach(() => vi.unstubAllGlobals());

describe('desktop keyboard song menu entry', () => {
  it('routes Shift+F10 and the context-menu key through the existing row context handler only', async () => {
    const library = await import(/* @vite-ignore */ modulePath) as Record<string, any>;
    expect(library.openKeyboardSongMenu).toBeTypeOf('function');
    vi.stubGlobal('MouseEvent', class { constructor(public type: string, public init: object) {} });
    const row = { getBoundingClientRect: () => ({ left: 30, top: 40, width: 200, height: 50 }), dispatchEvent: vi.fn() };
    const preventDefault = vi.fn(); const stopPropagation = vi.fn();
    const event = { key: 'F10', shiftKey: true, preventDefault, stopPropagation, target: { closest: () => row, dispatchEvent: row.dispatchEvent } };
    library.openKeyboardSongMenu(event);
    expect(row.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'contextmenu', init: expect.objectContaining({ bubbles: true, clientX: 42, clientY: 90 }) }));
    library.openKeyboardSongMenu({ ...event, key: 'ContextMenu', shiftKey: false });
    expect(row.dispatchEvent).toHaveBeenCalledTimes(2);
    library.openKeyboardSongMenu({ ...event, key: 'F10', shiftKey: false });
    library.openKeyboardSongMenu({ ...event, target: { closest: () => null } });
    expect(row.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });
});

describe('desktop keyboard ownership', () => {
  it('does not steal Space/Escape already handled by a control, edit field, menu or held key', async () => {
    const library = await import(/* @vite-ignore */ modulePath) as Record<string, any>;
    expect(library.connectDesktopKeyboard).toBeTypeOf('function');
    let key!: (event: any) => void;
    const addEventListener = vi.fn((_name, handler) => { key = handler; });
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    const player = callbacks();
    const close = vi.fn();
    const dispose = library.connectDesktopKeyboard({ current: player }, close);
    const event = (extra: object = {}) => ({ key: ' ', code: 'Space', defaultPrevented: false, repeat: false,
      preventDefault: vi.fn(), target: { closest: () => null }, ...extra });
    for (const extra of [{ defaultPrevented: true }, { repeat: true }, { ctrlKey: true },
      { target: { closest: () => ({}) } }]) key(event(extra));
    expect(player.toggle).not.toHaveBeenCalled();
    const space = event(); key(space);
    expect(player.toggle).toHaveBeenCalledOnce(); expect(space.preventDefault).toHaveBeenCalledOnce();
    key(event({ key: 'Escape', defaultPrevented: true })); expect(close).not.toHaveBeenCalled();
    key(event({ key: 'Escape' })); expect(close).toHaveBeenCalledOnce();
    dispose(); expect(removeEventListener).toHaveBeenCalledExactlyOnceWith('keydown', key);
  });
});

describe('desktop native command subscription', () => {
  it('subscribes once, dispatches only supported commands to the latest player, and unsubscribes', async () => {
    const library = await import(/* @vite-ignore */ modulePath).catch(() => ({})) as Record<string, any>;
    expect(library.connectDesktopCommands, 'native tray/media-key consumer must exist').toBeTypeOf('function');
    let listener!: (command: string) => void;
    const unsubscribe = vi.fn();
    const onCommand = vi.fn(fn => { listener = fn; return unsubscribe; });
    vi.stubGlobal('window', { desktop: { player: { onCommand } } });
    const old = callbacks();
    const latest = callbacks();
    const ref = { current: old };
    const dispose = library.connectDesktopCommands(ref);
    ref.current = latest;
    for (const command of ['play-pause', 'next', 'previous', 'constructor', 'unrecognized']) listener(command);
    expect(onCommand).toHaveBeenCalledOnce();
    expect(old.toggle).not.toHaveBeenCalled();
    for (const fn of Object.values(latest)) expect(fn).toHaveBeenCalledExactlyOnceWith();
    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
