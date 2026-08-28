import { createServiceClient } from './supabase/server';

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number | null;
  monthly_tokens: number;
  max_projects: number;
  max_file_size: number;
  features: string[];
  is_active: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  plans: Plan;
}

export async function getPlans(): Promise<Plan[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  if (error) return [];
  return (data as Plan[]).map(p => ({ ...p, features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features }));
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*, plans(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  if (error) return null;
  const result = data as any;
  return {
    ...result,
    plans: {
      ...result.plans,
      features: typeof result.plans.features === 'string' ? JSON.parse(result.plans.features) : result.plans.features,
    },
  };
}

export async function getUserPlan(userId: string): Promise<Plan | null> {
  const sub = await getUserSubscription(userId);
  return sub?.plans ?? null;
}

export async function canCreateProject(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const sub = await getUserSubscription(userId);
  // Free users (no active sub) can create up to 1 project
  if (!sub) {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) >= 1) {
      return { allowed: false, reason: 'Free plan allows 1 project. Upgrade to create more.' };
    }
    return { allowed: true };
  }

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((count ?? 0) >= sub.plans.max_projects) {
    return { allowed: false, reason: `Your ${sub.plans.name} plan allows max ${sub.plans.max_projects} projects. Upgrade to create more.` };
  }
  return { allowed: true };
}

export async function upgradeSubscription(userId: string, planId: string, razorpaySubId?: string, razorpayCustId?: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      plan_id: planId,
      status: 'active',
      razorpay_sub_id: razorpaySubId ?? null,
      razorpay_cust_id: razorpayCustId ?? null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('user_id', userId);

  if (!error) {
    // Update token balance
    const { data: plan } = await supabase.from('plans').select('monthly_tokens').eq('id', planId).single();
    if (plan) {
      await supabase
        .from('token_balances')
        .update({
          total_tokens: (plan as any).monthly_tokens,
          reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('user_id', userId);
    }
  }
  return !error;
}