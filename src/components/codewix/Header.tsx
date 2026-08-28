"use client";

import { motion } from "framer-motion";
import { LogOut, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useUser } from "@/components/Providers";
import { Skeleton } from "@/components/skeleton/SkeletonCard";

export default function Header() {
  const { user, profile, loading, signOut } = useUser();

  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-between px-6 py-3.5"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-lg shadow-purple-500/20">
          <Image src="/logo.png" alt="CodeWIX" width={32} height={32} className="object-cover" />
        </div>
        <span className="text-[17px] font-semibold tracking-tight text-slate-800">CodeWIX</span>
      </Link>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* API Status */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50/80 border border-emerald-200/50"
        >
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-40" />
          </div>
          <span className="text-[11.5px] font-semibold text-emerald-700 tracking-wide uppercase">Online</span>
        </motion.div>

        {loading ? (
          <Skeleton className="w-32 h-9 rounded-xl" />
        ) : user ? (
          <div className="flex items-center gap-2">
            <Link href="/chat" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 transition-all duration-200">
              <User className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <button onClick={signOut} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all duration-200" title="Sign out">
              <LogOut className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/signin" className="px-4 py-2 rounded-xl text-[13px] font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all duration-200">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 transition-all duration-200">
              Get Started
            </Link>
          </div>
        )}
      </div>
    </motion.header>
  );
}