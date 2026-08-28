"use client";

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Mail, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import AuthCard from '@/components/codewix/AuthCard';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSendReset = useCallback(async () => {
    if (!email.trim()) { setError('Please enter your email'); return; }
    setError('');
    setSending(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/api/auth/callback?redirectTo=/chat`,
      });
      if (err) throw err;
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally { setSending(false); }
  }, [email, supabase]);

  return (
    <AuthCard subtitle="Reset your password">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200/60 text-[13px] text-red-600">{error}</motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200/60 text-[13px] text-green-600">
            Check your email for a password reset link.
          </motion.div>
        )}
      </AnimatePresence>

      {!success && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] font-medium text-slate-600">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendReset()} placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
            </div>
          </div>
          <motion.button type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleSendReset} disabled={sending}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13.5px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-60 transition-all duration-200">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
          </motion.button>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-200/50">
        <p className="text-center text-[13px] text-slate-500">
          <Link href="/signin" className="flex items-center justify-center gap-1.5 font-medium text-violet-600 hover:text-violet-700 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.8} /> Back to sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}