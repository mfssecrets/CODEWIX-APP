import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectLanguage } from '@/lib/language-detect';

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

    const { data: files } = await supabase
      .from('project_files')
      .select('id, path, language, created_at, updated_at')
      .eq('project_id', projectId)
      .order('path', { ascending: true });

    return NextResponse.json({
      files: (files ?? []).map((f) => ({
        id: f.id,
        path: f.path,
        language: f.language || detectLanguage(f.path),
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    });
  } catch (error) {
    console.error('List files error:', error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
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

    const { path, content } = await req.json();

    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Normalize path: strip leading slashes
    const normalizedPath = path.trim().replace(/^\/+/, '');
    const language = detectLanguage(normalizedPath);

    // Upsert: check if file exists first
    const { data: existing } = await supabase
      .from('project_files')
      .select('id')
      .eq('project_id', projectId)
      .eq('path', normalizedPath)
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('project_files')
        .update({ content: content || '', language })
        .eq('id', existing.id)
        .select('*')
        .single();
      result = data;
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('project_files')
        .insert({ project_id: projectId, path: normalizedPath, content: content || '', language })
        .select('*')
        .single();
      result = data;
      if (error) throw error;
    }

    return NextResponse.json({ file: result }, { status: 201 });
  } catch (error) {
    console.error('Create/update file error:', error);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
