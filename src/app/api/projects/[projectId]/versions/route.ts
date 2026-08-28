import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId } = await params;

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

    const { data: versions } = await supabase
      .from('project_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      versions: (versions ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        fileCount: (() => { try { return Object.keys(JSON.parse(v.files)).length; } catch { return 0; } })(),
        createdAt: v.created_at,
      })),
    });
  } catch (error) {
    console.error('List versions error:', error);
    return NextResponse.json({ error: 'Failed to list versions' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId } = await params;

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

    const body = await req.json();
    const label = body.label || `v${new Date().toISOString().slice(0, 16).replace('T', '-')}`;

    // Snapshot all current files
    const { data: files } = await supabase
      .from('project_files')
      .select('path, content')
      .eq('project_id', projectId);

    const fileSnapshot: Record<string, string> = {};
    for (const f of files ?? []) {
      fileSnapshot[f.path] = f.content;
    }

    const { data: version, error } = await supabase
      .from('project_versions')
      .insert({
        project_id: projectId,
        label,
        files: JSON.stringify(fileSnapshot),
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create version' }, { status: 500 });
    }

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    console.error('Create version error:', error);
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 });
  }
}
