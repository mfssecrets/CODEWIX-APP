import { encrypt, decrypt } from './crypto';
import { createServiceClient } from './supabase/server';

export interface AIProvider {
  provider: string;
  modelId: string;
  displayName: string;
  apiKey: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

const PROVIDER_META: Record<string, { supportsVision: boolean; supportsStreaming: boolean; baseUrl: string }> = {
  google: { supportsVision: true, supportsStreaming: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  zai: { supportsVision: true, supportsStreaming: true, baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  groq: { supportsVision: false, supportsStreaming: true, baseUrl: 'https://api.groq.com/openai/v1' },
};

function getModelMeta(modelId: string): { supportsVision: boolean; supportsStreaming: boolean } {
 const lower = modelId.toLowerCase();
 if (lower.includes('vision') || lower.includes('gemini') || lower.includes('glm-5v') || lower.includes('gpt-4o')) return { supportsVision: true, supportsStreaming: true };
 if (lower.includes('groq') || lower.includes('llama') || lower.includes('mixtral')) return { supportsVision: false, supportsStreaming: true };
 return { supportsVision: false, supportsStreaming: true };
}

async function modelRowToAI(c: { id: string; user_id: string; provider: string; model_id: string; display_name: string; api_key: string; is_default: boolean; enabled: boolean }): Promise<AIProvider> {
  const meta = getModelMeta(c.model_id);
  return {
    provider: c.provider,
    modelId: c.model_id,
    displayName: c.display_name,
    apiKey: decrypt(c.api_key),
    supportsVision: meta.supportsVision,
    supportsStreaming: meta.supportsStreaming,
  };
}

export async function getEnabledModels(userId: string): Promise<AIProvider[]> {
  const db = createServiceClient();
  const { data: configs, error } = await db
    .from('model_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);
  if (error) throw new Error(`Failed to fetch models: ${error.message}`);
  return Promise.all((configs ?? []).map(modelRowToAI));
}

export async function getDefaultModel(userId: string): Promise<AIProvider | null> {
  const db = createServiceClient();
  const { data: configs, error } = await db
    .from('model_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true);
  if (error) throw new Error(`Failed to fetch default model: ${error.message}`);
  const rows = configs ?? [];
  const defaultCfg = rows.find((c) => c.is_default) || rows[0];
  if (!defaultCfg) return null;
  return modelRowToAI(defaultCfg);
}

export async function getModelById(userId: string, modelConfigId: string): Promise<AIProvider | null> {
  const db = createServiceClient();
  const { data: c, error } = await db
    .from('model_configs')
    .select('*')
    .eq('id', modelConfigId)
    .eq('user_id', userId)
    .single();
  if (error || !c) return null;
  return modelRowToAI(c);
}

export async function saveModelConfig(data: {
  userId: string;
  provider: string;
  apiKey: string;
  modelId: string;
  displayName: string;
  isDefault?: boolean;
}) {
  const db = createServiceClient();
  const encrypted = encrypt(data.apiKey);
  if (data.isDefault) {
    await db
      .from('model_configs')
      .update({ is_default: false })
      .eq('user_id', data.userId)
      .eq('is_default', true);
  }
  const { data: row, error } = await db
    .from('model_configs')
    .insert({
      user_id: data.userId,
      provider: data.provider,
      api_key: encrypted,
      model_id: data.modelId,
      display_name: data.displayName,
      is_default: data.isDefault || false,
      enabled: true,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to save model: ${error.message}`);
  return row;
}

export async function deleteModelConfig(userId: string, modelId: string) {
  const db = createServiceClient();
  const { error } = await db
    .from('model_configs')
    .delete()
    .eq('id', modelId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to delete model: ${error.message}`);
}

export async function updateModelConfig(userId: string, modelId: string, data: { enabled?: boolean; isDefault?: boolean; displayName?: string }) {
  const db = createServiceClient();
  if (data.isDefault) {
    await db
      .from('model_configs')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('is_default', true);
  }
  const updateData: Record<string, unknown> = {};
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.isDefault !== undefined) updateData.is_default = data.isDefault;
  if (data.displayName !== undefined) updateData.display_name = data.displayName;
  const { error } = await db
    .from('model_configs')
    .update(updateData)
    .eq('id', modelId)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to update model: ${error.message}`);
}

async function* streamGoogle(model: AIProvider, messages: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }[]): AsyncGenerator<string> {
 const contents = messages.map((m) => {
   if (typeof m.content === 'string') return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
   const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
   for (const p of m.content) {
     if (p.type === 'text' && p.text) parts.push({ text: p.text });
     if (p.type === 'image_url' && p.image_url?.url) {
       const b64 = p.image_url.url.startsWith('data:') ? p.image_url.url.split(',')[1] : '';
       const mime = p.image_url.url.startsWith('data:') ? p.image_url.url.split(';')[0].split(':')[1] : 'image/png';
       if (b64) parts.push({ inlineData: { mimeType: mime, data: b64 } });
     }
   }
   return { role: m.role === 'assistant' ? 'model' : 'user', parts };
 });

  const url = `${PROVIDER_META.google.baseUrl}/models/${model.modelId}:streamGenerateContent?alt=sse&key=${model.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Google API error (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(jsonStr);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
      } catch { /* skip */ }
    }
  }
}

async function* streamOpenAICompatible(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>, baseUrl: string): AsyncGenerator<string> {
  const cleaned = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n'),
  }));

  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
    body: JSON.stringify({ model: model.modelId, messages: cleaned, stream: true, temperature: 0.7, max_tokens: 8192 }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(jsonStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* skip */ }
    }
  }
}

async function* streamGroq(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  yield* streamOpenAICompatible(model, messages, PROVIDER_META.groq.baseUrl);
}

async function* streamZai(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  yield* streamOpenAICompatible(model, messages, PROVIDER_META.zai.baseUrl);
}

export function streamChat(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  switch (model.provider) {
    case 'google': return streamGoogle(model, messages);
    case 'groq': return streamGroq(model, messages);
    case 'zai': return streamZai(model, messages);
    default: throw new Error(`Unknown provider: ${model.provider}`);
  }
}

export async function generateTitle(model: AIProvider, userMessage: string): Promise<string> {
  try {
    const messages = [
      { role: 'system', content: 'Generate a very short title (3-6 words max) for a conversation that starts with this message. Return ONLY the title, nothing else.' },
      { role: 'user', content: userMessage.slice(0, 200) },
    ];
    let full = '';
    for await (const chunk of streamChat(model, messages)) {
      full += chunk;
      if (full.length > 60) break;
    }
    return full.trim().replace(/^['"\s]+|['"\s]+$/g, '') || 'New Conversation';
  } catch {
    return userMessage.slice(0, 40).trim() || 'New Conversation';
  }
}

export { PROVIDER_META };
