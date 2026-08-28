import { createServiceClient } from './supabase/server';

export interface TokenBalance {
  user_id: string;
  total_tokens: number;
  tokens_used: number;
  reset_at: string;
}

export async function getTokenBalance(userId: string): Promise<TokenBalance | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('token_balances')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data as TokenBalance;
}

export async function getAvailableTokens(userId: string): Promise<number> {
  const balance = await getTokenBalance(userId);
  if (!balance) return 0;
  // Check if tokens need reset (monthly)
  if (new Date(balance.reset_at) < new Date()) {
    const supabase = createServiceClient();
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan_id, plans(monthly_tokens)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    const monthlyTokens = (data as any)?.plans?.monthly_tokens ?? 50;
    await supabase
      .from('token_balances')
      .update({
        total_tokens: monthlyTokens,
        tokens_used: 0,
        reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', userId);
    return monthlyTokens;
  }
  return Math.max(0, balance.total_tokens - balance.tokens_used);
}

export async function consumeToken(userId: string, amount: number = 1, meta?: { action?: string; project_id?: string; conversation_id?: string }): Promise<boolean> {
  const available = await getAvailableTokens(userId);
  if (available < amount) return false;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc('increment_token_usage', {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    // Fallback: manual increment
    const bal = await getTokenBalance(userId);
    if (!bal) return false;
    await supabase
      .from('token_balances')
      .update({ tokens_used: bal.tokens_used + amount })
      .eq('user_id', userId);
  }

  // Log usage
  await supabase.from('token_usage').insert({
    user_id: userId,
    tokens_used: amount,
    action: meta?.action ?? 'chat',
    project_id: meta?.project_id ?? null,
    conversation_id: meta?.conversation_id ?? null,
  });

  return true;
}

export async function checkAndConsumeToken(userId: string, meta?: { action?: string; project_id?: string; conversation_id?: string }): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const available = await getAvailableTokens(userId);
  if (available <= 0) {
    const supabase = createServiceClient();
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan_id, plans(name, slug)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    const planName = (sub as any)?.plans?.name ?? 'Starter';
    return {
      allowed: false,
      remaining: 0,
      reason: `You have used all your ${planName} plan tokens. Upgrade your plan for more tokens.`,
    };
  }
  const consumed = await consumeToken(userId, 1, meta);
  return {
    allowed: consumed,
    remaining: consumed ? available - 1 : available,
    reason: consumed ? undefined : 'Failed to consume token.',
  };
}

// Check if user has free trial remaining (first project, max 2 prompts)
export async function getFreePromptCount(userId: string): Promise<{ used: number; limit: number; hasFree: boolean }> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from('token_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  const used = count ?? 0;
  return { used, limit: 2, hasFree: used < 2 };
}