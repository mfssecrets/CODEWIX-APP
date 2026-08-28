import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteModelConfig, updateModelConfig } from '@/lib/ai-providers';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;
  const { modelId } = await params;
  const body = await req.json();
  await updateModelConfig(userId, modelId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;
  const { modelId } = await params;
  await deleteModelConfig(userId, modelId);
  return NextResponse.json({ success: true });
}
