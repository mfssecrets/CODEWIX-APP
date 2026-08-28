import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  const { data: convo, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, type: 'chat', title: 'New Conversation' })
    .select('id, title')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  return NextResponse.json({ id: convo.id, title: convo.title });
}