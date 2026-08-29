/**
 * CODEWIX AI Providers — platform-managed, multi-provider.
 *
 * Architecture (operator-provided platform keys, server-side only):
 *   • Chat mode   → Google Gemini (GEMINI_API_KEY)
 *   • Agent/Build → Cerebras (CEREBRAS_API_KEY) + OpenRouter (OPENROUTER_API_KEY)
 *
 * Users NEVER enter API keys; they pick a model from the picker (like Google
 * AI Studio). Keys are read from env on the server and never sent to the client.
 * Usage is gated per user by the token system tied to their subscription plan.
 *
 * All coding providers (Cerebras, OpenRouter) use the OpenAI-compatible
 * /chat/completions API, so they share streamOpenAICompatible(). Gemini uses
 * its own native streaming format.
 */

export interface AIProvider {
  provider: string;       // 'google' | 'cerebras' | 'openrouter'
  modelId: string;
  displayName: string;
  apiKey: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  category: 'chat' | 'code';
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName: string;
  description: string;
  supportsVision: boolean;
  category: 'chat' | 'code';
}

/**
 * Chat models — powered by the platform Gemini key (GEMINI_API_KEY).
 */
export const CHAT_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.6-flash',
    provider: 'google',
    displayName: 'Gemini 3.6 Flash',
    description: 'Fast, multimodal. Default for Chat.',
    supportsVision: true,
    category: 'chat',
  },
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'google',
    displayName: 'Gemini 3.1 Pro (Preview)',
    description: 'Most capable Gemini for complex reasoning.',
    supportsVision: true,
    category: 'chat',
  },
  {
    id: 'gemini-3.5-flash-lite',
    provider: 'google',
    displayName: 'Gemini 3.5 Flash-Lite',
    description: 'Lowest-latency Gemini variant.',
    supportsVision: true,
    category: 'chat',
  },
];

/**
 * Coding models — power the Agent + Build Studio. Cerebras (fastest, OpenAI-
 * compatible) + OpenRouter (many free coding models). Muted in Chat mode.
 */
export const CODE_MODELS: ModelInfo[] = [
  // ── Cerebras (fastest inference, OpenAI-compatible) ──
  {
    id: 'llama-3.3-70b',
    provider: 'cerebras',
    displayName: 'Llama 3.3 70B (Cerebras)',
    description: 'Default for Agent/Build. Fast + great at code + tool calling.',
    supportsVision: false,
    category: 'code',
  },
  {
    id: 'llama3.1-8b',
    provider: 'cerebras',
    displayName: 'Llama 3.1 8B (Cerebras)',
    description: 'Ultra-fast small model for quick edits.',
    supportsVision: false,
    category: 'code',
  },
  {
    id: 'qwen-3-coder-30b',
    provider: 'cerebras',
    displayName: 'Qwen 3 Coder 30B (Cerebras)',
    description: 'Code-specialised Qwen. Excellent for file generation.',
    supportsVision: false,
    category: 'code',
  },
  // ── OpenRouter (free coding models, OpenAI-compatible) ──
  {
    id: 'z-ai/glm-5.2:free',
    provider: 'openrouter',
    displayName: 'GLM 5.2 (OpenRouter)',
    description: 'Z.ai GLM 5.2 — strong general + coding, 256K context.',
    supportsVision: false,
    category: 'code',
  },
  {
    id: 'cohere/north-mini-code:free',
    provider: 'openrouter',
    displayName: 'Cohere North Mini Code (OpenRouter)',
    description: 'Cohere code-specialised model, 256K context.',
    supportsVision: false,
    category: 'code',
  },
  {
    id: 'google/gemma-4-31b-it:free',
    provider: 'openrouter',
    displayName: 'Gemma 4 31B (OpenRouter)',
    description: 'Google Gemma 4 — general purpose, 262K context.',
    supportsVision: false,
    category: 'code',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    provider: 'openrouter',
    displayName: 'Nemotron 3 Super 120B (OpenRouter)',
    description: 'NVIDIA large reasoning model, 262K context.',
    supportsVision: false,
    category: 'code',
  },
];

export const ALL_MODELS: ModelInfo[] = [...CHAT_MODELS, ...CODE_MODELS];

