import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;

  const convo = await db.conversation.create({ data: { userId, type: 'chat', title: 'New Conversation' } });
  return NextResponse.json({ id: convo.id, title: convo.title });
}
