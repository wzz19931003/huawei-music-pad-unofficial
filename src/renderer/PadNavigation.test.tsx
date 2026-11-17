import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PadNavigation } from './PadNavigation';

function buttons(node: ReactNode): ReactElement<any>[] {
  if (!isValidElement<any>(node)) return [];
  return [...(node.type === 'button' ? [node] : []), ...Children.toArray((node.props as { children?: ReactNode }).children).flatMap(buttons)];
}

describe('Windows desktop navigation', () => {
  it('retains the five routes and exposes existing library routes in a desktop sidebar', () => {
    const onNavigate = vi.fn();
    const onOpenLibrary = vi.fn();
    const tree = PadNavigation({ active: 'home', activeRoute: 'home', onNavigate, onOpenLibrary } as any);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('desktop-sidebar');
    expect(html).toContain('aria-label="音乐库导航"');
    const items = buttons(tree);
    expect(items.map(item => item.props['aria-label'] ?? Children.toArray(item.props.children).at(-1))).toHaveLength(9);
    for (const item of items) item.props.onClick();
    expect(onNavigate.mock.calls.flat()).toEqual(['home', 'hall', 'player', 'cafe', 'mine']);
    expect(onOpenLibrary.mock.calls.flat()).toEqual(['favorites', 'playlists', 'history', 'settings']);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
