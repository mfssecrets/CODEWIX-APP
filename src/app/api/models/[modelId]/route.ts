import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH/DELETE /api/models/[modelId] — disabled.
 *
 * Per-user model management (enable/disable/default/delete) is no longer
 * applicable because models are platform-managed. These endpoints return
 * success no-ops so any stray client calls don't break; the Settings page
 * has been rewritten to a read-only view.
 */
async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await params; // consume
  return NextResponse.json({ success: true, note: 'Models are platform-managed; no per-user changes required.' });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ modelId: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await params; // consume
  return NextResponse.json({ success: true, note: 'Models are platform-managed; no per-user changes required.' });
}
