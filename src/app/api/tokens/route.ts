import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTokenBalance, getAvailableTokens } from '@/lib/tokens';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  try {
    const balance = await getTokenBalance(userId);
    const available = await getAvailableTokens(userId);

    if (!balance) {
      return NextResponse.json({
        available: 0,
        total: 0,
        used: 0,
        reset_at: null,
      });
    }

    return NextResponse.json({
      available,
      total: balance.total_tokens,
      used: balance.tokens_used,
      reset_at: balance.reset_at,
    });
  } catch (error) {
    console.error('Get tokens error:', error);
    return NextResponse.json({ error: 'Failed to fetch token info' }, { status: 500 });
  }
}
