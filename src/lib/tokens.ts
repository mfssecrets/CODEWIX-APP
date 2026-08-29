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
    const monthlyTokens = (sub as any)?.plans?.monthly_tokens ?? 50;
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

/**
 * Free tier: the first FREE_TIER_LIMIT chat/agent prompts are free for every
 * user, regardless of plan. Builder (file-generation) actions are NOT free —
 * they always require plan tokens. The count is based on the number of past
 * token_usage rows for that action by that user (lifetime, never resets).
 */
const FREE_TIER_LIMIT = 5;
const FREE_ACTIONS = ['chat', 'agent'];

async function getFreeUsageCount(userId: string, action: string): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from('token_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('action', FREE_ACTIONS);
  return count ?? 0;
}

export async function checkAndConsumeToken(userId: string, meta?: { action?: string; project_id?: string; conversation_id?: string }): Promise<{ allowed: boolean; remaining: number; reason?: string; freeTier?: boolean }> {
  const action = meta?.action ?? 'chat';

  // Free tier: first FREE_TIER_LIMIT chat/agent prompts are free.
  if (FREE_ACTIONS.includes(action)) {
    const usedCount = await getFreeUsageCount(userId, action);
    if (usedCount < FREE_TIER_LIMIT) {
      // Free — log usage but don't decrement plan tokens.
      const supabase = createServiceClient();
      await supabase.from('token_usage').insert({
        user_id: userId,
        tokens_used: 0,
        action,
        project_id: meta?.project_id ?? null,
        conversation_id: meta?.conversation_id ?? null,
      });
      return { allowed: true, remaining: FREE_TIER_LIMIT - usedCount - 1, freeTier: true };
    }
  }

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
      reason: FREE_ACTIONS.includes(action)
        ? `You've used all ${FREE_TIER_LIMIT} free prompts and your ${planName} plan tokens. Upgrade your plan for more prompts.`
        : `You have used all your ${planName} plan tokens. Upgrade your plan for more tokens.`,
    };
  }
  const consumed = await consumeToken(userId, 1, meta);
  return {
    allowed: consumed,
    remaining: consumed ? available - 1 : available,
    reason: consumed ? undefined : 'Failed to consume token.',
  };
}

/**
 * Refund a previously-consumed plan token. Call this when an AI request fails
 * or is incomplete (e.g. the provider stream errored before producing output)
 * so the user isn't charged for a broken request. Free-tier prompts (which
 * logged tokens_used: 0) don't need refunding — this is a no-op for them.
 *
 * Returns true if a plan token was actually refunded.
 */
export async function refundToken(userId: string, meta?: { action?: string; project_id?: string; conversation_id?: string }): Promise<boolean> {
  const supabase = createServiceClient();
  const bal = await getTokenBalance(userId);
  if (!bal) return false;
  // Only refund if tokens_used > 0 (don't go negative).
  if (bal.tokens_used <= 0) return false;
  const { error } = await supabase
    .from('token_balances')
    .update({ tokens_used: Math.max(0, bal.tokens_used - 1) })
    .eq('user_id', userId);
  if (!error) {
    await supabase.from('token_usage').insert({
      user_id: userId,
      tokens_used: 0,
      action: `${meta?.action ?? 'chat'}_refund`,
      project_id: meta?.project_id ?? null,
      conversation_id: meta?.conversation_id ?? null,
    });
  }
  return !error;
}

// Check how many free prompts the user has left (chat + agent combined).
export async function getFreePromptCount(userId: string): Promise<{ used: number; limit: number; hasFree: boolean }> {
  const used = await getFreeUsageCount(userId, 'chat'); // counts chat + agent (in query)
  return { used, limit: FREE_TIER_LIMIT, hasFree: used < FREE_TIER_LIMIT };
}

export { FREE_TIER_LIMIT, FREE_ACTIONS };