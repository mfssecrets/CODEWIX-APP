import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;
  const { conversationId } = await params;

  const convo = await db.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { timestamp: 'asc' }, include: { attachments: true } }, agentTasks: { orderBy: { createdAt: 'desc' } } },
  });
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(convo);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;
  const { conversationId } = await params;
  await db.conversation.deleteMany({ where: { id: conversationId, userId } });
  return NextResponse.json({ success: true });
}
