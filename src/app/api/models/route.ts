import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getEnabledModels } from '@/lib/ai-providers';
import { maskApiKey } from '@/lib/crypto';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;

  const configs = await db.modelConfig.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const masked = configs.map((c) => ({ ...c, apiKey: maskApiKey(c.apiKey), rawApiKey: undefined }));
  const enabled = await getEnabledModels(userId);
  return NextResponse.json({ configs: masked, enabled });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as Record<string, unknown>).id as string;

  const body = await req.json();
  if (!body.provider || !body.apiKey || !body.modelId || !body.displayName) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }

  const { saveModelConfig } = await import('@/lib/ai-providers');
  const config = await saveModelConfig({ userId, provider: body.provider, apiKey: body.apiKey, modelId: body.modelId, displayName: body.displayName, isDefault: body.isDefault });
  return NextResponse.json({ success: true, id: config.id });
}