import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsScreen } from './pages';

const noop = vi.fn();
describe('settings update entry', () => {
  it('shows a working update entry and the actual supplied version, not hardcoded 0.1.0', () => {
    const html = renderToStaticMarkup(<SettingsScreen auth={null} settings={null} cache={null}
      onUpdate={noop} onCloseBehavior={noop} onLogout={noop} onLogin={noop} onClearCache={noop} onQuit={noop}
      onCheckUpdates={noop} onOpenAbout={noop} version="0.1.1" />);
    expect(html).toContain('检查更新');
    expect(html).toContain('0.1.1');
    expect(html).not.toContain('0.1.0');
    expect(html).toContain('aria-label="关于"');
  });
});
