import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from './db';
import { compare } from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        otp: { label: 'OTP', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email } });
        if (!user) return null;

        // OTP-based login (no password required)
        if (credentials.otp) {
          const record = await db.otpCode.findFirst({
            where: { email: credentials.email, code: credentials.otp, purpose: 'signin', expiresAt: { gt: new Date() } },
          });
          if (!record) return null;
          await db.otpCode.update({ where: { id: record.id }, data: { verified: true } });
          return { id: user.id, email: user.email, name: user.name };
        }

        // Password-based login
        if (!credentials?.password) return null;
        if (!user.password) return null;
        const valid = await compare(credentials.password, user.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'codewix-secret-change-in-production',
};
