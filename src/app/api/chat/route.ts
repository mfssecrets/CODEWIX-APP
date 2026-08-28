import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDefaultModel, getEnabledModels, streamChat, generateTitle } from '@/lib/ai-providers';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as Record<string, unknown>).id as string;

    const { message, attachments, modelConfigId, conversationId } = await req.json();
    if (!message?.trim() && (!attachments || !attachments.length)) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let model = modelConfigId
      ? await (await import('@/lib/ai-providers')).getModelById(userId, modelConfigId)
      : await getDefaultModel(userId);
    if (!model) {
      const models = await getEnabledModels(userId);
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
      const convo = await db.conversation.create({ data: { userId, type: 'chat', modelId: model.modelId, provider: model.provider } });
      convoId = convo.id;
    } else {
      const existing = await db.conversation.findFirst({ where: { id: convoId, userId } });
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
            const b64 = await readFile(join(process.cwd(), a.filePath), 'base64');
            parts.push({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${b64}` } });
          } catch { /* skip broken files */ }
        } else {
          let text = '';
          try {
            const { readFile } = await import('fs/promises');
            const { join } = await import('path');
            text = await readFile(join(process.cwd(), a.filePath), 'utf-8');
          } catch { text = `[Could not read ${a.fileName}]`; }
          parts.push({ type: 'text', text: `--- Document: ${a.fileName} ---\n${text.slice(0, 30000)}` });
        }
      }
      userContent = parts;
    }

    // Save user message
    const userMsg = await db.message.create({
      data: { conversationId: convoId, role: 'user', content: typeof userContent === 'string' ? userContent : message },
    });
    if (attachments?.length) {
      await db.attachment.createMany({
        data: attachments.map((a: { fileName: string; filePath: string; fileType: string; fileSize: number; mimeType: string }) => ({ messageId: userMsg.id, ...a })),
      });
    }

    // Generate title for new conversations
    const existingMessages = await db.message.count({ where: { conversationId: convoId } });
    if (existingMessages <= 1) {
      generateTitle(model, message).then((title) => {
        db.conversation.update({ where: { id: convoId }, data: { title } }).catch(() => {});
      });
    }

    // Get conversation history for context
    const history = await db.message.findMany({ where: { conversationId: convoId }, orderBy: { timestamp: 'asc' } });
    const aiMessages = history.map((m) => ({ role: m.role, content: m.content }));

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
          await db.message.create({ data: { conversationId: convoId, role: 'assistant', content: fullResponse } });
          await db.conversation.update({ where: { id: convoId }, data: { updatedAt: new Date() } });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Stream failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
          if (fullResponse) {
            await db.message.create({ data: { conversationId: convoId, role: 'assistant', content: fullResponse } });
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
