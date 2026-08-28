import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth-helper';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId } = await params;

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const versions = await db.projectVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        fileCount: (() => { try { return Object.keys(JSON.parse(v.files)).length; } catch { return 0; } })(),
        createdAt: v.createdAt,
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
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId } = await params;

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await req.json();
    const label = body.label || `v${new Date().toISOString().slice(0, 16).replace('T', '-')}`;

    // Snapshot all current files
    const files = await db.projectFile.findMany({
      where: { projectId },
      select: { path: true, content: true },
    });

    const fileSnapshot: Record<string, string> = {};
    for (const f of files) {
      fileSnapshot[f.path] = f.content;
    }

    const version = await db.projectVersion.create({
      data: {
        projectId,
        label,
        files: JSON.stringify(fileSnapshot),
      },
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    console.error('Create version error:', error);
    return NextResponse.json({ error: 'Failed to create version' }, { status: 500 });
  }
}
