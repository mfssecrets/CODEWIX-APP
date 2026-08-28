import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email, purpose } = await req.json();

    if (!email || !purpose) {
      return NextResponse.json({ error: 'Email and purpose are required' }, { status: 400 });
    }

    const validPurposes = ['signup', 'signin', 'reset'];
    if (!validPurposes.includes(purpose)) {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    const existingUser = await db.user.findUnique({ where: { email } });

    if (purpose === 'signup' && existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    if ((purpose === 'signin' || purpose === 'reset') && !existingUser) {
      return NextResponse.json({ error: 'No account found with this email' }, { status: 404 });
    }

    // Invalidate any previous unverified codes for this email+purpose
    await db.otpCode.deleteMany({
      where: { email, purpose, verified: false },
    });

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.otpCode.create({
      data: {
        email,
        code,
        purpose,
        expiresAt,
      },
    });

    // In production, send email here. For now, return the code for testing.
    return NextResponse.json({
      success: true,
      code,
      message: 'OTP sent',
    });
  } catch (error) {
    console.error('OTP send error:', error);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
