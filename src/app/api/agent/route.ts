import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndConsumeToken, refundToken } from '@/lib/tokens';
import { getDefaultModel, getEnabledModels, streamChat, generateTitle } from '@/lib/ai-providers';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = user.id;

    const { prompt, attachments, modelConfigId, conversationId } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    // Token check
    const tokenCheck = await checkAndConsumeToken(userId, { action: 'agent' });
    if (!tokenCheck.allowed) {
      return NextResponse.json({ error: tokenCheck.reason || 'Token limit reached', tokenExhausted: true }, { status: 429 });
    }

    let model = modelConfigId
      ? await (await import('@/lib/ai-providers')).getModelById(userId, modelConfigId, 'code')
      : await getDefaultModel('code');
    if (!model) {
      const models = await getEnabledModels('code');
      model = models[0] || null;
    }
    if (!model) return NextResponse.json({ error: 'No AI model configured' }, { status: 400 });

    const hasImages = attachments?.some((a: { fileType: string }) => a.fileType === 'image');
    if (hasImages && !model.supportsVision) {
      return NextResponse.json({ error: `Model ${model.displayName} does not support images` }, { status: 400 });
    }

    let convoId = conversationId;
    if (!convoId) {
      const { data: convo } = await supabase
        .from('conversations')
        .insert({ user_id: userId, type: 'agent', model_id: model.modelId, provider: model.provider })
        .select('id')
        .single();
      convoId = convo!.id;
    }

    let userContent = prompt;
    if (hasImages && attachments) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (prompt) parts.push({ type: 'text', text: prompt });
      for (const a of attachments) {
        if (a.fileType === 'image') {
          const { readFile } = await import('fs/promises');
          const { join } = await import('path');
          try {
            const b64 = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), a.filePath), 'base64');
            parts.push({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${b64}` } });
          } catch { /* skip */ }
        } else {
          let text = '';
          try {
            const { readFile } = await import('fs/promises');
            const { join } = await import('path');
            text = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), a.filePath), 'utf-8');
          } catch { text = `[Could not read ${a.fileName}]`; }
          parts.push({ type: 'text', text: `--- Document: ${a.fileName} ---\n${text.slice(0, 30000)}` });
        }
      }
      userContent = parts;
    }

    await supabase.from('messages').insert({
      conversation_id: convoId,
      role: 'user',
      content: typeof userContent === 'string' ? userContent : prompt,
    });

    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convoId);
    if ((count ?? 0) <= 1) {
      generateTitle(model, prompt).then(async (title) => {
        const sb = await createClient();
        await sb.from('conversations').update({ title }).eq('id', convoId);
      });
    }

    // Create agent task
    const { data: task } = await supabase
      .from('agent_tasks')
      .insert({ conversation_id: convoId, status: 'planning', activity: 'Planning' })
      .select('id')
      .single();

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });

    const aiMessages = [
      { role: 'system', content: 'You are an expert AI coding agent. Break down tasks into steps, analyze requirements, create files, and provide complete implementations. Structure your output clearly with step-by-step progress.' },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const agentStates = [
      { status: 'analyzing', activity: 'Analyzing requirements' },
      { status: 'creating', activity: 'Creating implementation' },
      { status: 'testing', activity: 'Testing and validating' },
      { status: 'fixing', activity: 'Fixing issues' },
      { status: 'completed', activity: 'Completed' },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        try {
          for (let i = 0; i < agentStates.length; i++) {
            const sb = await createClient();
            await sb.from('agent_tasks').update(agentStates[i]).eq('id', task!.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', ...agentStates[i] })}\n\n`));
          }
          for await (const chunk of streamChat(model, aiMessages)) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`));
          }
          const sb = await createClient();
          await sb.from('messages').insert({ conversation_id: convoId, role: 'assistant', content: fullResponse });
          await sb.from('agent_tasks').update({ output: fullResponse, status: 'completed', activity: 'Completed', build_status: 'success' }).eq('id', task!.id);
          await sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convoId);
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Agent failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          // Refund the plan token if the agent failed before producing any output.
          if (!fullResponse && !tokenCheck.freeTier) {
            await refundToken(userId, { action: 'agent', conversation_id: convoId });
          }
          const sb = await createClient();
          await sb.from('agent_tasks').update({ error: errMsg, status: 'completed', activity: 'Failed', build_status: 'failed' }).eq('id', task!.id);
          if (fullResponse) await sb.from('messages').insert({ conversation_id: convoId, role: 'assistant', content: fullResponse });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Agent failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
