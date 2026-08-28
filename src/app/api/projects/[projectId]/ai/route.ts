import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth-helper';
import { getDefaultModel, getModelById, streamChat } from '@/lib/ai-providers';
import { generateTitle } from '@/lib/ai-providers';
import { detectLanguage } from '@/lib/language-detect';

interface ToolCall {
  tool: string;
  path?: string;
  content?: string;
  query?: string;
  dependencies?: string[];
}

function parseToolCalls(text: string): { text: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const regex = /\{[\s\S]*?"tool"\s*:\s*"(\w+)"[\s\S]*?\}/g;
  let cleanText = text;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const jsonStr = match[0];
      const parsed = JSON.parse(jsonStr) as ToolCall;
      if (parsed.tool && ['readFile', 'writeFile', 'createFile', 'deleteFile', 'searchFiles', 'installDeps'].includes(parsed.tool)) {
        toolCalls.push(parsed);
        cleanText = cleanText.replace(jsonStr, '').trim();
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  // Also try to parse standalone JSON blocks
  const jsonBlockRegex = /```json\n?([\s\S]*?)\n?```/g;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as ToolCall;
      if (parsed.tool && ['readFile', 'writeFile', 'createFile', 'deleteFile', 'searchFiles', 'installDeps'].includes(parsed.tool)) {
        toolCalls.push(parsed);
        cleanText = cleanText.replace(match[0], '').trim();
      }
    } catch {
      // Not valid JSON
    }
  }

  return { text: cleanText, toolCalls };
}

