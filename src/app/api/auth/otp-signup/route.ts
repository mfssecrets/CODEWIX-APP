import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encode } from 'next-auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const { email, name, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP are required' }, { status: 400 });
    }

    // Verify OTP for purpose 'signup'
    const otpRecord = await db.otpCode.findFirst({
      where: {
        email,
        code: otp,
        purpose: 'signup',
        verified: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
    }

    // Mark OTP as verified
    await db.otpCode.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    // Check if user already exists (shouldn't happen due to send check, but be safe)
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    // Create user (no password for OTP users)
    const user = await db.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
      },
    });

    // Create JWT token
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      secret: process.env.NEXTAUTH_SECRET || 'codewix-secret-change-in-production',
    });

    // Create session in database
    const sessionToken = token;
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name },
    });

    // Set the session cookie
    response.cookies.set('next-auth.session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires,
    });

    return response;
  } catch (error) {
    console.error('OTP signup error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}