const PROVIDER_META: Record<string, { baseUrl: string; keyEnv: string }> = {
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyEnv: 'GEMINI_API_KEY' },
  cerebras: { baseUrl: 'https://api.cerebras.ai/v1', keyEnv: 'CEREBRAS_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
};

function providerKey(provider: string): string | undefined {
  const meta = PROVIDER_META[provider];
  return meta ? process.env[meta.keyEnv] : undefined;
}

/**
 * Build an AIProvider for a model id using the platform key. Returns null if
 * the model is unknown or the provider key isn't configured.
 */
function getPlatformModel(modelId: string): AIProvider | null {
  const info = ALL_MODELS.find((m) => m.id === modelId);
  if (!info) return null;
  const apiKey = providerKey(info.provider);
  if (!apiKey) return null;
  return {
    provider: info.provider,
    modelId: info.id,
    displayName: info.displayName,
    apiKey,
    supportsVision: info.supportsVision,
    supportsStreaming: true,
    category: info.category,
  };
}

/** True when at least one provider key is configured. */
export function isPlatformAIConfigured(): boolean {
  return Boolean(providerKey('google') || providerKey('cerebras') || providerKey('openrouter'));
}

/** Models for a category ('chat' | 'code'), or all if omitted. */
export function getAvailableModels(category?: 'chat' | 'code'): ModelInfo[] {
  if (!category) return ALL_MODELS;
  return ALL_MODELS.filter((m) => m.category === category);
}

/** Default model id for a category. */
export function getDefaultModelId(category: 'chat' | 'code'): string {
  return category === 'chat' ? 'gemini-3.6-flash' : 'llama-3.3-70b';
}

/**
 * Resolve a model id to an AIProvider. userId is accepted for compatibility
 * but not used (keys are platform-wide). Falls back to the category default if
 * the model is unknown; `categoryHint` picks the right default when no id is
 * supplied (chat → Gemini, code → Cerebras).
 */
export async function getModelById(_userId: string, modelId: string, categoryHint: 'chat' | 'code' = 'chat'): Promise<AIProvider | null> {
  const id = modelId || getDefaultModelId(categoryHint);
  return getPlatformModel(id);
}

/** Default model for a category. */
export async function getDefaultModel(category: 'chat' | 'code' = 'chat'): Promise<AIProvider | null> {
  return getPlatformModel(getDefaultModelId(category));
}

/** All enabled platform models for a category. */
export async function getEnabledModels(category: 'chat' | 'code' = 'chat'): Promise<AIProvider[]> {
  return getAvailableModels(category)
    .map((m) => getPlatformModel(m.id))
    .filter((m): m is AIProvider => m !== null);
}

// ── Gemini native streaming ──────────────────────────────────────────
async function* streamGoogle(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
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

  // Merge any system message into the first user part (Gemini has no system role).
  const systemMsg = messages.find((m) => m.role === 'system');
  let systemText = '';
  if (systemMsg) {
    systemText = typeof systemMsg.content === 'string'
      ? systemMsg.content
      : (systemMsg.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n');
  }
  if (systemText && contents.length > 0) {
    const first = contents[0];
    const firstText = (first.parts[0]?.text as string | undefined) || '';
    (first.parts as Array<{ text?: string }>).unshift({ text: `${systemText}\n\n${firstText}` });
  }

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

// ── OpenAI-compatible streaming (Cerebras + OpenRouter) ──────────────
async function* streamOpenAICompatible(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>, baseUrl: string, extraHeaders: Record<string, string> = {}): AsyncGenerator<string> {
  const cleaned = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n'),
  }));

  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}`, ...extraHeaders },
    body: JSON.stringify({ model: model.modelId, messages: cleaned, stream: true, temperature: 0.7, max_tokens: 8192 }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${model.provider} API error (${res.status}): ${err}`);
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
    case 'cerebras': return streamOpenAICompatible(model, messages, PROVIDER_META.cerebras.baseUrl);
    case 'openrouter': return streamOpenAICompatible(model, messages, PROVIDER_META.openrouter.baseUrl, {
      'HTTP-Referer': 'https://codewix.in',
      'X-Title': 'CodeWIX',
    });
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
