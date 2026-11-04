import { BUCKET } from './mongodb.js';

// This release intentionally cannot contact payment or SMS providers, even if
// old .env files or hosting settings still contain live credentials.
const fixed = { BUCKET, PAYMENTS_MODE: 'mock', SMS_MODE: 'off', SMS_REQUIRED: 'false', ADMIN_2FA_REQUIRED: 'false', REMINDER_SMS_READY: 'false', PAYMENT_CALLBACKS_READY: 'false', SUBSCRIBE_PAYMENTS_READY: 'false', DEMO_MODE: 'true', IMAGE_REVIEW_REQUIRED: 'true' };
export const env = new Proxy(fixed, {
  get(target, name) {
    if (name in target) return target[name];
    if (/^(TWILIO_|PAYME_|CLICK_|ADMIN_TOTP_SECRET)/.test(String(name))) return undefined;
    return process.env[name];
  },
});
