const IS_DEV = false; // Always send real SMS

const EASYSENDSMS_API_URL = 'https://restapi.easysendsms.app/v1/rest/sms/send';

/**
 * Normalise a Tunisian phone number to E.164 format (+216XXXXXXXX).
 * Accepts: "12345678", "+21612345678", "00216 12 345 678", etc.
 */
const toE164Tunisia = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('216') && digits.length === 11) return `+${digits}`;
  if (digits.length === 8) return `+216${digits}`;
  if (digits.startsWith('00216')) return `+${digits.slice(2)}`;
  return `+${digits}`;
};

/**
 * Send an OTP code via EasySendSMS REST API.
 * In development mode, logs the OTP to console instead of sending SMS.
 * Silently logs on failure — never throws.
 */
export const sendOtpSms = async (phone: string, otp: string): Promise<void> => {
  const e164 = toE164Tunisia(phone);

  if (IS_DEV) {
    console.log(`\n📱 [DEV] OTP for ${e164}: ${otp} (set SEND_REAL_SMS=true in .env to send real SMS)\n`);
    return;
  }

  const apiKey = process.env.EASYSENDSMS_API_KEY;
  if (!apiKey) {
    console.error('📵 EASYSENDSMS_API_KEY is not set — cannot send OTP SMS');
    return;
  }

  try {
    const response = await fetch(EASYSENDSMS_API_URL, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: 'Transporti',
        to: e164.replace('+', ''),
        text: `${otp}`,
        type: '1',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`📵 EasySendSMS error (HTTP ${response.status}): ${body}`);
      return;
    }

    console.log(`📱 OTP SMS sent to ${e164}`);
  } catch (err) {
    console.error(`📵 Failed to send OTP SMS to ${e164}:`, err);
  }
};

/**
 * Send a delivery confirmation code via SMS to the recipient.
 * The recipient must provide this code to the carrier upon delivery.
 */
export const sendDeliveryCodeSms = async (phone: string, code: string, refNumber: string): Promise<void> => {
  const e164 = toE164Tunisia(phone);

  if (IS_DEV) {
    console.log(`\n📱 [DEV] Delivery code for ${e164}: ${code} (ref: ${refNumber})\n`);
    return;
  }

  const apiKey = process.env.EASYSENDSMS_API_KEY;
  if (!apiKey) {
    console.error('📵 EASYSENDSMS_API_KEY is not set — cannot send delivery code SMS');
    return;
  }

  try {
    const response = await fetch(EASYSENDSMS_API_URL, {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        from: 'Transporti',
        to: e164.replace('+', ''),
        text: `${code}`,
        type: '1',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`📵 EasySendSMS error (HTTP ${response.status}): ${body}`);
      return;
    }

    console.log(`📱 Delivery code SMS sent to ${e164} for shipment ${refNumber}`);
  } catch (err) {
    console.error(`📵 Failed to send delivery code SMS to ${e164}:`, err);
  }
};
