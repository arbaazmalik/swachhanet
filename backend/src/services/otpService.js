const axios = require('axios');
const logger = require('../utils/logger');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// In-memory rate limiting and attempts tracker for OTP requests
const otpMetaStore = new Map(); // phone -> { lastSentAt, attempts, lockedUntil }

class DevelopmentProvider {
  async send(phone, otp) {
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) {
      const line = `[OTP-DEV] phone=${phone} otp=${otp}`;
      console.log(line);
      logger.info(line);
    }
    return { success: true, provider: 'dev' };
  }
}

class Fast2SmsProvider {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async send(phone, otp) {
    try {
      const digits = phone.replace(/\D/g, '').slice(-10);
      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        {
          variables_values: otp,
          route: 'otp',
          numbers: digits,
        },
        {
          headers: { authorization: this.apiKey },
          timeout: 10000,
        }
      );
      if (response.data?.return) {
        return { success: true, provider: 'fast2sms' };
      }
      logger.warn(`Fast2SMS send warning: ${JSON.stringify(response.data)}`);
      return { success: false, provider: 'fast2sms', error: response.data?.message };
    } catch (err) {
      logger.error(`Fast2SMS send error: ${err.message}`);
      return { success: false, provider: 'fast2sms', error: err.message };
    }
  }
}

class TwilioProvider {
  constructor(accountSid, authToken, fromNumber) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async send(phone, otp) {
    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', phone);
      params.append('From', this.fromNumber);
      params.append('Body', `Your SwachhaNet verification code is ${otp}. Valid for 10 minutes.`);

      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        params.toString(),
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );
      return { success: !!response.data?.sid, provider: 'twilio' };
    } catch (err) {
      logger.error(`Twilio send error: ${err.message}`);
      return { success: false, provider: 'twilio', error: err.message };
    }
  }
}

function resolveProvider() {
  const providerType = (process.env.OTP_PROVIDER || 'dev').toLowerCase();
  if (providerType === 'fast2sms' && process.env.OTP_API_KEY) {
    return new Fast2SmsProvider(process.env.OTP_API_KEY);
  }
  if (providerType === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return new TwilioProvider(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      process.env.TWILIO_FROM_NUMBER
    );
  }
  return new DevelopmentProvider();
}

const activeProvider = resolveProvider();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function checkCooldown(phone) {
  const meta = otpMetaStore.get(phone);
  if (!meta) return { allowed: true };
  const now = Date.now();
  if (meta.lockedUntil && meta.lockedUntil > now) {
    const waitSec = Math.ceil((meta.lockedUntil - now) / 1000);
    return { allowed: false, error: `Too many attempts. Please try again in ${waitSec}s.` };
  }
  if (meta.lastSentAt && now - meta.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - meta.lastSentAt)) / 1000);
    return { allowed: false, error: `Please wait ${waitSec}s before requesting a new OTP.` };
  }
  return { allowed: true };
}

function recordOtpSent(phone) {
  const meta = otpMetaStore.get(phone) || { attempts: 0 };
  meta.lastSentAt = Date.now();
  meta.attempts = 0;
  otpMetaStore.set(phone, meta);
}

function recordFailedAttempt(phone) {
  const meta = otpMetaStore.get(phone) || { attempts: 0 };
  meta.attempts = (meta.attempts || 0) + 1;
  if (meta.attempts >= 5) {
    meta.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
    logger.warn(`Phone ${phone} locked out of OTP verification due to 5 consecutive failures.`);
  }
  otpMetaStore.set(phone, meta);
  return meta.attempts;
}

function clearOtpMeta(phone) {
  otpMetaStore.delete(phone);
}

async function sendOtpNotification(phone, otp) {
  return activeProvider.send(phone, otp);
}

module.exports = {
  generateOTP,
  checkCooldown,
  recordOtpSent,
  recordFailedAttempt,
  clearOtpMeta,
  sendOtpNotification,
  OTP_EXPIRY_MS,
};
