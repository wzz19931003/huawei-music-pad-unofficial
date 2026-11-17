import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdatePanel } from './UpdatePanel';
import type { UpdateState } from '../shared/types';
import { EventEmitter } from 'node:events';
import { createUpdateManager } from '../main/update-manager.mjs';
import { toUpdateView } from '../main/update-view.mjs';

const render = (status: UpdateState['status'], extra = {}) => renderToStaticMarkup(<UpdatePanel state={{ status, currentVersion: '0.1.1', message: '', ...extra }} onCheck={vi.fn()} onDownload={vi.fn()} onInstall={vi.fn()} />);

describe('real update state presentation', () => {
  it('renders actual sanitized transport notes without making remote resources or automatic downloads', async () => {
    const emitter = new EventEmitter();
    const updater = Object.assign(emitter, {
      autoDownload: true, autoInstallOnAppQuit: true, allowDowngrade: true,
      setFeedURL: vi.fn(),
      checkForUpdates: async () => {
        emitter.emit('update-available', {
          version: '0.2.0', files: [{ url: 'https://private.invalid/setup?token=secret-token' }],
          releaseNotes: '<h2>新增</h2><ul><li>真实队列筛选 &amp; 快捷搜索</li></ul><img src="https://tracker.invalid/pixel"><script>hidden-script()</script>',
        });
      },
      downloadUpdate: vi.fn(async () => []), quitAndInstall: vi.fn(),
    });
    const manager = createUpdateManager({ updater, currentVersion: '0.1.1', packaged: true,
      source: { provider: 'github', owner: 'wzz19931003', repo: 'huawei-music-pad-unofficial', releaseType: 'release' },
    });
    try {
      const state = toUpdateView(await manager.check()) as UpdateState;
      const html = renderToStaticMarkup(<UpdatePanel state={state} onCheck={vi.fn()} onDownload={vi.fn()} onInstall={vi.fn()} />);
      expect(html).toContain('<h3>版本 0.2.0</h3>');
      expect(html).toContain('<h4>新增</h4>');
      expect(html).toContain('<li>真实队列筛选 &amp; 快捷搜索</li>');
      expect(html).not.toMatch(/tracker|hidden-script|secret-token|<img|<script|<a\s/);
      expect(updater.downloadUpdate).not.toHaveBeenCalled();
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    } finally { manager.dispose(); }
  });
  it('shows the actual candidate version and release text without replacing update controls', () => {
    const html = render('available', { version: '0.2.0', releaseNotes: [
      { version: '0.2.0', sections: [{ kind: 'text', items: ['修正播放队列顺序。'] }] },
    ] });
    expect(html).toContain('aria-label="更新内容"');
    expect(html).toContain('版本 0.2.0');
    expect(html).toContain('修正播放队列顺序。');
    expect(html).toContain('下载更新');
  });
  it('labels only source-supported change groups and keeps ungrouped text honest', () => {
    const html = render('available', { version: '0.2.0', releaseNotes: [{ version: '0.2.0', sections: [
      { kind: 'added', items: ['队列筛选'] }, { kind: 'improved', items: ['列表滚动'] },
      { kind: 'fixed', items: ['播放顺序'] }, { kind: 'text', items: ['维护说明，保留旧设置。'] },
    ] }] });
    expect(html).toContain('<h4>新增</h4>');
    expect(html).toContain('<h4>优化</h4>');
    expect(html).toContain('<h4>修复</h4>');
    expect(html).toContain('<li>队列筛选</li>');
    expect(html).toContain('<p>维护说明，保留旧设置。</p>');
    const plain = render('available', { version: '0.2.0', releaseNotes: [{ version: '0.2.0', sections: [{ kind: 'text', items: ['维护版本。'] }] }] });
    expect(plain).not.toContain('<h4>');
  });
  it('explicitly reports missing notes in old DTOs without blocking a valid update', () => {
    const html = render('available', { version: '0.2.0' });
    expect(html).toContain('版本 0.2.0');
    expect(html).toContain('此版本暂无可显示的更新内容。');
    expect(html).toContain('下载更新');
    expect(render('idle')).not.toContain('此版本暂无');
  });
  it('discloses shortened content with update actions outside the note region', () => {
    const html = render('available', { version: '0.2.0', releaseNotesTruncated: true,
      releaseNotes: [{ version: '0.2.0', sections: [{ kind: 'text', items: ['实际内容…'] }] }],
    });
    expect(html).toContain('仅显示部分更新内容。');
    expect(html).toContain('实际内容…');
    expect(html).toMatch(/仅显示部分更新内容。<\/p><\/section><div class="pad-update-buttons">/);
  });
  it('does not present older changelog entries as notes for a candidate that has none', () => {
    const releaseNotes = [{ version: '0.1.2', sections: [{ kind: 'text', items: ['旧版本的真实说明'] }] }];
    const html = render('available', { version: '0.2.0', releaseNotes });
    expect(html).toContain('<h3>版本 0.2.0</h3><p>此版本暂无可显示的更新内容。</p>');
    expect(html).toContain('<h3>版本 0.1.2</h3>');
    expect(html).toContain('旧版本的真实说明');
    expect(render('checking', { version: '0.2.0', releaseNotes })).not.toContain('旧版本的真实说明');
    expect(render('error', { version: '0.2.0', releaseNotes, errorCode: 'UPDATE_CHECK_FAILED' })).not.toContain('旧版本的真实说明');
  });
  it('shows a local action error separately without hiding the verified restart control', () => {
    const props = {
      state: { status: 'downloaded', currentVersion: '0.1.1', version: '0.2.0', message: '更新包已验证',
        releaseNotes: [{ version: '0.2.0', sections: [{ kind: 'fixed', items: ['已验证版本的真实说明'] }] }],
      } as UpdateState,
      actionError: '播放进度未能保存，请重试。',
      onCheck: vi.fn(), onDownload: vi.fn(), onInstall: vi.fn(),
    };
    const html = renderToStaticMarkup(<UpdatePanel {...props} />);
    expect(html).toContain('data-update-status="downloaded"');
    expect(html).toContain('重启并更新');
    expect(html).toContain('role="alert"');
    expect(html).toContain(props.actionError);
    expect(html).toContain('已验证版本的真实说明');
  });
  it('disables update controls during renderer preflight without discarding native state', () => {
    const props = {
      state: { status: 'downloaded', currentVersion: '0.1.1', message: '更新包已验证' } as UpdateState,
      busy: true,
      onCheck: vi.fn(), onDownload: vi.fn(), onInstall: vi.fn(),
    };
    const html = renderToStaticMarkup(<UpdatePanel {...props} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>重启并更新<\/button>/);
    expect(html).toContain('data-update-status="downloaded"');
  });
  it('offers only the transport-authorized retry after download or install failure', () => {
    expect(render('error', { errorCode: 'UPDATE_INSTALL_FAILED', version: '0.2.0' })).toContain('重试安装');
    expect(render('error', { errorCode: 'UPDATE_DOWNLOAD_FAILED', version: '0.2.0' })).toContain('重试下载');
    expect(render('error', { errorCode: 'UPDATE_CHECK_FAILED' })).not.toContain('重试安装');
  });
  it('provides update controls and provenance on a dedicated about screen', async () => {
    const mod = await import('./UpdatePanel') as unknown as Record<string, (props: any) => React.JSX.Element>;
    expect(mod.AboutScreen).toBeTypeOf('function');
    const html = renderToStaticMarkup(mod.AboutScreen({ state: { status: 'idle', currentVersion: '0.1.1', message: '尚未检查更新' }, onCheck: vi.fn(), onDownload: vi.fn(), onInstall: vi.fn() }));
    expect(html).toContain('检查更新');
    expect(html).toContain('0.1.1');
    expect(html).toContain('Daydreamcgy/huawei-music-win');
    expect(html).toContain('talongao/huawei-music-desktop');
    expect(html).toContain('非官方');
  });
  it('shows download progress and only offers restart after verified download', () => {
    const loading = render('downloading', { progress: 42, version: '0.2.0' });
    expect(loading).toContain('aria-valuenow="42"');
    expect(loading).not.toContain('重启并更新');
    const ready = render('downloaded', { version: '0.2.0' });
    expect(ready).toContain('重启并更新');
    expect(ready).toContain('校验');
  });
  it('offers downloading only for a discovered release', () => {
    const html = render('available', { version: '0.2.0' });
    expect(html).toContain('下载更新');
    expect(html).toContain('0.2.0');
    expect(html).not.toContain('重启并更新');
  });
  it('never calls an unconfigured build the latest version', () => {
    const html = render('unconfigured', { message: '尚未配置更新源' });
    expect(html).toContain('尚未配置更新源');
    expect(html).not.toContain('已是最新版本');
    expect(html).not.toContain('重启并更新');
  });
});
