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

    const { prompt, attachments, modelConfigId, conversationId } = await req.json();
    if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    let model = modelConfigId
      ? await (await import('@/lib/ai-providers')).getModelById(userId, modelConfigId)
      : await getDefaultModel(userId);
    if (!model) {
      const models = await getEnabledModels(userId);
      model = models[0] || null;
    }
    if (!model) return NextResponse.json({ error: 'No AI model configured' }, { status: 400 });

    const hasImages = attachments?.some((a: { fileType: string }) => a.fileType === 'image');
    if (hasImages && !model.supportsVision) {
      return NextResponse.json({ error: `Model ${model.displayName} does not support images` }, { status: 400 });
    }

    let convoId = conversationId;
    if (!convoId) {
      const convo = await db.conversation.create({ data: { userId, type: 'agent', modelId: model.modelId, provider: model.provider } });
      convoId = convo.id;
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
            const b64 = await readFile(join(process.cwd(), a.filePath), 'base64');
            parts.push({ type: 'image_url', image_url: { url: `data:${a.mimeType};base64,${b64}` } });
          } catch { /* skip */ }
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

    await db.message.create({ data: { conversationId: convoId, role: 'user', content: typeof userContent === 'string' ? userContent : prompt } });

    const existing = await db.message.count({ where: { conversationId: convoId } });
    if (existing <= 1) {
      generateTitle(model, prompt).then((title) => {
        db.conversation.update({ where: { id: convoId }, data: { title } }).catch(() => {});
      });
    }

    // Create agent task
    const task = await db.agentTask.create({ data: { conversationId: convoId, status: 'planning', activity: 'Planning' } });

    const history = await db.message.findMany({ where: { conversationId: convoId }, orderBy: { timestamp: 'asc' } });
    const aiMessages = [
      { role: 'system', content: 'You are an expert AI coding agent. Break down tasks into steps, analyze requirements, create files, and provide complete implementations. Structure your output clearly with step-by-step progress.' },
      ...history.map((m) => ({ role: m.role, content: m.content })),
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
            await db.agentTask.update({ where: { id: task.id }, data: agentStates[i] });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', ...agentStates[i] })}\n\n`));
          }
          for await (const chunk of streamChat(model, aiMessages)) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', content: chunk })}\n\n`));
          }
          await db.message.create({ data: { conversationId: convoId, role: 'assistant', content: fullResponse } });
          await db.agentTask.update({ where: { id: task.id }, data: { output: fullResponse, status: 'completed', activity: 'Completed', buildStatus: 'success' } });
          await db.conversation.update({ where: { id: convoId }, data: { updatedAt: new Date() } });
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Agent failed';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`));
          await db.agentTask.update({ where: { id: task.id }, data: { error: errMsg, status: 'completed', activity: 'Failed', buildStatus: 'failed' } });
          if (fullResponse) await db.message.create({ data: { conversationId: convoId, role: 'assistant', content: fullResponse } });
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
