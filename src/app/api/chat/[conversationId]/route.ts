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
    .select('*, messages(*)')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch attachments for messages
  const { data: allAttachments } = await supabase
    .from('attachments')
    .select('*')
    .in('message_id', (convo.messages ?? []).map((m: { id: string }) => m.id));

  const attachmentsMap = new Map<string, any[]>();
  for (const att of allAttachments ?? []) {
    const list = attachmentsMap.get(att.message_id) ?? [];
    list.push(att);
    attachmentsMap.set(att.message_id, list);
  }

  const messagesWithAttachments = (convo.messages ?? []).map((m: any) => ({
    ...m,
    timestamp: m.created_at ?? m.timestamp,
    attachments: attachmentsMap.get(m.id) ?? [],
  }));

  return NextResponse.json({ ...convo, messages: messagesWithAttachments });
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { conversationId } = await params;
  const body = await req.json();

  if (body.title !== undefined) {
    await supabase.from('conversations').update({ title: body.title }).eq('id', conversationId).eq('user_id', userId);
  }
  return NextResponse.json({ success: true });
}