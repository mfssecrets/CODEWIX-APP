import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';

/**
 * POST /api/email/welcome
 *
 * Sends a transactional welcome email to the authenticated user via Resend.
 * Called by the signup flow right after OTP verification. Fire-and-forget from
 * the client's perspective — a Resend misconfiguration never blocks signup.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let name: string | undefined;
  try {
    const body = await req.json();
    name = body?.name;
  } catch { /* no body is fine */ }

  if (!user.email) {
    return NextResponse.json({ ok: false, message: 'No email on user' });
  }

  // Prefer the DB profile name, fall back to the name passed in the body.
  let displayName = name;
  if (!displayName) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();
    displayName = profile?.name || undefined;
  }

  const result = await sendWelcomeEmail(user.email, displayName);
  return NextResponse.json(result);
}
