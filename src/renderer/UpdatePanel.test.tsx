import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdatePanel } from './UpdatePanel';
import type { UpdateState } from '../shared/types';

const render = (status: UpdateState['status'], extra = {}) => renderToStaticMarkup(<UpdatePanel state={{ status, currentVersion: '0.1.1', message: '', ...extra }} onCheck={vi.fn()} onDownload={vi.fn()} onInstall={vi.fn()} />);

describe('real update state presentation', () => {
  it('shows a local action error separately without hiding the verified restart control', () => {
    const props = {
      state: { status: 'downloaded', currentVersion: '0.1.1', message: '更新包已验证' } as UpdateState,
      actionError: '播放进度未能保存，请重试。',
      onCheck: vi.fn(), onDownload: vi.fn(), onInstall: vi.fn(),
    };
    const html = renderToStaticMarkup(<UpdatePanel {...props} />);
    expect(html).toContain('data-update-status="downloaded"');
    expect(html).toContain('重启并更新');
    expect(html).toContain('role="alert"');
    expect(html).toContain(props.actionError);
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
