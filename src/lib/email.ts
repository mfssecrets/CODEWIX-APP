/**
 * CODEWIX transactional email — powered by Resend.
 *
 * The operator's `RESEND_API_KEY` (server-side env var) is used to send
 * transactional emails via the Resend API. This is server-only — the key is
 * never exposed to the client. Supabase Auth OTP emails are handled
 * separately by Supabase (configured with the operator's Resend SMTP
 * settings); this module is for app-level transactional mail such as the
 * welcome email after signup.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'CodeWIX <noreply@codewix.in>';
const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailResult {
  ok: boolean;
  status: number;
  id?: string;
  message?: string;
}

/**
 * Send an email via Resend. Fire-and-forget safe: returns a skipped result
 * (not an error) when RESEND_API_KEY is not configured, so callers can always
 * `await` without try/catch around availability.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    return { ok: false, status: 0, message: 'RESEND_API_KEY not configured (skipped)' };
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from || RESEND_FROM,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, message: text };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, status: res.status, id: data.id };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : 'Email send failed' };
  }
}

function welcomeHtml(name?: string): string {
  const greeting = name && name.trim() ? `Hi ${name.trim()}` : 'Welcome';
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f8fafc; padding:32px 0; margin:0;">
    <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#7c3aed,#9333ea); padding:32px 40px;">
        <h1 style="color:#ffffff; font-size:22px; margin:0; font-weight:700;">CodeWIX</h1>
        <p style="color:#e9d5ff; font-size:13px; margin:6px 0 0 0;">Build anything with AI</p>
      </div>
      <div style="padding:32px 40px;">
        <h2 style="color:#1e293b; font-size:18px; margin:0 0 12px 0;">${greeting}, welcome to CodeWIX!</h2>
        <p style="color:#475569; font-size:14px; line-height:1.6; margin:0 0 16px 0;">
          Your account is ready. Describe your idea and let AI build your website, web app, or mobile app — powered by Google Gemini.
        </p>
        <div style="background:#f8fafc; border-radius:12px; padding:20px; margin:20px 0;">
          <p style="color:#64748b; font-size:13px; margin:0 0 8px 0; font-weight:600;">Get started in seconds:</p>
          <ul style="color:#475569; font-size:13px; line-height:1.8; margin:0; padding-left:20px;">
            <li><strong>Chat</strong> — ask anything, with image &amp; document support</li>
            <li><strong>Agent</strong> — autonomous multi-step coding tasks</li>
            <li><strong>Build</strong> — full in-browser IDE with live preview</li>
          </ul>
        </div>
        <a href="https://codewix.in/chat" style="display:inline-block; background:linear-gradient(135deg,#7c3aed,#9333ea); color:#ffffff; text-decoration:none; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:600; margin-top:8px;">Open CodeWIX</a>
        <p style="color:#94a3b8; font-size:12px; margin:24px 0 0 0;">— The CodeWIX Team<br/><a href="https://codewix.in" style="color:#94a3b8;">codewix.in</a></p>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendWelcomeEmail(to: string, name?: string): Promise<EmailResult> {
  return sendEmail({
    to,
    subject: 'Welcome to CodeWIX — let\u2019s build something',
    html: welcomeHtml(name),
  });
}
