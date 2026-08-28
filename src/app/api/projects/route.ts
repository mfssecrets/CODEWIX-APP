import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canCreateProject } from '@/lib/subscription';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  try {
    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    // Get file counts
    const projectIds = (projects ?? []).map((p) => p.id);
    const { data: fileCounts } = projectIds.length > 0
      ? await supabase
          .from('project_files')
          .select('project_id')
          .in('project_id', projectIds)
      : { data: [] };

    const countMap = new Map<string, number>();
    for (const fc of fileCounts ?? []) {
      countMap.set(fc.project_id, (countMap.get(fc.project_id) ?? 0) + 1);
    }

    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        github_repo: p.github_repo,
        github_branch: p.github_branch,
        fileCount: countMap.get(p.id) ?? 0,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    console.error('List projects error:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = user.id;

  try {
    // Check project creation limit
    const canCreate = await canCreateProject(userId);
    if (!canCreate.allowed) {
      return NextResponse.json({ error: canCreate.reason || 'Project limit reached' }, { status: 403 });
    }

    const { name, description } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
