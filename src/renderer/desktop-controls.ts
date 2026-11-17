import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

type Transport = { toggle: () => void; next: () => void; previous: () => void };

/** Reuse each existing song row's handler; never infer a track from its title. */
export function openKeyboardSongMenu(event: ReactKeyboardEvent) {
  if (event.defaultPrevented || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return;
  const target = event.target as HTMLElement;
  const row = target.closest?.('.track-row, .pad-song-row, .pad-track-tile');
  if (!row) return;
  event.preventDefault(); event.stopPropagation();
  const rect = row.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + 12, clientY: rect.top + rect.height }));
}

/** Native activation/range/menu keys belong to their focused control. */
export function connectDesktopKeyboard(player: RefObject<Transport>, onEscape: () => void) {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat) return;
    if (event.key === 'Escape') { onEscape(); return; }
    if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, button, a, summary, [role="button"], [role="menu"], [role="slider"], [contenteditable]:not([contenteditable="false"])')) return;
    event.preventDefault();
    player.current.toggle();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** Existing preload whitelist only; no native protocol or playback implementation. */
export function connectDesktopCommands(player: RefObject<Transport>) {
  return window.desktop.player.onCommand(command => {
    switch (command) {
      case 'play-pause': player.current.toggle(); break;
      case 'next': player.current.next(); break;
      case 'previous': player.current.previous(); break;
    }
  });
}
