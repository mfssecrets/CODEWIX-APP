import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const cursor = searchParams.get('cursor') || undefined;
  const limit = 30;

  let query = supabase
    .from('conversations')
    .select('id, title, type, model_id, provider, created_at, updated_at')
    .eq('user_id', userId);

  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  query = query.order('created_at', { ascending: false }).limit(limit + 1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });

  const conversations = data ?? [];

  // Get message counts for each conversation
  const convoIds = conversations.map((c) => c.id);
  const { data: msgCounts } = convoIds.length > 0
    ? await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', convoIds)
    : { data: [] };

  const countMap = new Map<string, number>();
  for (const mc of msgCounts ?? []) {
    countMap.set(mc.conversation_id, (countMap.get(mc.conversation_id) ?? 0) + 1);
  }

  const hasMore = conversations.length > limit;
  const items = hasMore ? conversations.slice(0, limit) : conversations;
  const nextCursor = hasMore ? items[items.length - 1].created_at : undefined;

  const mapped = items.map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    modelId: c.model_id,
    provider: c.provider,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    _count: { messages: countMap.get(c.id) ?? 0 },
  }));

  return NextResponse.json({ items: mapped, nextCursor });
}