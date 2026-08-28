"use client";

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

const Background3D = dynamic(() => import('@/components/codewix/Background3D'), { ssr: false });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <Background3D />
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" />
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