import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteModelConfig, updateModelConfig } from '@/lib/ai-providers';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { modelId } = await params;
  const body = await req.json();
  await updateModelConfig(userId, modelId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { modelId } = await params;
  await deleteModelConfig(userId, modelId);
  return NextResponse.json({ success: true });
}