"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MessageSquare, Bot, Plus, LayoutGrid,
  Settings, ChevronLeft, ChevronRight, Hammer,
} from "lucide-react";
import Image from 'next/image';
import { useUser } from '@/components/Providers';

const mainNav = [
  { id: "chat", label: "Chat", icon: MessageSquare, path: "/chat" },
  { id: "agent", label: "Agent", icon: Bot, path: "/agent" },
  { id: "build", label: "Build", icon: Hammer, path: "/build" },
];

const secondaryNav = [
  { id: "new-project", label: "New Project", icon: Plus, path: "/build" },
  { id: "templates", label: "AI Templates", icon: LayoutGrid, path: "/build" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const { user, loading } = useUser();

  const handleNav = (path: string) => {
    if (user) {
      router.push(path);
    } else {
      router.push(`/signin?redirectTo=${encodeURIComponent(path)}`);
    }
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col h-screen glass-strong border-r border-white/40 z-30 transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5 border-b border-slate-200/50 cursor-pointer"
        onClick={() => router.push('/')}
      >
        <div className="w-9 h-9 rounded-xl overflow-hidden shadow-lg shadow-purple-500/20 flex-shrink-0">
          <Image src="/logo.png" alt="CodeWIX" width={36} height={36} className="object-cover" />
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="text-[17px] font-semibold tracking-tight text-slate-800"
          >
            codewix
          </motion.span>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex flex-col gap-1 px-3 pt-5">
        {mainNav.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleNav(item.path)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-500 hover:bg-slate-100/70 hover:text-slate-700 transition-all duration-200"
          >
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            {!collapsed && <span>{item.label}</span>}
          </motion.button>
        ))}
      </nav>

      {/* Separator */}
      <div className="mx-5 my-4 border-t border-slate-200/50" />

      {/* Secondary Nav */}
      <nav className="flex flex-col gap-1 px-3">
        {secondaryNav.map((item) => (
          <motion.button
            key={item.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleNav(item.path)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-500 hover:bg-slate-100/70 hover:text-slate-700 transition-all duration-200"
          >
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
            {!collapsed && <span>{item.label}</span>}
          </motion.button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <div className="px-3 pb-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleNav('/settings/models')}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium text-slate-500 hover:bg-slate-100/70 hover:text-slate-700 transition-all duration-200 w-full"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.8} />
          {!collapsed && <span>Settings</span>}
        </motion.button>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 text-slate-400 hover:text-slate-600"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>
    </motion.aside>
  );
}
