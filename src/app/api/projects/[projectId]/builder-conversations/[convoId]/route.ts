import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; convoId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId, convoId } = await params;

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

    const { data: conversation } = await supabase
      .from('builder_conversations')
      .select('*')
      .eq('id', convoId)
      .eq('project_id', projectId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { data: messages } = await supabase
      .from('builder_messages')
      .select('*')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        modelId: conversation.model_id,
        provider: conversation.provider,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: (messages ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          activity: m.activity,
          timestamp: m.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('Get builder conversation error:', error);
    return NextResponse.json({ error: 'Failed to get conversation' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; convoId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId, convoId } = await params;

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

    const { data: conversation } = await supabase
      .from('builder_conversations')
      .select('id')
      .eq('id', convoId)
      .eq('project_id', projectId)
      .single();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    await supabase.from('builder_conversations').delete().eq('id', convoId);

    return NextResponse.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Delete builder conversation error:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}