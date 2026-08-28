import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth-helper';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  try {
    const projects = await db.project.findMany({
      where: { userId },
      include: {
        _count: { select: { files: true, versions: true, conversations: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        githubRepo: p.githubRepo,
        githubBranch: p.githubBranch,
        fileCount: p._count.files,
        versionCount: p._count.versions,
        conversationCount: p._count.conversations,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
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
