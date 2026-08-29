"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Bot, Hammer, History, LogOut, CreditCard, Settings, Zap, ArrowLeft, PanelLeftClose, PanelLeft, Cpu } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useUser } from '@/components/Providers';
import { SkeletonPage, SkeletonSidebar, Skeleton } from '@/components/skeleton/SkeletonCard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TokenExhaustedDialog from '@/components/codewix/TokenExhaustedDialog';

const mainNav = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, path: '/chat' },
  { id: 'agent', label: 'Agent', icon: Bot, path: '/agent' },
  { id: 'build', label: 'Build', icon: Hammer, path: '/build' },
];
const secondaryNav = [
  { id: 'history', label: 'History', icon: History, path: '/history' },
  { id: 'pricing', label: 'Pricing', icon: CreditCard, path: '/pricing' },
  { id: 'models', label: 'Models', icon: Cpu, path: '/settings/models' },
];

function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { user, profile, signOut } = useUser();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const isActive = (path: string) => pathname === path || (path !== '/' && pathname.startsWith(path + '/'));

  const handleSignOut = async () => {
    setConfirmSignOut(false);
    await signOut();
  };

  return (
    <>
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`relative flex flex-col h-screen bg-white border-r border-slate-200 z-30 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-purple-500/20 flex-shrink-0 cursor-pointer" onClick={() => router.push('/')}>
            <Image src="/logo.png" alt="CodeWIX" width={36} height={36} className="object-cover" />
          </div>
          {!collapsed && (
            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-[17px] font-semibold tracking-tight text-slate-800 cursor-pointer" onClick={() => router.push('/')}>
              codewix
            </motion.span>
          )}
        </div>

        {!collapsed && <TokenIndicator />}

        <nav className="flex flex-col gap-1 px-3 pt-3">
          {mainNav.map((item) => (
            <motion.button key={item.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push(item.path)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${
                isActive(item.path) ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}>
              <item.icon className={`w-[18px] h-[18px] ${isActive(item.path) ? 'text-violet-600' : 'text-slate-400'}`} strokeWidth={1.8} />
              {!collapsed && <span>{item.label}</span>}
            </motion.button>
          ))}
        </nav>

        <div className="mx-5 my-3 border-t border-slate-200" />

        <nav className="flex flex-col gap-1 px-3">
          {secondaryNav.map((item) => (
            <motion.button key={item.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push(item.path)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${
                isActive(item.path) ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
              }`}>
              <item.icon className={`w-[18px] h-[18px] ${isActive(item.path) ? 'text-violet-600' : 'text-slate-400'}`} strokeWidth={1.8} />
              {!collapsed && <span>{item.label}</span>}
            </motion.button>
          ))}
        </nav>

        <div className="flex-1" />

        {!collapsed && user && profile && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[12px] font-medium text-slate-700 truncate">{profile.name || profile.email}</p>
            <p className="text-[11px] text-slate-400 truncate">{profile.email}</p>
          </div>
        )}

        <div className="px-3 pb-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setConfirmSignOut(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200 w-full border border-transparent hover:border-red-200">
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
            {!collapsed && <span>Sign out</span>}
          </motion.button>
        </div>

        <button onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 text-slate-400 hover:text-slate-600">
          {collapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </button>
      </motion.aside>

      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[16px] font-semibold text-slate-800">Sign out of CodeWIX?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-slate-500">
              You&apos;ll need to sign in again to access your chats, agents, and projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
            <AlertDialogCancel className="mt-0 flex-1">Cancel</AlertDialogCancel>
            <AlertDialogAction className="flex-1 bg-red-500 text-white hover:bg-red-600" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TokenIndicator() {
  const [tokens, setTokens] = useState<{ available: number; total: number } | null>(null);

  useEffect(() => {
    fetch('/api/tokens').then(r => r.json()).then(d => setTokens(d)).catch(() => {});
  }, []);

  if (!tokens) return <div className="px-5 pt-3"><Skeleton className="h-6 rounded-full" /></div>;

  const pct = tokens.total > 0 ? (tokens.available / tokens.total) * 100 : 0;
  const isLow = pct < 20;

  return (
    <div className="px-5 pt-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200">
        <Zap className={`w-3.5 h-3.5 ${isLow ? 'text-amber-500' : 'text-violet-500'}`} strokeWidth={2} />
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-amber-400' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[11px] font-medium ${isLow ? 'text-amber-600' : 'text-slate-500'}`}>{tokens.available}/{tokens.total}</span>
      </div>
    </div>
  );
}

function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/chat' || pathname === '/agent' || pathname === '/build';
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white flex-shrink-0">
      {!isHome && (
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all" title="Go back">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
        </button>
      )}
      <span className="text-[13px] font-medium text-slate-500 capitalize">
        {pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Dashboard'}
      </span>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isPricingPage = pathname === '/pricing';

  useEffect(() => {
    if (!loading && !user && !isPricingPage) router.push('/signin');
  }, [loading, user, router, isPricingPage]);

  if (loading) {
    return (
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <div className="w-[260px] border-r border-slate-200 bg-white"><SkeletonSidebar /></div>
        <div className="flex-1"><SkeletonPage /></div>
      </div>
    );
  }

  if (!user && isPricingPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="CodeWIX" width={28} height={28} className="rounded-lg" />
            <span className="text-[15px] font-semibold text-slate-800">CodeWIX</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/signin" className="text-[13px] font-medium text-slate-600 hover:text-violet-600 transition-colors">Sign in</Link>
            <Link href="/signup" className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-[13px] font-medium hover:shadow-lg hover:shadow-violet-500/25 transition-all">Get Started</Link>
          </div>
        </div>
        {children}
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <SidebarNav />
      <main className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>
      <TokenExhaustedDialog />
    </div>
  );
}
