"use client";

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100 bg-[length:200%_100%]', className)} style={{ animation: 'skeleton-shimmer 1.5s ease-in-out infinite' }} />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5 rounded-lg', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' };
  return <Skeleton className={cn('rounded-full', sizes[size])} />;
}

export function SkeletonButton({ width = 'w-24' }: { width?: string }) {
  return <Skeleton className={cn('h-9 rounded-xl', width)} />;
}

export function SkeletonInput() {
  return <Skeleton className="h-10 w-full rounded-xl" />;
}

export function SkeletonChatMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className={cn('flex-1 space-y-2', isUser ? 'items-end' : 'items-start')}>
        <Skeleton className={cn('h-20 w-3/4 rounded-2xl', isUser ? 'bg-violet-100' : '')} />
      </div>
    </div>
  );
}

export function SkeletonSidebar() {
  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <Skeleton className="h-9 rounded-xl" />
      <div className="space-y-1.5 mt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={cn('h-9 rounded-lg', i === 0 ? 'bg-violet-100/80' : '')} />
        ))}
      </div>
      <div className="mt-auto space-y-2">
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-8 rounded-lg" />
      </div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    </div>
  );
}