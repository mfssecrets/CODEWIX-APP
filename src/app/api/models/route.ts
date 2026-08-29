import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAvailableModels, getDefaultModelId, isPlatformAIConfigured } from '@/lib/ai-providers';

/**
 * GET /api/models?category=chat|code
 *
 * Returns the platform-provided models for the requested category:
 *   chat → Google Gemini models (for Chat mode)
 *   code → Cerebras + OpenRouter coding models (for Agent/Build mode)
 * If no category is supplied, returns all models.
 *
 * `apiKey` is never exposed to the client (returned as null). The response is
 * shaped to satisfy both the Chat/Agent pickers (read `enabled`) and the Build
 * IDE picker (reads `configs` and filters by `enabled`, sending `id` as the
 * model id).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryParam = searchParams.get('category');
  const category = categoryParam === 'chat' || categoryParam === 'code' ? categoryParam : undefined;
  const configured = isPlatformAIConfigured();
  const defaultChatId = getDefaultModelId('chat');
  const defaultCodeId = getDefaultModelId('code');
  const models = getAvailableModels(category);

  const configs = models.map((m) => ({
    id: m.id,
    provider: m.provider,
    modelId: m.id,
    displayName: m.displayName,
    description: m.description,
    category: m.category,
    apiKey: null, // platform-managed, never sent to the client
    enabled: true,
    isDefault: m.category === 'chat' ? m.id === defaultChatId : m.id === defaultCodeId,
    status: configured ? 'active' : 'unconfigured',
  }));

  const enabled = models.map((m) => ({
    modelId: m.id,
    displayName: m.displayName,
    provider: m.provider,
    category: m.category,
    supportsVision: m.supportsVision,
  }));

  return NextResponse.json({ configs, enabled, platformConfigured: configured });
}

/**
 * POST /api/models — disabled. Models are platform-managed; users select from
 * the picker in Chat / Agent / Build.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    success: false,
    error: 'Model management is platform-controlled. Select models from the picker in Chat, Agent, or Build.',
  }, { status: 403 });
}
