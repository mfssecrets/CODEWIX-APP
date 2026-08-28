import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const cursor = searchParams.get('cursor') || undefined;
  const limit = 30;

  const where = {
    userId,
    ...(search ? { title: { contains: search } } : {}),
  };

  const conversations = await db.conversation.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true, title: true, type: true, modelId: true, provider: true,
      createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  const hasMore = conversations.length > limit;
  const items = hasMore ? conversations.slice(0, limit) : conversations;
  const nextCursor = hasMore ? items[items.length - 1].id : undefined;

  return NextResponse.json({ items, nextCursor });
}