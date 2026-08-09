const nodemailer = require('nodemailer');

/**
 * Email delivery for Viewer-facing notifications. Uses plain SMTP so it
 * works with any provider (SendGrid, Postmark, Mailgun, Gmail SMTP, etc.)
 * — just fill in the SMTP_* variables in .env. If they're not configured,
 * emails are skipped (logged, not thrown) so the rest of the app keeps
 * working in local development without a mail account set up.
 */
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Sends one notification email per recipient (BCC'd in small batches so no
 * recipient sees another's address). For real production volume, swap this
 * for a queue (e.g. BullMQ) + a transactional email provider's bulk API —
 * this loop is fine for hundreds, not tens of thousands, of viewers.
 */
async function sendNotificationEmail({ title, message }, recipientEmails = []) {
  const t = getTransporter();
  if (!t || recipientEmails.length === 0) {
    console.log(`[mailer] Skipped sending "${title}" to ${recipientEmails.length} recipient(s) — SMTP not configured or no subscribers.`);
    return { sent: 0, skipped: true };
  }

  const BATCH_SIZE = 40;
  let sent = 0;
  for (let i = 0; i < recipientEmails.length; i += BATCH_SIZE) {
    const batch = recipientEmails.slice(i, i + BATCH_SIZE);
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM || 'NEXTGEN <no-reply@nextgen.org>',
        to: process.env.SMTP_FROM || 'NEXTGEN <no-reply@nextgen.org>', // primary "to" stays internal
        bcc: batch,
        subject: `NEXTGEN: ${title}`,
        text: message,
        html: `<div style="font-family:sans-serif;line-height:1.6;"><h2 style="color:#143D8D;">${title}</h2><p>${message}</p><p style="color:#888;font-size:12px;margin-top:24px;">You're receiving this because email notifications are enabled on your NEXTGEN account. You can turn them off anytime from your account settings.</p></div>`,
      });
      sent += batch.length;
    } catch (err) {
      console.error('[mailer] Failed to send batch:', err.message);
    }
  }
  return { sent, skipped: false };
}

/** One-off transactional email, e.g. counseling booking confirmations. */
async function sendTransactionalEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] Skipped transactional email "${subject}" to ${to} — SMTP not configured.`);
    return { sent: false };
  }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || 'NEXTGEN <no-reply@nextgen.org>', to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Failed to send transactional email:', err.message);
    return { sent: false };
  }
}

/**
 * Sends a one-time login code to a Viewer's email. In local development
 * (no SMTP configured), the code is printed to the server console instead
 * of being silently dropped — otherwise there'd be no way to test the OTP
 * login flow without a real mail account. Never do this in production;
 * gated on NODE_ENV.
 */
async function sendOtpEmail(to, code) {
  const t = getTransporter();
  if (!t) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer][DEV ONLY] OTP for ${to}: ${code}  (SMTP not configured — this code is only visible in server logs)`);
    } else {
      console.log(`[mailer] Skipped OTP email to ${to} — SMTP not configured.`);
    }
    return { sent: false };
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'NEXTGEN <no-reply@nextgen.org>',
      to,
      subject: `Your NEXTGEN login code: ${code}`,
      text: `Your NEXTGEN login code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      html: `<div style="font-family:sans-serif;line-height:1.6;">
        <h2 style="color:#143D8D;">Your NEXTGEN login code</h2>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0F2C69;">${code}</p>
        <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Failed to send OTP email:', err.message);
    return { sent: false };
  }
}

module.exports = { sendNotificationEmail, sendTransactionalEmail, sendOtpEmail };
