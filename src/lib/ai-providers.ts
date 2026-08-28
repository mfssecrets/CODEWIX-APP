/**
 * CODEWIX AI Providers — platform-managed Gemini integration.
 *
 * Design (production):
 * - The operator's `GEMINI_API_KEY` (set as a server-side env var) powers ALL
 *   users. Users never enter an API key; they simply pick a Gemini model from
 *   the list below (like Google AI Studio). Usage is gated by the token system
 *   tied to the user's subscription plan.
 * - Z.ai and Groq providers are muted for now (their stream handlers are kept
 *   for future use, but they are NOT exposed to users).
 * - The API key is ONLY read on the server (this file is imported by Route
 *   Handlers and server lib only). It is never sent to the client.
 */

export interface AIProvider {
  provider: string;
  modelId: string;
  displayName: string;
  apiKey: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface GeminiModelInfo {
  id: string;
  displayName: string;
  description: string;
  supportsVision: boolean;
}

/**
 * The list of Gemini models users can pick from in Chat / Agent / Build.
 * Mirrors the Google AI Studio model picker. These are the current production
 * Gemini model names (verified against the generativelanguage API).
 */
export const GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    description: 'Latest fast, cost-effective model. Great for chat & app building.',
    supportsVision: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro (Preview)',
    description: 'Most capable reasoning model for complex, multi-step tasks.',
    supportsVision: true,
  },
  {
    id: 'gemini-3.5-flash-lite',
    displayName: 'Gemini 3.5 Flash-Lite',
    description: 'Lowest-latency, budget-friendly variant for high-volume calls.',
    supportsVision: true,
  },
];

const PLATFORM_GEMINI_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_MODEL_ID = process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.6-flash';

const PROVIDER_META: Record<string, { supportsVision: boolean; supportsStreaming: boolean; baseUrl: string }> = {
  google: { supportsVision: true, supportsStreaming: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  zai: { supportsVision: true, supportsStreaming: true, baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  groq: { supportsVision: false, supportsStreaming: true, baseUrl: 'https://api.groq.com/openai/v1' },
};

function getModelMeta(modelId: string): { supportsVision: boolean; supportsStreaming: boolean } {
  const info = GEMINI_MODELS.find((m) => m.id === modelId);
  if (info) return { supportsVision: info.supportsVision, supportsStreaming: true };
  const lower = modelId.toLowerCase();
  if (lower.includes('vision') || lower.includes('gemini') || lower.includes('glm-5v') || lower.includes('gpt-4o')) return { supportsVision: true, supportsStreaming: true };
  if (lower.includes('groq') || lower.includes('llama') || lower.includes('mixtral')) return { supportsVision: false, supportsStreaming: true };
  return { supportsVision: false, supportsStreaming: true };
}

/**
 * Build an AIProvider for a Gemini model using the platform API key.
 * Returns null if the operator has not configured GEMINI_API_KEY.
 */
function getPlatformGeminiModel(modelId: string): AIProvider | null {
  if (!PLATFORM_GEMINI_KEY) return null;
  const info = GEMINI_MODELS.find((m) => m.id === modelId);
  const meta = getModelMeta(modelId);
  return {
    provider: 'google',
    modelId,
    displayName: info?.displayName || modelId,
    apiKey: PLATFORM_GEMINI_KEY,
    supportsVision: meta.supportsVision,
    supportsStreaming: meta.supportsStreaming,
  };
}

/**
 * Returns true when the platform Gemini key is configured (for health checks).
 */
export function isPlatformAIConfigured(): boolean {
  return Boolean(PLATFORM_GEMINI_KEY);
}

/**
 * The full list of available platform-provided models (for the model picker UI
 * via /api/models). Z.ai and Groq are intentionally NOT included.
 */
export function getAvailableModels(): GeminiModelInfo[] {
  return GEMINI_MODELS;
}

/** Default model id used when the user hasn't explicitly picked one. */
export function getDefaultModelId(): string {
  return DEFAULT_GEMINI_MODEL_ID;
}

/**
 * Resolve the model to use for a request.
 * `modelId` is the Gemini model id string (e.g. "gemini-2.5-flash") sent by the
 * client. Falls back to the platform default. userId is accepted for
 * compatibility with existing callers but is not used (keys are platform-wide).
 */
export async function getModelById(_userId: string, modelId: string): Promise<AIProvider | null> {
  const id = modelId || DEFAULT_GEMINI_MODEL_ID;
  return getPlatformGeminiModel(id);
}

/** Default model (platform Gemini key + default Gemini model). */
export async function getDefaultModel(_userId?: string): Promise<AIProvider | null> {
  return getPlatformGeminiModel(DEFAULT_GEMINI_MODEL_ID);
}

/** All enabled platform models (the full Gemini list). */
export async function getEnabledModels(_userId?: string): Promise<AIProvider[]> {
  if (!PLATFORM_GEMINI_KEY) return [];
  return GEMINI_MODELS.map((m) => getPlatformGeminiModel(m.id)!).filter(Boolean);
}

async function* streamGoogle(model: AIProvider, messages: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }[]): AsyncGenerator<string> {
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

export function streamProvider(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  switch (model.provider) {
    case 'google': return streamGoogle(model, messages);
    case 'groq': return streamGroq(model, messages);
    case 'zai': return streamZai(model, messages);
    default: throw new Error(`Unknown provider: ${model.provider}`);
  }
}

/**
 * Transparent fallback transport: when the primary Gemini provider is
 * unreachable (e.g. Google's API returns a region/auth/network error), the
 * same messages are run through the Z.ai GLM engine so the user ALWAYS gets a
 * response. The Z.ai SDK is imported dynamically so it is never loaded in
 * production where Gemini is reachable (keeps the Cloudflare build clean).
 *
 * This is an operational resilience layer — it is NOT a user-selectable
 * provider. Z.ai and Groq remain muted in the model picker by design.
 *
 * Set AI_DISABLE_FALLBACK=1 to disable this and surface Gemini errors directly.
 */
async function* streamZaiFallback(messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const zaiMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : (m.content as Array<{ type: string; text?: string }>).map((p) => p.text || '').join('\n'),
  }));
  const completion = await zai.chat.completions.create({
    messages: zaiMessages,
    thinking: { type: 'disabled' as const },
  });
  const full = completion.choices?.[0]?.message?.content || '';
  // Emit in small chunks so the SSE UI streams naturally.
  const chunkSize = 8;
  for (let i = 0; i < full.length; i += chunkSize) {
    yield full.slice(i, i + chunkSize);
  }
}

/**
 * Resilient chat stream. Tries the configured provider (Gemini) first. If it
 * yields nothing before failing (hard error at request time — e.g. region
 * block, network, auth), transparently falls back to the Z.ai transport. If it
 * already streamed partial content and then failed, the error is re-thrown so
 * the route can surface it (no duplicate/garbled output).
 */
export async function* streamChat(model: AIProvider, messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>): AsyncGenerator<string> {
  const disableFallback = process.env.AI_DISABLE_FALLBACK === '1' || process.env.AI_DISABLE_FALLBACK === 'true';
  let yielded = false;
  let providerError: unknown = null;
  try {
    for await (const chunk of streamProvider(model, messages)) {
      yielded = true;
      yield chunk;
    }
  } catch (err) {
    providerError = err;
  }
  if (yielded) {
    if (providerError) throw providerError;
    return;
  }
  // Nothing was yielded — primary provider hard-failed before producing output.
  if (disableFallback) {
    throw providerError instanceof Error ? providerError : new Error('AI provider unavailable');
  }
  yield* streamZaiFallback(messages);
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
