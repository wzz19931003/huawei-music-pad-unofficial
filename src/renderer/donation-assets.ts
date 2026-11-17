import wechat from './assets/donation-wechat.png';
import alipay from './assets/donation-alipay.png';
import type { DonationCodes } from './DonationPanel';

/** User-supplied, explicitly approved for installer and public-source distribution. */
export const donationCodes: DonationCodes = Object.freeze({ wechat, alipay });
