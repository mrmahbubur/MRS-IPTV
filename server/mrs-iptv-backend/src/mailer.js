import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { config, PLANS, CHANNELS } from './config.js';
import { get, all, run, nowIso, audit } from './db.js';

export const sentMail = []; // only filled in `json` transport mode (tests / dry runs)

let transport;
function getTransport() {
  if (transport) return transport;
  const m = config.mail;
  if (m.transport === 'smtp' && m.pass) {
    const isGmail = (m.host || '').toLowerCase().includes('gmail') || (m.user || '').toLowerCase().includes('@gmail.com');
    transport = nodemailer.createTransport(
      isGmail
        ? {
            service: 'gmail',
            auth: m.user ? { user: m.user, pass: m.pass } : undefined,
          }
        : {
            host: m.host,
            port: m.port,
            secure: m.port === 465,
            auth: m.user ? { user: m.user, pass: m.pass } : undefined,
          }
    );
  } else {
    transport = nodemailer.createTransport({ jsonTransport: true });
  }
  return transport;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toUTCString().replace(/ GMT$/, ' UTC');
const spaced = (code) => (String(code).includes('-') ? String(code) : String(code).replace(/(\d{5})(?=\d)/g, '$1 '));
const fmtAmount = (minor, cur) => `${cur === 'BDT' ? '' : '$'}${(Number(minor || 0) / 100).toFixed(2).replace(/\.00$/, '')}${cur === 'BDT' ? ' TK' : ''}`;

export function renderActivationEmail({ order, code }) {
  const plan = PLANS[order.plan];
  const { name, siteUrl, supportWhatsApp } = config.brand;
  const clock = config.expiryFrom === 'issue'
    ? 'Your plan clock has started today. / আপনার প্ল্যানের মেয়াদ আজ থেকেই শুরু হয়েছে।'
    : `Your ${plan.label.toLowerCase()} starts counting only when you activate the code. / কোডটি অ্যাক্টিভেট করার পর থেকেই ${plan.label} মেয়াদ শুরু হবে।`;
  const subject = `Your ${name} VIP Pass activation code (${plan.label})`;

  const text = [
    `Hello${order.customer_name ? ` ${order.customer_name}` : ''},`,
    `Payment verified – thank you! / আপনার পেমেন্ট ভেরিফাই সম্পন্ন হয়েছে – ধন্যবাদ!`,
    ``,
    `Plan:            VIP Pass – ${plan.label}`,
    `Activation code: ${code}`,
    `Order reference: ${order.public_id}`,
    ``,
    `How to activate (কীভাবে অ্যাক্টিভেট করবেন):`,
    `1. Open ${siteUrl}`,
    `2. Tap the VIP Pass crown → "Redeem / Activate Code"`,
    `3. Enter or paste the code above and tap "ACTIVATE PASS NOW"`,
    ``,
    clock,
    `Keep your activation code private — do not share it publicly.`,
    ``,
    `Need help? WhatsApp ${supportWhatsApp} and quote your order reference (${order.public_id}).`,
    `– ${name} (TV NETWORK)`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#0B0D12;padding:24px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141821;border:1px solid #262d3d;border-radius:14px">
<tr><td style="padding:24px 28px 10px">
  <div style="font-size:20px;font-weight:800;letter-spacing:1px">${esc(name)} <span style="color:#F5B301">VIP PASS</span></div>
  <div style="color:#94a3b8;font-size:13px;margin-top:4px">Payment verified – your pass is ready / পেমেন্ট ভেরিফাই সম্পন্ন হয়েছে</div>
</td></tr>
<tr><td style="padding:12px 28px">
  <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">Plan / প্ল্যান</div>
  <div style="font-size:16px;font-weight:700;margin-bottom:14px;color:#ffffff">VIP Pass – ${esc(plan.label)}</div>
  <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">Activation code / অ্যাক্টিভেশন কোড</div>
  <div style="font-family:Consolas,Menlo,monospace;font-size:26px;font-weight:800;letter-spacing:2px;background:#0B0D12;border:1px dashed #F5B301;border-radius:10px;padding:14px 16px;margin:8px 0 6px;text-align:center;color:#F5B301">${esc(spaced(code))}</div>
  <div style="color:#94a3b8;font-size:12px;text-align:center">Exact code / আসল কোড: <b style="color:#ffffff">${esc(code)}</b></div>
</td></tr>
<tr><td style="padding:10px 28px 6px;font-size:14px;line-height:1.6;color:#cbd5e1">
  <b style="color:#ffffff">How to activate / অ্যাক্টিভেট করার ৩টি ধাপ:</b>
  <ol style="margin:6px 0 12px 18px;padding:0">
    <li>Open <a href="${esc(siteUrl)}" style="color:#38bdf8">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a></li>
    <li>Open VIP Pass → <b>Redeem / Activate Code</b></li>
    <li>Paste your code and tap <b>ACTIVATE PASS NOW</b></li>
  </ol>
  <div style="color:#94a3b8;font-size:12px">${esc(clock)}</div>
</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#94a3b8;border-top:1px solid #262d3d">
  Order Ref: <span style="font-family:Consolas,monospace;color:#f8fafc">${esc(order.public_id)}</span> · WhatsApp Support: ${esc(supportWhatsApp)}
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function renderRejectionEmail({ order, reasonText }) {
  const plan = PLANS[order.plan];
  const { name, siteUrl, supportWhatsApp } = config.brand;
  const reason = reasonText || 'Payment verification could not be completed.';
  const subject = `[${name}] Payment Update for Order ${order.public_id}`;

  const text = [
    `Hello${order.customer_name ? ` ${order.customer_name}` : ''},`,
    ``,
    `Your VIP Pass order (${order.public_id}) for ${plan?.label || order.plan} could not be approved.`,
    `Reason: ${reason}`,
    ``,
    `বাংলা নির্দেশনা: আপনার অর্ডারটি (${order.public_id}) যাচাই করা সম্ভব হয়নি। কারণ: ${reason}`,
    `যদি আপনি টাকা পাঠিয়ে থাকেন, সঠিক TrxID ও স্ক্রিনশট সহ WhatsApp (${supportWhatsApp})-এ যোগাযোগ করুন।`,
    ``,
    `Website: ${siteUrl}`,
    `– ${name}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#0B0D12;padding:24px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#f1f5f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#141821;border:1px solid #451a24;border-radius:14px">
<tr><td style="padding:24px 28px 8px">
  <div style="font-size:20px;font-weight:800">${esc(name)} <span style="color:#ef4444">Order Rejected</span></div>
  <div style="color:#94a3b8;font-size:13px;margin-top:4px">Order Reference: ${esc(order.public_id)}</div>
</td></tr>
<tr><td style="padding:12px 28px;font-size:14px;line-height:1.6;color:#cbd5e1">
  <p>Your VIP Pass submission for <b>${esc(plan?.label || order.plan)}</b> could not be verified.</p>
  <div style="background:#0B0D12;border:1px solid #ef4444;border-radius:8px;padding:12px 14px;color:#fca5a5;margin:10px 0">
    <b>Reason / কারণ:</b> ${esc(reason)}
  </div>
  <p style="font-size:13px;color:#94a3b8">যদি আপনি ইতিমধ্যে টাকা পাঠিয়ে থাকেন, সঠিক Transaction ID এবং পেমেন্ট স্ক্রিনশট সহ আমাদের WhatsApp সাপোর্টে (${esc(supportWhatsApp)}) মেসেজ করুন।</p>
</td></tr>
<tr><td style="padding:14px 28px 22px;font-size:12px;color:#94a3b8;border-top:1px solid #262d3d">
  <a href="${esc(siteUrl)}" style="color:#38bdf8">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a> · WhatsApp: ${esc(supportWhatsApp)}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export function renderLowStockEmail({ plan, remaining, threshold }) {
  const { name } = config.brand;
  const planObj = PLANS[plan];
  const subject = `[${name} ALERT] Low Activation Code Stock for ${planObj?.label || plan} (${remaining} left)`;
  const text = [
    `Low activation code inventory alert on ${name}:`,
    ``,
    `Plan: ${planObj?.label || plan} (${plan})`,
    `Remaining unused codes: ${remaining}`,
    `Configured threshold: ${threshold}`,
    ``,
    `Run: node scripts/generate-codes.js 1200`,
    `Or generate codes from the Admin Dashboard (/admin).`,
  ].join('\n');
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;background:#0B0D12;color:#f1f5f9;padding:24px;border-radius:12px">
    <h2 style="color:#F5B301;margin:0 0 8px">${esc(name)} — Low Code Stock Alert</h2>
    <p>Unused activation codes for <b>${esc(planObj?.label || plan)} (${esc(plan)})</b> dropped to <b style="color:#ef4444">${remaining}</b> (threshold: ${threshold}).</p>
    <p>Please replenish via Admin Dashboard or run <code>node scripts/generate-codes.js 1200</code>.</p>
  </div>`;
  return { subject, text, html };
}

export function renderAutoActivatedEmail({ order, code, expiresAt }) {
  const plan = PLANS[order.plan];
  const { name, siteUrl, supportWhatsApp } = config.brand;
  const expiryFormatted = fmtDate(expiresAt);
  const subject = `Your ${name} VIP Pass is Now Automatically Active! (${plan.label})`;

  const text = [
    `Good news! Your VIP Pass is now automatically active.`,
    ``,
    `Since 12 hours elapsed from payment verification, our autonomous activation system has activated your VIP subscription so you can start watching without manual setup.`,
    ``,
    `Plan:            VIP Pass – ${plan.label}`,
    `Activation code: ${code}`,
    `Order reference: ${order.public_id}`,
    `Valid Until:     ${expiryFormatted}`,
    ``,
    `How to start streaming:`,
    `1. Open ${siteUrl}`,
    `2. Enjoy 8,200+ live HD sports, news, and entertainment streams immediately!`,
    `3. If prompted on a new device, your active code is: ${code}`,
    ``,
    `Need help? WhatsApp ${supportWhatsApp} quoting your order reference.`,
    `– ${name}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#050816;padding:24px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#e6ecff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b1226;border:1px solid #1b2a4d;border-radius:12px">
<tr><td style="padding:24px 28px 8px"><div style="font-size:20px;font-weight:700;letter-spacing:1px">${esc(name)} <span style="color:#10b981">VIP Pass Active</span></div>
<div style="color:#8fa3d1;font-size:13px;margin-top:4px">12-Hour Automatic Activation Completed – Your Pass is Live!</div></td></tr>
<tr><td style="padding:12px 28px">
<div style="color:#8fa3d1;font-size:12px;text-transform:uppercase;letter-spacing:1px">Plan</div>
<div style="font-size:16px;margin-bottom:14px">VIP Pass – ${esc(plan.label)} (Active until ${esc(expiryFormatted)})</div>
<div style="color:#8fa3d1;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your Activated VIP Code</div>
<div style="font-family:Consolas,Menlo,monospace;font-size:26px;letter-spacing:2px;background:#050816;border:1px dashed #10b981;border-radius:8px;padding:14px 16px;margin:6px 0 4px;text-align:center;color:#10b981">${esc(spaced(code))}</div>
<div style="color:#8fa3d1;font-size:12px;text-align:center">Code: <b style="color:#e6ecff">${esc(code)}</b></div></td></tr>
<tr><td style="padding:8px 28px 4px;font-size:14px;line-height:1.6">
<b>Start Streaming Now</b><ol style="margin:6px 0 10px 18px;padding:0">
<li>Open <a href="${esc(siteUrl)}" style="color:#38bdf8">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a></li>
<li>Your VIP pass is automatically recognized on your active device!</li>
<li>Enjoy buffer-free 8,200+ premium live channels and sports.</li></ol>
<div style="color:#8fa3d1">Your subscription is active until ${esc(expiryFormatted)}.</div></td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#8fa3d1;border-top:1px solid #1b2a4d">
Order reference <span style="font-family:Consolas,monospace">${esc(order.public_id)}</span> · Need help? WhatsApp ${esc(supportWhatsApp)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function renderSubmissionCopyEmail({ order, recipientRole = 'customer' }) {
  const plan = PLANS[order.plan];
  const channel = CHANNELS[order.channel];
  const { name, siteUrl, supportWhatsApp } = config.brand;
  const isAdmin = recipientRole === 'admin';
  const amount = fmtAmount(order.expected_minor, order.currency);
  const planLabel = plan ? `${plan.label} (${amount})` : `${order.plan} (${amount})`;
  const channelLabel = channel?.label || order.channel;
  const trxDisplay = order.trx_id ? order.trx_id : 'Not provided (Screenshot uploaded)';
  const shotDisplay = order.screenshot_path ? 'Uploaded (Screenshot proof recorded)' : 'Not uploaded';
  const submittedAt = fmtDate(order.created_at || nowIso());

  const subject = isAdmin
    ? `[${name} VIP] Payment Details Copy – Order ${order.public_id} (${channelLabel})`
    : `Payment Received & Under Review – ${name} (${order.public_id})`;

  const introText = isAdmin
    ? `Informational record copy: a customer submitted payment details on ${name}.`
    : `We received your payment submission on ${name}. Our automated verification and team are reviewing your transaction. (বাংলা: আপনার পেমেন্ট তথ্য সফলভাবে জমা হয়েছে এবং যাচাই করা হচ্ছে।)`;

  const footerNote = isAdmin
    ? `This email is a record-keeping copy of customer-submitted payment details. Reply directly to contact ${order.email}.`
    : `Note: This email is strictly a confirmation copy for your records (no activation code is included here). Once payment verification is completed, your VIP activation code will be emailed to you separately.`;

  const text = [
    introText,
    ``,
    `SUBMITTED PAYMENT DETAILS COPY`,
    `------------------------------`,
    `Order Reference:   ${order.public_id}`,
    `VIP Plan:          VIP Pass – ${planLabel}`,
    `Region:            ${order.region}`,
    `Payment Method:    ${channelLabel}`,
    `Expected Amount:   ${amount}`,
    `Transaction ID:    ${trxDisplay}`,
    `Screenshot Proof:  ${shotDisplay}`,
    `Customer Email:    ${order.email}`,
    `Mobile / WhatsApp: ${order.phone}`,
    `Submitted At:      ${submittedAt}`,
    ``,
    footerNote,
    ``,
    `Website: ${siteUrl}`,
    `Support WhatsApp: ${supportWhatsApp}`,
    `– ${name}`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#050816;padding:24px;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#e6ecff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0b1226;border:1px solid #1b2a4d;border-radius:12px">
<tr><td style="padding:24px 28px 8px">
  <div style="font-size:20px;font-weight:700;letter-spacing:1px">${esc(name)} <span style="color:#F5B301">VIP Pass</span></div>
  <div style="color:#8fa3d1;font-size:13px;margin-top:4px">${isAdmin ? 'Admin Record Copy — Submitted Payment Details' : 'Payment Received & Under Review (For Your Records)'}</div>
</td></tr>
<tr><td style="padding:8px 28px 12px;font-size:14px;color:#cbd5e1;line-height:1.5">${esc(introText)}</td></tr>
<tr><td style="padding:0 28px 16px">
  <table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="background:#050816;border:1px solid #1b2a4d;border-radius:8px;font-size:13px">
    <tr><td style="color:#8fa3d1;width:150px">Order Reference</td><td style="font-family:Consolas,monospace;color:#38bdf8;font-weight:700">${esc(order.public_id)}</td></tr>
    <tr><td style="color:#8fa3d1">VIP Plan</td><td style="color:#ffffff;font-weight:600">VIP Pass – ${esc(plan?.label || order.plan)}</td></tr>
    <tr><td style="color:#8fa3d1">Amount</td><td style="color:#34d399;font-weight:700">${esc(amount)} (${esc(order.region)})</td></tr>
    <tr><td style="color:#8fa3d1">Payment Method</td><td style="color:#ffffff">${esc(channelLabel)}</td></tr>
    <tr><td style="color:#8fa3d1">Transaction ID / Ref</td><td style="font-family:Consolas,monospace;color:#fbbf24;font-weight:700">${esc(trxDisplay)}</td></tr>
    <tr><td style="color:#8fa3d1">Screenshot Proof</td><td style="color:#e6ecff">${esc(shotDisplay)}</td></tr>
    <tr><td style="color:#8fa3d1">Customer Email</td><td style="color:#e6ecff">${esc(order.email)}</td></tr>
    <tr><td style="color:#8fa3d1">Mobile / WhatsApp</td><td style="color:#e6ecff">${esc(order.phone)}</td></tr>
    <tr><td style="color:#8fa3d1">Submitted At</td><td style="color:#8fa3d1">${esc(submittedAt)}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:4px 28px 16px;font-size:12px;color:#8fa3d1;line-height:1.5">${esc(footerNote)}</td></tr>
<tr><td style="padding:14px 28px 22px;font-size:12px;color:#8fa3d1;border-top:1px solid #1b2a4d">
  <a href="${esc(siteUrl)}" style="color:#38bdf8;text-decoration:none">${esc(siteUrl.replace(/^https?:\/\//, ''))}</a> · Need help? WhatsApp ${esc(supportWhatsApp)}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

/** Queue informational email copies of submitted payment details (for keeping information). */
export function queuePaymentSubmissionCopy(order) {
  if (!config.mail.sendSubmissionCopy || !order) return;
  const now = nowIso();

  const cust = renderSubmissionCopyEmail({ order, recipientRole: 'customer' });
  run(
    `INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
     VALUES (?,?,?,?,?,?,?, 'queued', ?, ?)`,
    order.id,
    order.email,
    'submission_copy_customer',
    null,
    cust.subject,
    cust.text,
    cust.html,
    now,
    now
  );

  const adminTo = config.mail.adminEmail;
  if (adminTo && adminTo.toLowerCase() !== String(order.email || '').toLowerCase()) {
    const adm = renderSubmissionCopyEmail({ order, recipientRole: 'admin' });
    run(
      `INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
       VALUES (?,?,?,?,?,?,?, 'queued', ?, ?)`,
      order.id,
      adminTo,
      'submission_copy_admin',
      order.screenshot_path || null,
      adm.subject,
      adm.text,
      adm.html,
      now,
      now
    );
  }

  run("UPDATE orders SET copy_email_status='queued' WHERE id=?", order.id);
}

/** Insert into the outbox (call inside the verification transaction so code + email are atomic). */
export function queueActivationEmail(order, code) {
  const { subject, text, html } = renderActivationEmail({ order, code });
  run(`INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
       VALUES (?,?,'activation',NULL,?,?,?, 'queued', ?, ?)`, order.id, order.email, subject, text, html, nowIso(), nowIso());
  run("UPDATE orders SET email_status='queued' WHERE id=?", order.id);
}

export function queueRejectionEmail(order, reasonText) {
  if (!order?.email) return;
  const { subject, text, html } = renderRejectionEmail({ order, reasonText });
  run(`INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
       VALUES (?,?,'rejection',NULL,?,?,?, 'queued', ?, ?)`, order.id, order.email, subject, text, html, nowIso(), nowIso());
}

export function queueLowStockAlert(plan, remaining) {
  const adminTo = config.mail.adminEmail;
  if (!adminTo) return false;
  const recent = get(
    "SELECT id FROM audit_log WHERE action='low_stock_alert' AND detail LIKE ? AND at > ?",
    `%"plan":"${plan}"%`,
    new Date(Date.now() - 6 * 3600_000).toISOString()
  );
  if (recent) return false;
  const { subject, text, html } = renderLowStockEmail({ plan, remaining, threshold: config.lowStockThreshold });
  run(
    `INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
     VALUES (0,?,'low_stock',NULL,?,?,?, 'queued', ?, ?)`,
    adminTo,
    subject,
    text,
    html,
    nowIso(),
    nowIso()
  );
  audit('system', 'low_stock_alert', null, { plan, remaining, threshold: config.lowStockThreshold });
  return true;
}

export function queueAutoActivatedEmail(order, code, expiresAt) {
  const { subject, text, html } = renderAutoActivatedEmail({ order, code, expiresAt });
  run(`INSERT INTO email_outbox(order_id, to_email, mail_kind, attachment_path, subject, text_body, html_body, status, next_attempt_at, created_at)
       VALUES (?,?,'auto_activated',NULL,?,?,?, 'queued', ?, ?)`, order.id, order.email, subject, text, html, nowIso(), nowIso());
  run("UPDATE orders SET email_status='queued' WHERE id=?", order.id);
}

let chain = Promise.resolve();
/**
 * Deliver queued mails with exponential back-off. Safe to call as often as you like:
 * runs are queued one after another, so a caller always waits until its own mail was attempted.
 */
export function processOutbox() {
  const run = chain.catch(() => {}).then(deliverDue);
  chain = run;
  return run;
}

async function deliverDue() {
  let sent = 0;
  {
    const due = all("SELECT * FROM email_outbox WHERE status='queued' AND next_attempt_at <= ? ORDER BY id LIMIT 20", nowIso());
    for (const m of due) {
      const isCopyMail = m.mail_kind === 'submission_copy_customer' || m.mail_kind === 'submission_copy_admin';
      try {
        const orderRow = m.mail_kind === 'submission_copy_admin' && m.order_id
          ? get('SELECT email FROM orders WHERE id=?', m.order_id)
          : null;
        const attachments = m.attachment_path && fs.existsSync(m.attachment_path)
          ? [{ filename: path.basename(m.attachment_path), path: m.attachment_path }]
          : undefined;
        const info = await getTransport().sendMail({
          from: config.mail.from,
          replyTo: orderRow?.email || config.mail.replyTo || undefined,
          to: m.to_email,
          subject: m.subject,
          text: m.text_body,
          html: m.html_body,
          attachments,
        });
        if (config.mail.transport === 'json') {
          sentMail.push(JSON.parse(info.message));
        } else if (config.mail.transport === 'console') {
          try {
            const outboxDir = path.resolve(path.dirname(config.dbPath === ':memory:' ? 'data/mrs.sqlite' : config.dbPath), 'outbox');
            fs.mkdirSync(outboxDir, { recursive: true });
            const emlPath = path.join(outboxDir, `mail_${m.id}_order_${m.order_id || 'na'}_${m.mail_kind || 'activation'}.eml`);
            const emlBody = [
              `From: ${config.mail.from}`,
              `To: ${m.to_email}`,
              `Subject: ${m.subject}`,
              `Date: ${new Date().toUTCString()}`,
              `MIME-Version: 1.0`,
              `Content-Type: text/plain; charset=utf-8`,
              ``,
              m.text_body || '',
            ].join('\r\n');
            fs.writeFileSync(emlPath, emlBody, 'utf8');
          } catch {}
          console.log(`[mail:outbox] → ${m.to_email} | ${m.subject}`);
        }
        run("UPDATE email_outbox SET status='sent', sent_at=?, attempts=attempts+1, last_error=NULL WHERE id=?", nowIso(), m.id);
        if (isCopyMail) {
          if (m.mail_kind === 'submission_copy_customer') {
            run("UPDATE orders SET copy_email_status='sent' WHERE id=?", m.order_id);
          } else {
            run("UPDATE orders SET copy_email_status=COALESCE(copy_email_status, 'sent') WHERE id=?", m.order_id);
          }
        } else {
          run("UPDATE orders SET email_status='sent' WHERE id=?", m.order_id);
        }
        sent++;
      } catch (err) {
        const attempts = m.attempts + 1;
        const failed = attempts >= config.mail.maxAttempts;
        const delay = Math.min(30_000 * 2 ** attempts, 3600_000);
        run('UPDATE email_outbox SET status=?, attempts=?, last_error=?, next_attempt_at=? WHERE id=?',
          failed ? 'failed' : 'queued', attempts, String(err.message).slice(0, 300), new Date(Date.now() + delay).toISOString(), m.id);
        if (failed) {
          if (isCopyMail) {
            run("UPDATE orders SET copy_email_status='failed' WHERE id=?", m.order_id);
            audit('system', 'copy_email_failed', m.order_id, { error: err.message });
          } else {
            run("UPDATE orders SET email_status='failed' WHERE id=?", m.order_id);
            audit('system', 'email_failed', m.order_id, { error: err.message });
          }
        }
      }
    }
  }
  return sent;
}

export function requeueEmail(orderId) {
  const o = get('SELECT * FROM orders WHERE id=?', orderId);
  const c = o?.code_id ? get('SELECT code, expires_at FROM codes WHERE id=?', o.code_id) : null;
  if (!o || o.status !== 'verified' || !c) return false;
  if (o.auto_activated_at && c.expires_at) {
    queueAutoActivatedEmail(o, c.code, c.expires_at);
  } else {
    queueActivationEmail(o, c.code);
  }
  return true;
}

