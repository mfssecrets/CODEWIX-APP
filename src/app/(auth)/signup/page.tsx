"use client";

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Loader2, Mail, ArrowLeft, KeyRound, User } from 'lucide-react';
import Link from 'next/link';
import AuthCard from '@/components/codewix/AuthCard';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOtp = useCallback(async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim()) { setError('Please enter your email'); return; }
    setError('');
    setSending(true);
    try {
      // Pure 6-digit email OTP — NO magic link. Supabase sends the code
      // because the email template uses {{ .Token }} (not {{ .ConfirmationURL }}).
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          data: { name: name.trim() },
        },
      });
      if (err) throw err;
      setStep(2);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally { setSending(false); }
  }, [name, email, supabase]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }, [otp]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'Enter' && otp.every((d) => d !== '')) handleVerify();
  }, [otp]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...Array(6).fill('')];
    pasted.split('').forEach((d, i) => { newOtp[i] = d; });
    setOtp(newOtp);
    setTimeout(() => inputRefs.current[Math.min(pasted.length, 5)]?.focus(), 0);
  }, []);

  const handleVerify = useCallback(async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Please enter the full 6-digit code'); return; }
    setError('');
    setVerifying(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'email',
      });
      if (err) throw err;
      // Update profile name
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ name: name.trim() }).eq('id', user.id);
      }
      // Fire a transactional welcome email via Resend (best-effort, never blocks signup)
      fetch('/api/email/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      }).catch(() => { /* ignore */ });
      router.push('/chat');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setVerifying(false); }
  }, [otp, email, name, router, supabase]);

  const handleResend = useCallback(async () => {
    setError('');
    setSending(true);
    try {
      // Pure 6-digit email OTP resend — NO magic link.
      const { error: err } = await supabase.auth.resend({
        type: 'email',
        email: email.trim(),
      });
      if (err) throw err;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
    } finally { setSending(false); }
  }, [email, supabase]);

  return (
    <AuthCard subtitle="Create your CodeWIX account">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200/60 text-[13px] text-red-600">{error}</motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.3 }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-600">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-600">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()} placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
              </div>
            </div>
            <motion.button type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleSendOtp} disabled={sending}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13.5px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-60 transition-all duration-200">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="flex items-center gap-2">Create Account <ArrowRight className="w-4 h-4" /></span>}
            </motion.button>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }} className="flex flex-col gap-4">
            <button onClick={() => { setStep(1); setOtp(Array(6).fill('')); setError(''); }} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.8} /> Back
            </button>
            <p className="text-[13px] text-slate-500">Enter the 6-digit code sent to <span className="font-medium text-slate-700">{email}</span></p>
            <div className="flex gap-2.5 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input key={i} ref={(el) => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-[18px] font-semibold bg-white/80 border border-slate-200/60 rounded-xl text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              ))}
            </div>
            <motion.button type="button" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleVerify} disabled={verifying || otp.some((d) => !d)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13.5px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-60 transition-all duration-200">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <><KeyRound className="w-4 h-4" strokeWidth={1.8} /> Verify & Create Account</>}
            </motion.button>
            <button type="button" onClick={handleResend} disabled={sending} className="text-[12.5px] text-slate-500 hover:text-violet-600 transition-colors disabled:opacity-50">
              {sending ? 'Sending...' : 'Resend code'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-6 pt-4 border-t border-slate-200/50 flex items-center justify-center">
        <p className="text-center text-[13px] text-slate-500">Already have an account? <Link href="/signin" className="font-medium text-violet-600 hover:text-violet-700 transition-colors">Sign in</Link></p>
      </div>
    </AuthCard>
  );
}