function buildSystemPrompt(files: Array<{ path: string; content: string }>): string {
  let fileContext = '';
  if (files.length > 0) {
    fileContext = '\n\nCurrent project files:\n';
    for (const f of files.slice(0, 30)) {
      const preview = f.content.length > 500 ? f.content.slice(0, 500) + '\n... (truncated)' : f.content;
      fileContext += `\n--- ${f.path} ---\n${preview}\n`;
    }
    if (files.length > 30) {
      fileContext += `\n... and ${files.length - 30} more files`;
    }
  }

  return `You are CodeWIX Builder, an expert coding assistant that helps users build projects. You have access to the project file system.

AVAILABLE TOOLS:
When you need to read, create, or modify files, respond with a JSON object containing the tool call. You can include multiple tool calls in a single response. You can also include explanatory text alongside tool calls.

Tool format: {"tool":"<toolName>","path":"<filePath>","content":"<fileContent>"}

Tools available:
1. readFile - {"tool":"readFile","path":"src/App.tsx"} - Read a file's contents
2. writeFile - {"tool":"writeFile","path":"src/App.tsx","content":"..."} - Create or overwrite a file
3. createFile - {"tool":"createFile","path":"src/utils.ts","content":"..."} - Create a new file (error if exists)
4. deleteFile - {"tool":"deleteFile","path":"src/old.ts"} - Delete a file
5. searchFiles - {"tool":"searchFiles","query":"useState"} - Search file contents
6. installDeps - {"tool":"installDeps","dependencies":["react","lucide-react"]} - Note dependencies to install

IMPORTANT RULES:
- Always include the FULL file content when using writeFile or createFile - never use placeholders like "// ... existing code ..."
- When creating React components, always include all necessary imports
- Use modern best practices and clean code patterns
- When the user asks to build something, create all necessary files
- You can mix explanatory text with tool call JSON objects in your response
- Wrap tool call JSON in \`\`\`json code blocks for clarity, or just include them inline
${fileContext}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId } = await params;

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
      include: { files: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { message, attachments, modelConfigId, conversationId } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get AI model
    let model;
    if (modelConfigId) {
      model = await getModelById(userId, modelConfigId);
    } else {
      model = await getDefaultModel(userId);
    }
    if (!model) {
      return NextResponse.json({ error: 'No AI model configured. Please add a model in settings.' }, { status: 400 });
    }

    // Handle or find/create conversation
    let convoId = conversationId;
    let convo: { id: string; title: string; modelId: string | null; provider: string | null } | null = null;

    if (convoId) {
      convo = await db.builderConversation.findFirst({
        where: { id: convoId, projectId },
      });
    }

    if (!convo) {
      // Create new conversation
      convo = await db.builderConversation.create({
        data: {
          projectId,
          title: 'New Conversation',
          modelId: model.modelId,
          provider: model.provider,
        },
      });
      convoId = convo.id;
    }

    // Save user message
    let userContent = message;
    if (attachments && attachments.length > 0) {
      userContent += '\n\n[Attachments: ' + attachments.map((a: { fileName: string }) => a.fileName).join(', ') + ']';
    }

    await db.builderMessage.create({
      data: {
        conversationId: convoId,
        role: 'user',
        content: userContent,
      },
    });

    // Build message history
    const historyMessages = await db.builderMessage.findMany({
      where: { conversationId: convoId },
      orderBy: { timestamp: 'asc' },
    });

    const chatMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: buildSystemPrompt(project.files) },
    ];

    for (const msg of historyMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        chatMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Stream the AI response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullResponse = '';

          for await (const chunk of streamChat(model, chatMessages)) {
            fullResponse += chunk;
            const data = JSON.stringify({ type: 'content', content: chunk });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // Parse and execute tool calls
          const { text: cleanText, toolCalls } = parseToolCalls(fullResponse);

          // Execute tool calls
          for (const tc of toolCalls) {
            try {
              await executeToolCall(projectId, userId, tc, controller, encoder, project.files);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Tool execution failed';
              const errData = JSON.stringify({
                type: 'tool',
                tool: tc.tool,
                path: tc.path,
                status: 'error',
                error: errMsg,
              });
              controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
            }
          }

          // Save assistant message (clean version without tool JSON)
          const activityText = toolCalls.length > 0
            ? `Executed ${toolCalls.length} file operation(s)`
            : undefined;

          await db.builderMessage.create({
            data: {
              conversationId: convoId,
              role: 'assistant',
              content: cleanText || fullResponse,
              activity: activityText,
            },
          });

          // Generate title for new conversations
          if (convo && convo.title === 'New Conversation') {
            try {
              const title = await generateTitle(model, message);
              await db.builderConversation.update({
                where: { id: convoId },
                data: { title },
              });
              const titleData = JSON.stringify({ type: 'title', title });
              controller.enqueue(encoder.encode(`data: ${titleData}\n\n`));
            } catch {
              // Title generation is best-effort
            }
          }

          // Send conversation ID
          const convoData = JSON.stringify({ type: 'conversationId', conversationId: convoId });
          controller.enqueue(encoder.encode(`data: ${convoData}\n\n`));

          // Send done
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Stream error';
          const errData = JSON.stringify({ type: 'error', error: errMsg });
          controller.enqueue(encoder.encode(`data: ${errData}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Builder AI error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

async function executeToolCall(
  projectId: string,
  userId: string,
  tc: ToolCall,
  controller: TransformStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  existingFiles: Array<{ path: string; content: string }>
) {
  switch (tc.tool) {
    case 'readFile': {
      if (!tc.path) throw new Error('Path is required for readFile');
      const file = existingFiles.find((f) => f.path === tc.path);
      if (!file) {
        const dbFile = await db.projectFile.findFirst({ where: { projectId, path: tc.path } });
        if (!dbFile) throw new Error(`File not found: ${tc.path}`);
        const readData = JSON.stringify({ type: 'tool', tool: 'readFile', path: tc.path, status: 'done', content: dbFile.content.slice(0, 2000) });
        controller.enqueue(encoder.encode(`data: ${readData}\n\n`));
      } else {
        const readData = JSON.stringify({ type: 'tool', tool: 'readFile', path: tc.path, status: 'done', content: file.content.slice(0, 2000) });
        controller.enqueue(encoder.encode(`data: ${readData}\n\n`));
      }
      break;
    }

    case 'writeFile': {
      if (!tc.path) throw new Error('Path is required for writeFile');
      if (tc.content === undefined) throw new Error('Content is required for writeFile');

      // Send activity
      const activityData = JSON.stringify({ type: 'activity', activity: `Writing ${tc.path}` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      const normalizedPath = tc.path.replace(/^\/+/, '');
      const language = detectLanguage(normalizedPath);

      await db.projectFile.upsert({
        where: { projectId_path: { projectId, path: normalizedPath } },
        create: { projectId, path: normalizedPath, content: tc.content, language },
        update: { content: tc.content, language },
      });

      const doneData = JSON.stringify({ type: 'tool', tool: 'writeFile', path: tc.path, status: 'done' });
      controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
      break;
    }

    case 'createFile': {
      if (!tc.path) throw new Error('Path is required for createFile');
      if (tc.content === undefined) throw new Error('Content is required for createFile');

      const normalizedPath = tc.path.replace(/^\/+/, '');
      const existing = existingFiles.find((f) => f.path === normalizedPath);
      if (existing) throw new Error(`File already exists: ${tc.path}`);

      const activityData = JSON.stringify({ type: 'activity', activity: `Creating ${tc.path}` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      const language = detectLanguage(normalizedPath);
      await db.projectFile.create({
        data: { projectId, path: normalizedPath, content: tc.content, language },
      });

      const doneData = JSON.stringify({ type: 'tool', tool: 'createFile', path: tc.path, status: 'done' });
      controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
      break;
    }

    case 'deleteFile': {
      if (!tc.path) throw new Error('Path is required for deleteFile');

      const normalizedPath = tc.path.replace(/^\/+/, '');
      const file = await db.projectFile.findFirst({ where: { projectId, path: normalizedPath } });
      if (!file) throw new Error(`File not found: ${tc.path}`);

      const activityData = JSON.stringify({ type: 'activity', activity: `Deleting ${tc.path}` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      await db.projectFile.delete({ where: { id: file.id } });

      const doneData = JSON.stringify({ type: 'tool', tool: 'deleteFile', path: tc.path, status: 'done' });
      controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
      break;
    }

    case 'searchFiles': {
      if (!tc.query) throw new Error('Query is required for searchFiles');

      const activityData = JSON.stringify({ type: 'activity', activity: `Searching for "${tc.query}"` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      const queryLower = tc.query.toLowerCase();
      const results = existingFiles
        .filter((f) => f.content.toLowerCase().includes(queryLower))
        .map((f) => ({ path: f.path, matchCount: f.content.toLowerCase().split(queryLower).length - 1 }))
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, 10);

      const searchData = JSON.stringify({ type: 'tool', tool: 'searchFiles', query: tc.query, status: 'done', results });
      controller.enqueue(encoder.encode(`data: ${searchData}\n\n`));
      break;
    }

    case 'installDeps': {
      if (!tc.dependencies || !Array.isArray(tc.dependencies) || tc.dependencies.length === 0) {
        throw new Error('Dependencies array is required for installDeps');
      }

      const activityData = JSON.stringify({ type: 'activity', activity: `Noting dependencies: ${tc.dependencies.join(', ')}` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      const doneData = JSON.stringify({ type: 'tool', tool: 'installDeps', dependencies: tc.dependencies, status: 'done' });
      controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
      break;
    }

    default:
      throw new Error(`Unknown tool: ${tc.tool}`);
  }
}
