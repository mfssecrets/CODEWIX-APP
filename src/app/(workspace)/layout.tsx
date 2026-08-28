"use client";

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { MessageSquare, Bot, Plus, LayoutGrid, Settings, History, LogOut, Hammer } from 'lucide-react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import Image from 'next/image';

const Background3D = dynamic(() => import('@/components/codewix/Background3D'), { ssr: false });

const mainNav = [
  { id: 'chat', label: 'Chat', icon: MessageSquare, path: '/chat' },
  { id: 'agent', label: 'Agent', icon: Bot, path: '/agent' },
  { id: 'build', label: 'Build', icon: Hammer, path: '/build' },
];
const secondaryNav = [
  { id: 'history', label: 'History', icon: History, path: '/history' },
  { id: 'models', label: 'Model Settings', icon: Settings, path: '/settings/models' },
];

function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path: string) => pathname === path || (path !== '/' && pathname.startsWith(path + '/'));

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col h-screen glass-strong border-r border-white/40 z-30 transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}
    >
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-200/50">
        <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-purple-500/20 flex-shrink-0 cursor-pointer" onClick={() => router.push('/')}>
          <Image src="/logo.png" alt="CodeWIX" width={36} height={36} className="object-cover" />
        </div>
        {!collapsed && (
          <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="text-[17px] font-semibold tracking-tight text-slate-800 cursor-pointer" onClick={() => router.push('/')}>
            codewix
          </motion.span>
        )}
      </div>

      <nav className="flex flex-col gap-1 px-3 pt-5">
        {mainNav.map((item) => (
          <motion.button key={item.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push(item.path)}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${
              isActive(item.path) ? 'bg-purple-50 text-violet-700' : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-700'
            }`}>
            {isActive(item.path) && (
              <motion.div layoutId="activeTab" className="absolute inset-0 rounded-xl bg-purple-50/80" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />
            )}
            <item.icon className={`relative z-10 w-[18px] h-[18px] ${isActive(item.path) ? 'text-violet-600' : ''}`} strokeWidth={1.8} />
            {!collapsed && <span className="relative z-10">{item.label}</span>}
          </motion.button>
        ))}
      </nav>

      <div className="mx-5 my-4 border-t border-slate-200/50" />

      <nav className="flex flex-col gap-1 px-3">
        {secondaryNav.map((item) => (
          <motion.button key={item.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push(item.path)}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-200 ${
              isActive(item.path) ? 'bg-purple-50 text-violet-700' : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-700'
            }`}>
            {isActive(item.path) && (
              <motion.div layoutId="activeTab" className="absolute inset-0 rounded-xl bg-purple-50/80" transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }} />
            )}
            <item.icon className={`relative z-10 w-[18px] h-[18px] ${isActive(item.path) ? 'text-violet-600' : ''}`} strokeWidth={1.8} />
            {!collapsed && <span className="relative z-10">{item.label}</span>}
          </motion.button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="px-3 pb-3">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => signOut({ callbackUrl: '/signin' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-500 hover:bg-red-50/80 hover:text-red-600 transition-all duration-200 w-full">
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.8} />
          {!collapsed && <span>Sign out</span>}
        </motion.button>
      </div>

      <button onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 text-slate-400 hover:text-slate-600">
        {collapsed ? <span className="text-xs">›</span> : <span className="text-xs">‹</span>}
      </button>
    </motion.aside>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => { if (status === 'unauthenticated') router.push('/signin'); }, [status, router]);

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" /></div>;
  }
  if (!session) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Background3D />
      <SidebarNav />
      <main className="relative flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
