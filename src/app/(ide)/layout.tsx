"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useUser } from '@/components/Providers';
import { SkeletonPage } from '@/components/skeleton/SkeletonCard';
import TokenExhaustedDialog from '@/components/codewix/TokenExhaustedDialog';

export default function IdeLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/signin');
  }, [loading, user, router]);

  if (loading) return <SkeletonPage />;
  if (!user) return null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-100">
      <button
        onClick={() => router.push('/build')}
        className="absolute top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 shadow-sm hover:shadow-md transition-all duration-200"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
        <span>Projects</span>
      </button>
      {children}
      <TokenExhaustedDialog />
    </div>
  );
}