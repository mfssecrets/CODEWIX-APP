import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth-helper';
import { detectLanguage } from '@/lib/language-detect';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; filePath: string[] }> }
) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const file = await db.projectFile.findFirst({
      where: { projectId, path: filePathStr },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      file: {
        id: file.id,
        path: file.path,
        content: file.content,
        language: file.language || detectLanguage(file.path),
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
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
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existing = await db.projectFile.findFirst({
      where: { projectId, path: filePathStr },
    });

    if (!existing) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { content } = await req.json();

    const file = await db.projectFile.update({
      where: { id: existing.id },
      data: { content: content ?? '' },
    });

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
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { projectId, filePath } = await params;
  const filePathStr = filePath.join('/');

  try {
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const existing = await db.projectFile.findFirst({
      where: { projectId, path: filePathStr },
    });

    if (!existing) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    await db.projectFile.delete({ where: { id: existing.id } });

    return NextResponse.json({ success: true, message: 'File deleted' });
  } catch (error) {
    console.error('Delete file error:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
