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
