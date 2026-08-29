import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAndConsumeToken, refundToken } from '@/lib/tokens';
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId } = await params;

  try {
    // Token check
    const tokenCheck = await checkAndConsumeToken(userId, { action: 'builder', project_id: projectId });
    if (!tokenCheck.allowed) {
      return NextResponse.json({ error: tokenCheck.reason || 'Token limit reached', tokenExhausted: true }, { status: 429 });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: projectFiles } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    const { message, attachments, modelConfigId, conversationId } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get AI model (Build Studio uses coding models — never Gemini)
    let model;
    if (modelConfigId) {
      model = await getModelById(userId, modelConfigId, 'code');
    } else {
      model = await getDefaultModel('code');
    }
    if (!model) {
      return NextResponse.json({ error: 'No AI model configured. Please add a model in settings.' }, { status: 400 });
    }

    // Handle or find/create conversation
    let convoId = conversationId;
    let convo: { id: string; title: string; model_id: string | null; provider: string | null } | null = null;

    if (convoId) {
      const { data } = await supabase
        .from('builder_conversations')
        .select('*')
        .eq('id', convoId)
        .eq('project_id', projectId)
        .single();
      convo = data;
    }

    if (!convo) {
      const { data, error } = await supabase
        .from('builder_conversations')
        .insert({
          project_id: projectId,
          title: 'New Conversation',
          model_id: model.modelId,
          provider: model.provider,
        })
        .select('*')
        .single();
      if (error) throw error;
      convo = data;
      convoId = convo.id;
    }

    // Save user message
    let userContent = message;
    if (attachments && attachments.length > 0) {
      userContent += '\n\n[Attachments: ' + attachments.map((a: { fileName: string }) => a.fileName).join(', ') + ']';
    }

    await supabase.from('builder_messages').insert({
      conversation_id: convoId,
      role: 'user',
      content: userContent,
    });

    // Build message history
    const { data: historyMessages } = await supabase
      .from('builder_messages')
      .select('role, content')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });

    const chatMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: buildSystemPrompt((projectFiles ?? []).map((f: any) => ({ path: f.path, content: f.content }))) },
    ];

    for (const msg of historyMessages ?? []) {
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
          const existingFiles = (projectFiles ?? []).map((f: any) => ({ path: f.path, content: f.content }));

          // Execute tool calls
          for (const tc of toolCalls) {
            try {
              await executeToolCall(projectId, userId, tc, controller, encoder, existingFiles);
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

          const sb = await createClient();
          await sb.from('builder_messages').insert({
            conversation_id: convoId,
            role: 'assistant',
            content: cleanText || fullResponse,
            activity: activityText,
          });

          // Generate title for new conversations
          if (convo && convo.title === 'New Conversation') {
            try {
              const title = await generateTitle(model, message);
              await sb.from('builder_conversations').update({
                title,
              }).eq('id', convoId);
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
          // Refund the plan token if the build AI failed before producing any output.
          if (!fullResponse && !tokenCheck.freeTier) {
            await refundToken(userId, { action: 'builder', project_id: projectId });
          }
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
  _userId: string,
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
        const supabase = await createClient();
        const { data: dbFile } = await supabase
          .from('project_files')
          .select('*')
          .eq('project_id', projectId)
          .eq('path', tc.path)
          .single();
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

      const supabase = await createClient();

      // Upsert
      const { data: existing } = await supabase
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('path', normalizedPath)
        .single();

      if (existing) {
        await supabase.from('project_files').update({ content: tc.content, language }).eq('id', existing.id);
      } else {
        await supabase.from('project_files').insert({ project_id: projectId, path: normalizedPath, content: tc.content, language });
      }

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
      const supabase = await createClient();
      await supabase.from('project_files').insert({
        project_id: projectId,
        path: normalizedPath,
        content: tc.content,
        language,
      });

      const doneData = JSON.stringify({ type: 'tool', tool: 'createFile', path: tc.path, status: 'done' });
      controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
      break;
    }

    case 'deleteFile': {
      if (!tc.path) throw new Error('Path is required for deleteFile');

      const normalizedPath = tc.path.replace(/^\/+/, '');
      const supabase = await createClient();
      const { data: file } = await supabase
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('path', normalizedPath)
        .single();
      if (!file) throw new Error(`File not found: ${tc.path}`);

      const activityData = JSON.stringify({ type: 'activity', activity: `Deleting ${tc.path}` });
      controller.enqueue(encoder.encode(`data: ${activityData}\n\n`));

      await supabase.from('project_files').delete().eq('id', file.id);

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
