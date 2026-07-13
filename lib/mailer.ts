// lib/mailer.ts
//
// Sends the OTP verification email over Gmail's SMTP relay via
// nodemailer, replacing Resend. Resend's free sandbox sender
// (onboarding@resend.dev, no verified domain) only delivers to the email
// address that owns the Resend account — which made it impossible to
// test signup with any other address. Gmail SMTP has no such
// restriction and costs nothing at this project's volume.

import nodemailer from "nodemailer";

// Explicit host/port instead of nodemailer's "service: gmail" shorthand —
// pins us to Gmail's implicit-TLS port (465) rather than letting the
// shorthand pick, and gives connectionTimeout below something concrete
// to apply to. Also fails fast with a clear message instead of a raw
// ECONNRESET if the connection can't be established within 10s, since a
// hung SMTP handshake is otherwise indistinguishable from "still trying."
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    // An App Password, not the real account password — generated under
    // Google Account > Security > 2-Step Verification > App Passwords.
    // Paste it as one 16-character string with the spaces Google shows
    // it with removed.
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 10000,
  // Force IPv4 — on networks without real IPv6 routing (common on
  // Windows/some routers), Node still resolves smtp.gmail.com's AAAA
  // record first and dies with ENETUNREACH before ever trying the
  // working IPv4 address. Must be nested under `tls`: for secure:true
  // connections, nodemailer's smtp-connection only merges
  // `options.tls` into the socket's connect options (see
  // lib/smtp-connection/index.js, `Object.assign(opts, this.options.tls || {})`)
  // — a top-level `family` here is silently ignored.
  tls: {
    family: 4,
  },
});

export async function sendVerificationEmail(to: string, code: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set — add them to .env and restart the dev server."
    );
  }

  await transporter.sendMail({
    from: `Foundry <${process.env.GMAIL_USER}>`,
    to,
    subject: "Your Foundry verification code",
    html: `<p>Your verification code is: <strong>${code}</strong></p>
           <p>This code expires in 10 minutes.</p>`,
  });
}

// Sent when the root admin marks a support request resolved — the
// "feedback loop" back to whoever filed it. `reply` is whatever the root
// typed into the console's reply box; falls back to a generic line when
// they resolved without writing one. Deliberately separate from
// sendVerificationEmail's error behavior: callers of this one should
// catch and log rather than let a failed send block the resolve action,
// since marking the ticket resolved is the primary action and the email
// is a courtesy on top of it.
export async function sendSupportResolvedEmail(to: string, subject: string, reply: string | null) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set — add them to .env and restart the dev server."
    );
  }

  const replyHtml = reply
    ? `<p style="white-space: pre-wrap;">${escapeHtml(reply)}</p>`
    : `<p>No additional notes were left, but your request has been marked resolved.</p>`;

  await transporter.sendMail({
    from: `Foundry <${process.env.GMAIL_USER}>`,
    to,
    subject: `Your request "${subject}" has been resolved`,
    html: `<p>Your support request "<strong>${escapeHtml(subject)}</strong>" has been marked resolved by the Foundry admin team.</p>
           ${replyHtml}`,
  });
}

// Sent the moment root approves a pending admin — a one-click link that
// logs them straight into the dashboard (see /api/auth/magic-login),
// instead of making them come back and re-enter their password. Same
// error-if-unconfigured behavior as the other senders; callers should
// still let the approval itself succeed even if this send fails (the
// account IS approved either way — the admin can just log in normally).
export async function sendApprovalEmail(to: string, magicLink: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD are not set — add them to .env and restart the dev server."
    );
  }

  await transporter.sendMail({
    from: `Foundry <${process.env.GMAIL_USER}>`,
    to,
    subject: "You're approved — welcome to Foundry",
    html: `<p>Your Foundry account has been approved by the admin team.</p>
           <p><a href="${magicLink}">Click here to sign in</a> — this link logs you in directly and expires in 24 hours.</p>
           <p>If the link has expired, just sign in normally with your email and password.</p>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
