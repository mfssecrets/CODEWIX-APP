import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { conversationId } = await params;

  const { data: convo } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  // Fetch attachments for messages
  const msgIds = (messages ?? []).map((m: { id: string }) => m.id);
  const { data: allAttachments } = msgIds.length > 0
    ? await supabase.from('attachments').select('*').in('message_id', msgIds)
    : { data: [] };

  const attachmentsMap = new Map<string, any[]>();
  for (const att of allAttachments ?? []) {
    const list = attachmentsMap.get(att.message_id) ?? [];
    list.push(att);
    attachmentsMap.set(att.message_id, list);
  }

  const messagesWithAttachments = (messages ?? []).map((m: any) => ({
    ...m,
    timestamp: m.created_at ?? m.timestamp,
    attachments: attachmentsMap.get(m.id) ?? [],
  }));

  // Fetch agent tasks
  const { data: agentTasks } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    ...convo,
    messages: messagesWithAttachments,
    agentTasks: agentTasks ?? [],
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { conversationId } = await params;

  await supabase.from('conversations').delete().eq('id', conversationId).eq('user_id', userId);
  return NextResponse.json({ success: true });
}