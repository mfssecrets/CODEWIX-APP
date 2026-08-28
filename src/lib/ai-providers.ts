import { encrypt, decrypt } from './crypto';
import { db } from './db';
import { Prisma } from '@prisma/client';

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

export async function getEnabledModels(userId: string): Promise<AIProvider[]> {
 const configs = await db.modelConfig.findMany({ where: { userId, enabled: true } });
 return configs.map((c) => {
 const meta = getModelMeta(c.modelId);
 return {
   provider: c.provider,
   modelId: c.modelId,
   displayName: c.displayName,
   apiKey: decrypt(c.apiKey),
   supportsVision: meta.supportsVision,
   supportsStreaming: meta.supportsStreaming,
 };
 });
}

export async function getDefaultModel(userId: string): Promise<AIProvider | null> {
 const configs = await db.modelConfig.findMany({ where: { userId, enabled: true } });
 const defaultCfg = configs.find((c) => c.isDefault) || configs[0];
 if (!defaultCfg) return null;
 const meta = getModelMeta(defaultCfg.modelId);
 return {
   provider: defaultCfg.provider,
   modelId: defaultCfg.modelId,
   displayName: defaultCfg.displayName,
   apiKey: decrypt(defaultCfg.apiKey),
   supportsVision: meta.supportsVision,
   supportsStreaming: meta.supportsStreaming,
 };
}

export async function getModelById(userId: string, modelConfigId: string): Promise<AIProvider | null> {
 const c = await db.modelConfig.findFirst({ where: { id: modelConfigId, userId } });
 if (!c) return null;
 const meta = getModelMeta(c.modelId);
 return {
   provider: c.provider,
   modelId: c.modelId,
   displayName: c.displayName,
   apiKey: decrypt(c.apiKey),
   supportsVision: meta.supportsVision,
   supportsStreaming: meta.supportsStreaming,
 };
}

export async function saveModelConfig(data: {
 userId: string;
 provider: string;
 apiKey: string;
 modelId: string;
 displayName: string;
 isDefault?: boolean;
}) {
 const encrypted = encrypt(data.apiKey);
 if (data.isDefault) {
   await db.modelConfig.updateMany({ where: { userId: data.userId, isDefault: true }, data: { isDefault: false } });
 }
 return db.modelConfig.create({
   data: {
     userId: data.userId,
     provider: data.provider,
     apiKey: encrypted,
     modelId: data.modelId,
     displayName: data.displayName,
     isDefault: data.isDefault || false,
   },
 });
}

export async function deleteModelConfig(userId: string, modelId: string) {
 return db.modelConfig.deleteMany({ where: { id: modelId, userId } });
}

export async function updateModelConfig(userId: string, modelId: string, data: { enabled?: boolean; isDefault?: boolean; displayName?: string }) {
 if (data.isDefault) {
   await db.modelConfig.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
 }
 return db.modelConfig.updateMany({ where: { id: modelId, userId }, data });
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

async function* streamGroq(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  const cleaned = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n'),
  }));

  const url = `${PROVIDER_META.groq.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
    body: JSON.stringify({ model: model.modelId, messages: cleaned, stream: true, temperature: 0.7, max_tokens: 8192 }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Groq API error (${res.status}): ${err}`);
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

async function* streamZai(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  const cleaned = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n'),
  }));

  const url = `${PROVIDER_META.zai.baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
    body: JSON.stringify({ model: model.modelId, messages: cleaned, stream: true, temperature: 0.7, max_tokens: 8192 }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Z.ai API error (${res.status}): ${err}`);
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
