"use client";

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Subtle decorative blobs (no 3D) */}
      <div className="pointer-events-none absolute -top-40 -right-40 w-96 h-96 rounded-full bg-violet-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-purple-200/20 blur-3xl" />

      {/* Home back button */}
      <button
        onClick={() => router.push('/')}
        className="absolute top-5 left-5 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm hover:shadow-md transition-all duration-200"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
        <span>Home</span>
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {children}
      </motion.div>
    </div>
  );
}
