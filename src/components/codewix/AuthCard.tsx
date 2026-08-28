"use client";

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

export default function AuthCard({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="glass-strong rounded-3xl border border-white/50 shadow-2xl shadow-purple-500/5 p-8 sm:p-10">
      <div className="flex flex-col items-center mb-8">
        <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/20 mb-4">
          <Image src="/logo.png" alt="CodeWIX" width={48} height={48} className="object-cover" />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight text-slate-800">codewix</h1>
        {subtitle && <p className="text-[13.5px] text-slate-500 mt-1.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
