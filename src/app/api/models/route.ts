import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAvailableModels, getDefaultModelId, isPlatformAIConfigured } from '@/lib/ai-providers';

/**
 * GET /api/models
 *
 * Returns the platform-provided Gemini models. Users do NOT manage their own
 * API keys — the operator's GEMINI_API_KEY powers every model in this list.
 * The response is shaped to satisfy both the Chat/Agent pickers (which read
 * `enabled`) and the Build IDE picker (which reads `configs` and filters by
 * `enabled`, sending `id` as the model id).
 *
 * `api_key` is never exposed to the client (returned as null/masked).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configured = isPlatformAIConfigured();
  const defaultId = getDefaultModelId();
  const models = getAvailableModels();

  const configs = models.map((m) => ({
    id: m.id,
    provider: 'google',
    modelId: m.id,
    displayName: m.displayName,
    description: m.description,
    apiKey: null, // platform-managed, never sent to the client
    enabled: configured,
    isDefault: m.id === defaultId,
    status: configured ? 'active' : 'unconfigured',
  }));

  const enabled = models.map((m) => ({
    modelId: m.id,
    displayName: m.displayName,
    provider: 'google',
    supportsVision: m.supportsVision,
  }));

  return NextResponse.json({ configs, enabled, platformConfigured: configured });
}

/**
 * POST /api/models — disabled.
 *
 * Model management is platform-controlled. All Gemini models are provided by
 * CodeWIX using the operator's server-side key. Users select models directly
 * from the picker in Chat / Agent / Build.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    success: false,
    error: 'Model management is platform-controlled. Gemini models are provided by CodeWIX — select them from the picker in Chat, Agent, or Build.',
  }, { status: 403 });
}
