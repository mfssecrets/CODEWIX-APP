"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '@/components/Providers';
import { SkeletonPage } from '@/components/skeleton/SkeletonCard';

export default function IdeLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/signin');
  }, [loading, user, router]);

  if (loading) return <SkeletonPage />;
  if (!user) return null;

  return <div className="h-screen w-screen overflow-hidden">{children}</div>;
}