import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnabledModels } from '@/lib/ai-providers';
import { maskApiKey } from '@/lib/crypto';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  const { data: configs } = await supabase
    .from('model_configs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const masked = (configs ?? []).map((c) => ({
    id: c.id,
    user_id: c.user_id,
    provider: c.provider,
    model_id: c.model_id,
    display_name: c.display_name,
    is_default: c.is_default,
    api_key: maskApiKey(c.api_key),
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  const enabled = await getEnabledModels(userId);
  return NextResponse.json({ configs: masked, enabled });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  const body = await req.json();
  if (!body.provider || !body.apiKey || !body.modelId || !body.displayName) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  const { saveModelConfig } = await import('@/lib/ai-providers');
  const config = await saveModelConfig({ userId, provider: body.provider, apiKey: body.apiKey, modelId: body.modelId, displayName: body.displayName, isDefault: body.isDefault });
  return NextResponse.json({ success: true, id: config.id });
}