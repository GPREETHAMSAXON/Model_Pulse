'use strict';

const nodemailer = require('nodemailer');
const axios      = require('axios');

// ── Email transporter
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


// ── Main send function — routes to email, slack, or both
async function send({ rule, model, message, severity, snapshotId }) {
  const notified = [];

  const shouldEmail = rule.channel === 'email' || rule.channel === 'both';
  const shouldSlack = rule.channel === 'slack' || rule.channel === 'both';

  if (shouldEmail && process.env.SMTP_USER) {
    const sent = await sendEmail({ rule, model, message, severity });
    if (sent) notified.push('email');
  }

  if (shouldSlack && rule.slack_webhook_url) {
    const sent = await sendSlack({ rule, model, message, severity });
    if (sent) notified.push('slack');
  }

  return notified;
}


// ── Email alert
async function sendEmail({ model, message, severity }) {
  try {
    const emoji    = severity === 'critical' ? '🔴' : '🟡';
    const subject  = `${emoji} ModelPulse Alert: ${model.name} — ${severity.toUpperCase()} drift detected`;

    await transporter.sendMail({
      from:    `"ModelPulse" <${process.env.SMTP_USER}>`,
      to:      process.env.SMTP_USER, // send to self for now — dashboard will let users configure
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${severity === 'critical' ? '#dc2626' : '#d97706'}">
            ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} Drift Detected
          </h2>
          <p style="font-size: 16px; color: #374151;"><strong>Model:</strong> ${model.name}</p>
          <p style="font-size: 16px; color: #374151;"><strong>Status:</strong> ${severity.toUpperCase()}</p>
          <div style="background: #f9fafb; border-left: 4px solid ${severity === 'critical' ? '#dc2626' : '#d97706'}; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #374151;">${message}</p>
          </div>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/models/${model.id}"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            View in Dashboard →
          </a>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            ModelPulse — ML Model Monitoring
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[alert] Email failed:', err.message);
    return false;
  }
}


// ── Slack alert
async function sendSlack({ rule, model, message, severity }) {
  try {
    const emoji = severity === 'critical' ? ':red_circle:' : ':warning:';
    const color = severity === 'critical' ? '#dc2626' : '#d97706';

    await axios.post(rule.slack_webhook_url, {
      text: `${emoji} *ModelPulse Alert* — ${model.name}`,
      attachments: [
        {
          color,
          fields: [
            { title: 'Model',    value: model.name,           short: true },
            { title: 'Severity', value: severity.toUpperCase(), short: true },
            { title: 'Diagnosis', value: message,              short: false },
          ],
          actions: [
            {
              type:  'button',
              text:  'View in Dashboard',
              url:   `${process.env.FRONTEND_URL || 'http://localhost:5173'}/models/${model.id}`,
              style: 'primary',
            },
          ],
          footer: 'ModelPulse',
          ts:     Math.floor(Date.now() / 1000),
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('[alert] Slack failed:', err.message);
    return false;
  }
}


module.exports = { send };
