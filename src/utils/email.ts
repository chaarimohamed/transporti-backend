import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'ssl0.ovh.net';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || 'mohamed.chaari@transporti.tn';
const SMTP_PASS = process.env.SMTP_PASS || '';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true, // SSL
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export const sendOtpEmail = async (toEmail: string, otp: string): Promise<void> => {
  if (!SMTP_PASS) {
    console.error('📧 SMTP_PASS is not set — cannot send email');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Transporti" <${SMTP_USER}>`,
      to: toEmail,
      subject: 'Transporti — Code de vérification',
      text: `Transporti: Votre code de vérification est ${otp}. Valable 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1a2744;margin-bottom:8px">Transporti</h2>
          <p>Votre code de vérification est :</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#ebb95f;text-align:center;padding:16px;background:#f9f5ec;border-radius:8px;margin:16px 0">${otp}</div>
          <p style="color:#666;font-size:14px">Ce code est valable 10 minutes. Ne le partagez jamais.</p>
        </div>
      `,
    });
    console.log(`📧 Email OTP sent to ${toEmail}`);
  } catch (err) {
    console.error(`📧 Failed to send email OTP to ${toEmail}:`, err);
  }
};

export const sendPasswordResetEmail = async (toEmail: string, resetCode: string): Promise<void> => {
  if (!SMTP_PASS) {
    console.error('📧 SMTP_PASS is not set — cannot send password reset email');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Transporti" <${SMTP_USER}>`,
      to: toEmail,
      subject: 'Transporti — Réinitialisation de mot de passe',
      text: `Transporti: Votre code de réinitialisation est ${resetCode}. Valable 15 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#1a2744;margin-bottom:8px">Transporti</h2>
          <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
          <p>Votre code de réinitialisation est :</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#ebb95f;text-align:center;padding:16px;background:#f9f5ec;border-radius:8px;margin:16px 0">${resetCode}</div>
          <p style="color:#666;font-size:14px">Ce code est valable 15 minutes. Ne le partagez jamais.</p>
          <p style="color:#999;font-size:12px;margin-top:24px">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        </div>
      `,
    });
    console.log(`📧 Password reset email sent to ${toEmail}`);
  } catch (err) {
    console.error(`📧 Failed to send password reset email to ${toEmail}:`, err);
  }
};
