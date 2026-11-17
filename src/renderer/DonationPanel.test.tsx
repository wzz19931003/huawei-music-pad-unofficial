import { Children, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const modulePath = './DonationPanel';
const codes = { wechat: '/src/renderer/assets/donation-wechat.png', alipay: '/src/renderer/assets/donation-alipay.png' };
const load = async () => import(/* @vite-ignore */ modulePath).catch(() => ({})) as Promise<Record<string, any>>;

describe('voluntary maintainer support', () => {
  it('binds both methods to the newly supplied local payment images', async () => {
    const assetsPath = './donation-assets';
    const assets = await import(/* @vite-ignore */ assetsPath).catch(() => ({})) as Record<string, any>;
    expect(assets.donationCodes, 'the support page must use the real bundled image pair').toBeDefined();
    expect(Object.keys(assets.donationCodes).sort()).toEqual(['alipay', 'wechat']);
    expect(assets.donationCodes.wechat).toContain('donation-wechat');
    expect(assets.donationCodes.alipay).toContain('donation-alipay');
    for (const source of Object.values(assets.donationCodes)) expect(source).not.toMatch(/^https?:|^wxp:/i);
  });
  it('shows the chosen real asset without payment, rewards or fake-code fallback', async () => {
    const lib = await load();
    expect(lib.DonationPanel, 'a real support panel must exist before wiring the Mine route').toBeTypeOf('function');
    for (const method of ['wechat', 'alipay'] as const) {
      const html = renderToStaticMarkup(<lib.DonationPanel codes={codes} method={method} onMethodChange={vi.fn()} />);
      expect(html).toContain('请维护者喝杯咖啡');
      expect(html).toContain('打赏完全自愿，不影响任何功能使用');
      expect(html).toContain('role="tablist"');
      expect((html.match(/aria-selected="true"/g) ?? [])).toHaveLength(1);
      expect(html).toContain(`src="${codes[method]}"`);
      expect(html).not.toContain(`src="${codes[method === 'wechat' ? 'alipay' : 'wechat']}"`);
      expect(html).not.toMatch(/<iframe|<form|href="https?:|支付成功/);
      expect(html).toContain('不会解锁会员、音源或其他功能');
    }
  });

  it('switches only the selected method and renders an honest image failure', async () => {
    const { DonationPanel } = await load();
    expect(DonationPanel).toBeTypeOf('function');
    const onMethodChange = vi.fn();
    const tree = DonationPanel({ codes, method: 'wechat', onMethodChange });
    const all: ReactElement<any>[] = [];
    const visit = (node: any) => {
      if (!isValidElement(node)) return;
      all.push(node as ReactElement<any>);
      Children.forEach((node.props as any).children, visit);
    };
    visit(tree);
    const tabs = all.filter(node => node.props.role === 'tab');
    expect(tabs).toHaveLength(2);
    tabs[1].props.onClick();
    expect(onMethodChange).toHaveBeenCalledExactlyOnceWith('alipay');
    onMethodChange.mockClear();
    const event = { key: 'ArrowRight', preventDefault: vi.fn(), currentTarget: { parentElement: null } };
    expect(tabs[0].props.onKeyDown, 'method tabs need a real keyboard handler').toBeTypeOf('function');
    tabs[0].props.onKeyDown(event);
    expect(onMethodChange).toHaveBeenCalledExactlyOnceWith('alipay');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(<DonationPanel codes={codes} method="wechat" onMethodChange={vi.fn()} unavailable />);
    expect(html).toContain('收款码暂时无法显示');
    expect(html).not.toContain('<img');
  });
});
