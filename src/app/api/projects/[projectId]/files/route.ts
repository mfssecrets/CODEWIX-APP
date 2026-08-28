import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth-helper';
import { detectLanguage } from '@/lib/language-detect';

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

    const files = await db.projectFile.findMany({
      where: { projectId },
      orderBy: { path: 'asc' },
      select: {
        id: true,
        path: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      files: files.map((f) => ({
        id: f.id,
        path: f.path,
        language: f.language || detectLanguage(f.path),
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
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

    const { path, content } = await req.json();

    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Normalize path: strip leading slashes
    const normalizedPath = path.trim().replace(/^\/+/, '');
    const language = detectLanguage(normalizedPath);

    const file = await db.projectFile.upsert({
      where: {
        projectId_path: {
          projectId,
          path: normalizedPath,
        },
      },
      create: {
        projectId,
        path: normalizedPath,
        content: content || '',
        language,
      },
      update: {
        content: content || '',
        language,
      },
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    console.error('Create/update file error:', error);
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 });
  }
}
