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

    const { message, attachments, modelConfigId, conversationId } = await req.json();
    if (!message?.trim() && (!attachments || !attachments.length)) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Token check — returns whether this prompt was free or paid
    const tokenCheck = await checkAndConsumeToken(userId, { action: 'chat' });
    if (!tokenCheck.allowed) {
      return NextResponse.json({ error: tokenCheck.reason || 'Token limit reached', tokenExhausted: true }, { status: 429 });
    }

    let model = modelConfigId
      ? await (await import('@/lib/ai-providers')).getModelById(userId, modelConfigId, 'chat')
      : await getDefaultModel('chat');
    if (!model) {
      const models = await getEnabledModels('chat');
      model = models[0] || null;
    }
    if (!model) return NextResponse.json({ error: 'No AI model configured. Please add a model in Settings.' }, { status: 400 });

    // Check vision support for image attachments
    const hasImages = attachments?.some((a: { fileType: string }) => a.fileType === 'image');
    if (hasImages && !model.supportsVision) {
      return NextResponse.json({ error: `Model ${model.displayName} does not support image inputs. Please use a vision-capable model.` }, { status: 400 });
    }

    // Build or find conversation
    let convoId = conversationId;
    if (!convoId) {
      const { data: convo } = await supabase
        .from('conversations')
        .insert({ user_id: userId, type: 'chat', model_id: model.modelId, provider: model.provider })
        .select('id')
        .single();
      convoId = convo!.id;
    } else {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', convoId)
        .eq('user_id', userId)
        .single();
      if (!existing) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Build user message content
    let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = message;
    if (hasImages && attachments) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (message) parts.push({ type: 'text', text: message });
      for (const a of attachments) {
        if (a.fileType === 'image') {
          const { readFile } = await import('fs/promises');
          const { join } = await import('path');
          try {
            const b64 = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), a.filePath), 'base64');
            parts.push({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${b64}` } });
          } catch { /* skip broken files */ }
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

    // Save user message
    const { data: userMsg } = await supabase
      .from('messages')
      .insert({ conversation_id: convoId, role: 'user', content: typeof userContent === 'string' ? userContent : message })
      .select('id')
      .single();

    if (attachments?.length && userMsg) {
      await supabase.from('attachments').insert(
        attachments.map((a: { fileName: string; filePath: string; fileType: string; fileSize: number; mimeType: string }) => ({
          message_id: userMsg.id,
          file_name: a.fileName,
          file_path: a.filePath,
          file_type: a.fileType,
          file_size: a.fileSize,
          mime_type: a.mimeType,
        }))
      );
    }

    // Generate title for new conversations
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convoId);
    if ((count ?? 0) <= 1) {
      generateTitle(model, message).then(async (title) => {
        const sb = await createClient();
        await sb.from('conversations').update({ title }).eq('id', convoId);
      });
    }

    // Get conversation history for context
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });
    const aiMessages = (history ?? []).map((m) => ({ role: m.role, content: m.content }));

    // Stream AI response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        try {
          for await (const chunk of streamChat(model, aiMessages)) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
          }
          // Save AI message
          const sb = await createClient();
          await sb.from('messages').insert({ conversation_id: convoId, role: 'assistant', content: fullResponse });
          await sb.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convoId);
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Stream failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
          // Refund the plan token if the stream failed before producing any output.
          if (!fullResponse && !tokenCheck.freeTier) {
            await refundToken(userId, { action: 'chat', conversation_id: convoId });
          }
          if (fullResponse) {
            const sb = await createClient();
            await sb.from('messages').insert({ conversation_id: convoId, role: 'assistant', content: fullResponse });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Chat failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
