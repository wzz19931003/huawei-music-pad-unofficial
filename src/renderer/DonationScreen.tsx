import { useState } from 'react';
import { DonationPanel, type DonationMethod } from './DonationPanel';
import { donationCodes } from './donation-assets';

/** Voluntary support stays available without a Huawei account or payment integration. */
export function DonationScreen() {
  const [method, setMethod] = useState<DonationMethod>('wechat');
  const [unavailable, setUnavailable] = useState(false);
  return <div className="screen donation-screen">
    <DonationPanel codes={donationCodes} method={method} unavailable={unavailable}
      onMethodChange={next => { setMethod(next); setUnavailable(false); }}
      onImageError={() => setUnavailable(true)} />
  </div>;
}
