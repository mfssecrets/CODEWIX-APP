import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectLanguage } from '@/lib/language-detect';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

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

    const { data: file } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .eq('path', filePathStr)
      .single();

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      file: {
        id: file.id,
        path: file.path,
        content: file.content,
        language: file.language || detectLanguage(file.path),
        createdAt: file.created_at,
        updatedAt: file.updated_at,
      },
    });
  } catch (error) {
    console.error('Get file error:', error);
    return NextResponse.json({ error: 'Failed to get file' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

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

    const { data: existing } = await supabase
      .from('project_files')
      .select('id')
      .eq('project_id', projectId)
      .eq('path', filePathStr)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { content } = await req.json();

    const { data: file, error } = await supabase
      .from('project_files')
      .update({ content: content ?? '' })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
    }

    return NextResponse.json({ file });
  } catch (error) {
    console.error('Update file error:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;
  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

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

    const { data: existing } = await supabase
      .from('project_files')
      .select('id')
      .eq('project_id', projectId)
      .eq('path', filePathStr)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await supabase.from('project_files').delete().eq('id', existing.id);

    return NextResponse.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
