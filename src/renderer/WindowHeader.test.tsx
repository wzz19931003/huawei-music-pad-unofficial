import { Children, isValidElement, type JSX, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WindowHeader } from './App';
import { APP_BRAND_LABEL, APP_DISPLAY_NAME } from '../shared/app-name.mjs';
import logo from './assets/app-icon.png';

describe('Wmusic window header', () => {
  it('renders the shared brand and selected logo in the actual window header, without the legacy badge', () => {
    const html = renderToStaticMarkup(<WindowHeader maximized={false} />);
    expect(html).toContain('<header class="titlebar pad-windowbar">');
    expect(html).toContain('class="window-brand"');
    expect(html).toContain(`title="${APP_DISPLAY_NAME}"`);
    expect(html).toContain(APP_BRAND_LABEL);
    expect(html).toContain(`src="${logo}"`);
    expect(html).toContain('class="window-brand-logo"');
    expect(html).not.toContain('华为音乐（非官方）');
    expect(html).not.toContain('Pad 布局');
    expect(html).not.toContain('pad-unofficial');
    for (const label of ['最小化', '最大化', '关闭']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    const source = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<WindowHeader maximized={maximized} />');
    expect(source).not.toContain('pad-unofficial');
  });

  it('anchors the brand to the full-width header while reserving non-drag controls on the right', () => {
    const css = readFileSync(new URL('./pad.css', import.meta.url), 'utf8');
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
    };
    const bar = rule('.pad-app .pad-windowbar');
    const brand = rule('.window-brand');
    expect(bar).toMatch(/position:\s*fixed/);
    expect(bar).toMatch(/inset:\s*0 0 auto/);
    expect(bar).toMatch(/-webkit-app-region:\s*drag/);
    expect(brand).toMatch(/position:\s*absolute/);
    expect(brand).toMatch(/left:\s*50%/);
    expect(brand).toMatch(/transform:\s*translateX\(-50%\)/);
    expect(brand).toMatch(/pointer-events:\s*none/);
    expect(brand).toMatch(/-webkit-app-region:\s*drag/);
    expect(rule('.pad-app .titlebar')).toMatch(/justify-content:\s*flex-end/);
    expect(rule('.pad-app .window-controls')).toMatch(/-webkit-app-region:\s*no-drag/);
    expect(rule('.pad-app .window-button')).toMatch(/-webkit-app-region:\s*no-drag/);
    expect(rule('.window-brand-logo')).toMatch(/object-fit:\s*contain/);
    expect(css).not.toContain('.pad-unofficial');
  });

  it.each([false, true])('preserves native window-button commands when maximized=%s', maximized => {
    const native = {
      minimize: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('window', { desktop: { window: native } });
    try {
      const controls = Children.toArray(WindowHeader({ maximized }).props.children)
        .find(node => isValidElement(node) && typeof node.type === 'function') as ReactElement<
          { maximized: boolean }, (props: { maximized: boolean }) => JSX.Element>;
      const buttons = Children.toArray(controls.type(controls.props).props.children) as ReactElement<{
        onClick: () => void; 'aria-label': string;
      }>[];
      expect(buttons.map(button => button.props['aria-label'])).toEqual([
        '最小化', maximized ? '还原' : '最大化', '关闭',
      ]);
      for (const button of buttons) {
        expect(button.type).toBe('button');
        button.props.onClick();
      }
      expect(native.minimize).toHaveBeenCalledExactlyOnceWith();
      expect(native.toggleMaximize).toHaveBeenCalledExactlyOnceWith();
      expect(native.close).toHaveBeenCalledExactlyOnceWith();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
