import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId } = await params;

  try {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: conversations } = await supabase
      .from('builder_conversations')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    // Get message counts for each conversation
    const convoIds = (conversations ?? []).map((c) => c.id);
    const { data: msgCounts } = convoIds.length > 0
      ? await supabase
          .from('builder_messages')
          .select('conversation_id')
          .in('conversation_id', convoIds)
      : { data: [] };

    const countMap = new Map<string, number>();
    for (const mc of msgCounts ?? []) {
      countMap.set(mc.conversation_id, (countMap.get(mc.conversation_id) ?? 0) + 1);
    }

    return NextResponse.json({
      conversations: (conversations ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        modelId: c.model_id,
        provider: c.provider,
        messageCount: countMap.get(c.id) ?? 0,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (error) {
    console.error('List builder conversations error:', error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
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
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const { data: conversation, error } = await supabase
      .from('builder_conversations')
      .insert({
        project_id: projectId,
        title: body.title || 'New Conversation',
        model_id: body.modelId || null,
        provider: body.provider || null,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error('Create builder conversation error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
