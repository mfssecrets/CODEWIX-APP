import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    const { data: tokenBalance } = await supabase
      .from('token_balances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      user: { id: user.id, email: user.email, phone: user.phone },
      profile,
      subscription: subscription ?? null,
      tokens: tokenBalance ? {
        available: Math.max(0, (tokenBalance.total_tokens - tokenBalance.tokens_used)),
        total: tokenBalance.total_tokens,
        used: tokenBalance.tokens_used,
        reset_at: tokenBalance.reset_at,
      } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
