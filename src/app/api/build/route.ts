import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const projectIds = (projects ?? []).map((p) => p.id);

    // Get file counts
    const { data: fileRows } = projectIds.length > 0
      ? await supabase.from('project_files').select('project_id').in('project_id', projectIds)
      : { data: [] };
    const fileCountMap = new Map<string, number>();
    for (const r of fileRows ?? []) {
      fileCountMap.set(r.project_id, (fileCountMap.get(r.project_id) ?? 0) + 1);
    }

    // Get version counts
    const { data: versionRows } = projectIds.length > 0
      ? await supabase.from('project_versions').select('project_id').in('project_id', projectIds)
      : { data: [] };
    const versionCountMap = new Map<string, number>();
    for (const r of versionRows ?? []) {
      versionCountMap.set(r.project_id, (versionCountMap.get(r.project_id) ?? 0) + 1);
    }

    // Get conversation counts (builder_conversations)
    const { data: convoRows } = projectIds.length > 0
      ? await supabase.from('builder_conversations').select('project_id').in('project_id', projectIds)
      : { data: [] };
    const convoCountMap = new Map<string, number>();
    for (const r of convoRows ?? []) {
      convoCountMap.set(r.project_id, (convoCountMap.get(r.project_id) ?? 0) + 1);
    }

    return NextResponse.json({
      projects: (projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        githubRepo: p.github_repo,
        githubBranch: p.github_branch,
        fileCount: fileCountMap.get(p.id) ?? 0,
        versionCount: versionCountMap.get(p.id) ?? 0,
        conversationCount: convoCountMap.get(p.id) ?? 0,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    console.error('Build list error:', error);
    return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST() {
  // POST to /api/build is a redirect - returns the same listing
  return GET();
}
