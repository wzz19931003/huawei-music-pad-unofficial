import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { APP_BRAND_LABEL, APP_DISPLAY_NAME } from '../shared/app-name.mjs';
import { AboutScreen, UpdatePanel } from './UpdatePanel';
import { SettingsScreen } from './pages';
import { LoginScreen } from './screens';

describe('approved Wmusic display branding', () => {
  it('keeps the unofficial identity in both shared product labels', () => {
    expect(APP_DISPLAY_NAME).toBe('Wmusic（非官方）');
    expect(APP_BRAND_LABEL).toBe('Wmusic · 非官方');
  });

  it('uses the shared display name on About without relabeling upstream provenance', () => {
    const html = renderToStaticMarkup(<AboutScreen
      state={{ status: 'idle', currentVersion: '0.2.0', message: '尚未检查更新' }}
      onCheck={vi.fn()} onDownload={vi.fn()} onInstall={vi.fn()} />);
    expect(html).toContain(`<h2>${APP_DISPLAY_NAME}</h2>`);
    expect(html).not.toContain('华为音乐（非官方）');
    expect(html).not.toContain('Pad 横屏客户端');
    expect(html).toContain('Windows 桌面客户端');
    expect(html).toContain('wzz19931003/huawei-music-pad-unofficial');
    expect(html).toContain('Daydreamcgy/huawei-music-win');
    expect(html).toContain('talongao/huawei-music-desktop');
    expect(html).toContain('与华为无隶属、合作或授权关系。音乐与会员权益由你的华为账号决定');
    expect(html).toContain('更新来自本项目的 GitHub Releases，不来自华为或上游作者。当前构建未签名。');
  });

  it('identifies Wmusic as the product being updated while preserving the supplied version', () => {
    const html = renderToStaticMarkup(<UpdatePanel
      state={{ status: 'idle', currentVersion: '2.3.4', message: '尚未检查更新' }}
      onCheck={vi.fn()} onDownload={vi.fn()} onInstall={vi.fn()} />);
    expect(html).toContain(`<p>${APP_DISPLAY_NAME} · 当前版本 2.3.4</p>`);
    expect(html).toContain('检查更新');
  });

  it('uses the shared product label in Settings but retains Huawei service and OAuth references', () => {
    const noop = vi.fn();
    const html = renderToStaticMarkup(<SettingsScreen auth={null} settings={null} cache={null}
      onUpdate={noop} onCloseBehavior={noop} onLogout={noop} onLogin={noop} onClearCache={noop} onQuit={noop}
      onCheckUpdates={noop} onOpenAbout={noop} version="2.3.4" />);
    expect(html).toContain(APP_DISPLAY_NAME);
    expect(html).not.toContain('华为音乐 · 非官方客户端');
    expect(html).toContain('登录华为账号');
    expect(html).toContain('播放时同步到华为音乐的历史记录');
    expect(html).toContain('音乐与账号数据来自华为音乐官方接口；客户端不代理、不分发任何内容，OAuth 身份属于华为官方应用。');
    expect(html).toContain('talongao/huawei-music-desktop');
  });

  it('greets users as Wmusic while leaving the Huawei login identity intact', () => {
    const html = renderToStaticMarkup(<LoginScreen pending={false} onLogin={vi.fn()} />);
    expect(html).toContain(`<h1>${APP_DISPLAY_NAME}</h1>`);
    expect(html).not.toContain('<h1>华为音乐</h1>');
    expect(html).toContain('使用华为账号登录');
    expect(html).toContain('用华为账号登录，读取你的收藏与歌单。');
    expect(html).toContain('登录在官方页面上完成，客户端不接触你的密码。');
    expect(html).toContain('非官方客户端，与华为无隶属关系，不提供任何音源。');
  });
});
