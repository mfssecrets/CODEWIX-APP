"use client";

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Loader2, ArrowLeft, KeyRound, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import AuthCard from '@/components/codewix/AuthCard';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [otpHint, setOtpHint] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), purpose: 'reset' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.code) setOtpHint(data.code);
      setStep(2);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally { setLoading(false); }
  }, [email]);

  const handleOtpChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp]; newOtp[index] = value.slice(-1); setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }, [otp]);

  const handleOtpKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  }, [otp]);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...Array(6).fill('')]; pasted.split('').forEach((d, i) => { newOtp[i] = d; });
    setOtp(newOtp);
    setTimeout(() => inputRefs.current[Math.min(pasted.length, 5)]?.focus(), 0);
  }, []);

  const handleReset = useCallback(async () => {
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter full 6-digit code'); return; }
    if (!password || password.length < 6) { setError('Password must be 6+ characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/otp/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally { setLoading(false); }
  }, [otp, email, password, confirmPassword]);

  return (
    <AuthCard subtitle="Reset your password">
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200/60 text-[13px] text-red-600">{error}</motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="f1" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.3 }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-600">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendCode()} placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleSendCode} disabled={loading}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13.5px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-60 transition-all">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Code'}
            </motion.button>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="f2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }} className="flex flex-col gap-3.5">
            <button onClick={() => { setStep(1); setError(''); }} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.8} /> Back
            </button>
            <div className="flex gap-2.5 justify-center" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input key={i} ref={(el) => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  className="w-11 h-12 text-center text-[18px] font-semibold bg-white/80 border border-slate-200/60 rounded-xl text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              ))}
            </div>
            {otpHint && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/60 text-[12px] text-amber-700 text-center">
                Test code: <span className="font-mono font-bold tracking-wider">{otpHint}</span>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-600">New Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-600">Confirm Password</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200" />
              </div>
            </div>
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={handleReset} disabled={loading || otp.some((d) => !d)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13.5px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-60 transition-all">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password'}
            </motion.button>
          </motion.div>
        )}
        {step === 3 && (
          <motion.div key="f3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" strokeWidth={1.8} />
            </div>
            <h3 className="text-[16px] font-semibold text-slate-800 mb-2">Password reset</h3>
            <p className="text-[13px] text-slate-500 mb-6">Your password has been updated.</p>
            <Link href="/signin" className="flex items-center gap-2 text-[13px] font-semibold text-violet-600 hover:text-violet-700">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthCard>
  );
}