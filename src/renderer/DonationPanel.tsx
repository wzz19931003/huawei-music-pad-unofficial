import type { KeyboardEvent } from 'react';
import './donation.css';

export type DonationMethod = 'wechat' | 'alipay';
export type DonationCodes = Record<DonationMethod, string>;
const methods = [{ id: 'wechat', label: '微信' }, { id: 'alipay', label: '支付宝' }] as const;

/** Sources are the maintainer's approved bundled assets, never generated payment codes. */
export function DonationPanel({ codes, method, onMethodChange, unavailable = false, onImageError }: {
  codes: DonationCodes;
  method: DonationMethod;
  onMethodChange: (method: DonationMethod) => void;
  unavailable?: boolean;
  onImageError?: () => void;
}) {
  function handleMethodKey(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let target: number;
    switch (event.key) {
      case 'Home': target = 0; break;
      case 'End': target = methods.length - 1; break;
      case 'ArrowLeft': target = (current + methods.length - 1) % methods.length; break;
      case 'ArrowRight': target = (current + 1) % methods.length; break;
      default: return;
    }
    event.preventDefault();
    onMethodChange(methods[target].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }
  return <section className="donation-panel" aria-label="自愿支持维护者">
    <h2>请维护者喝杯咖啡</h2>
    <p className="donation-intro">如果 Wmusic 对你有帮助，欢迎支持后续开发与维护。</p>
    <p className="donation-voluntary">打赏完全自愿，不影响任何功能使用。</p>
    <div className="donation-methods" role="tablist" aria-label="选择打赏方式">
      {methods.map((item, index) => <button type="button" key={item.id} id={`donation-tab-${item.id}`} role="tab"
        aria-selected={method === item.id} tabIndex={method === item.id ? 0 : -1} aria-controls="donation-qr-panel"
        onClick={() => onMethodChange(item.id)} onKeyDown={event => handleMethodKey(event, index)}>{item.label}</button>)}
    </div>
    <div className="donation-qr-panel" id="donation-qr-panel" role="tabpanel" tabIndex={0} aria-labelledby={`donation-tab-${method}`}>
      {unavailable ? <p role="alert">收款码暂时无法显示，请稍后重试或切换打赏方式。</p>
        : <img src={codes[method]} alt={`${method === 'wechat' ? '微信' : '支付宝'}收款码`} onError={onImageError}
            onLoad={event => {
              const image = event.currentTarget;
              const ratio = image.ownerDocument.defaultView?.devicePixelRatio ?? 1;
              const physicalSize = image.naturalWidth / Math.max(1, ratio);
              // Avoid fractional resampling of dense, avatar-bearing QR artwork when 1:1 pixels fit.
              if (physicalSize <= Math.min(380, image.parentElement?.clientWidth ?? 300)) image.style.width = `${physicalSize}px`;
            }} />}
      <p>使用{method === 'wechat' ? '微信' : '支付宝'}扫码，自行确认收款方与金额。</p>
    </div>
    <p className="donation-footer">感谢你的支持。是否打赏、打赏多少，都由你决定；不会解锁会员、音源或其他功能。</p>
  </section>;
}
