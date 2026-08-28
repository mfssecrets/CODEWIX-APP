"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUp, Plus, Code2, Play, Globe, Database, Layers, PenTool, LineChart, MessageCircle } from "lucide-react";
import { useUser } from "@/components/Providers";

const actionChips = [
  { id: "im", label: "IM", icon: MessageCircle, color: "violet" },
  { id: "fullstack", label: "Full-Stack", icon: Layers, color: "slate" },
  { id: "uiux", label: "UI / UX", icon: PenTool, color: "slate" },
  { id: "data", label: "Data Insight", icon: LineChart, color: "slate" },
];

const floatingItems = [
  { icon: Code2, x: "-15%", y: "-20%", delay: 0, label: "</>" },
  { icon: Globe, x: "12%", y: "-30%", delay: 0.2, label: "" },
  { icon: Database, x: "-18%", y: "15%", delay: 0.4, label: "" },
  { icon: Play, x: "15%", y: "10%", delay: 0.6, label: "" },
];

export default function HeroSection() {
  const [activeChip, setActiveChip] = useState("im");
  const [inputValue, setInputValue] = useState("");
  const router = useRouter();
  const { user } = useUser();

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    if (!user) {
      router.push(`/signup?redirectTo=${encodeURIComponent('/chat')}%26prompt=${encodeURIComponent(inputValue.trim())}`);
      return;
    }
    router.push(`/chat?prompt=${encodeURIComponent(inputValue.trim())}`);
  };

  return (
    <section className="relative flex flex-col items-center justify-center px-6 pt-8 pb-4 min-h-[480px]">
      {/* Floating 3D-style Elements */}
      {floatingItems.map((item, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none hidden lg:block"
          style={{ left: item.x, top: item.y }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 0.7, 0.5, 0.7],
            scale: [0.5, 1, 0.95, 1],
            y: [0, -12, -4, -12],
          }}
          transition={{
            duration: 6,
            delay: item.delay,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut",
          }}
        >
          <div className="relative w-14 h-14 rounded-2xl bg-white/50 border border-purple-100/40 shadow-lg shadow-purple-500/5 flex flex-col items-center justify-center backdrop-blur-sm">
            <item.icon className="w-6 h-6 text-violet-400" strokeWidth={1.5} />
            {item.label && (
              <span className="text-[9px] font-mono text-violet-400/80 mt-0.5">
                {item.label}
              </span>
            )}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 to-transparent" />
          </div>
        </motion.div>
      ))}

      {/* Headline */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-center mb-6"
      >
        <h1 className="text-[42px] sm:text-[48px] lg:text-[54px] font-bold tracking-tight leading-[1.1] text-slate-800">
          Build anything{" "}
          <span className="text-gradient-hero">with codewix</span>
        </h1>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-[15px] text-slate-500 max-w-md mx-auto leading-relaxed"
        >
          Describe your idea and let AI build your website, web app or mobile app.
        </motion.p>
      </motion.div>

      {/* Input Box */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[620px] mb-5"
      >
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-200/60 via-purple-200/40 to-violet-200/60 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />
          <div className="relative flex items-center gap-3 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 px-5 py-3.5 shadow-lg shadow-slate-200/30 group-focus-within:shadow-xl group-focus-within:shadow-purple-500/10 transition-all duration-300">
            <Plus className="w-5 h-5 text-slate-400 flex-shrink-0" strokeWidth={1.8} />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Describe the website or app you want to build..."
              className="flex-1 bg-transparent text-[14px] text-slate-700 placeholder:text-slate-400 outline-none"
            />
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={handleSubmit}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 transition-shadow duration-300"
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Action Chips */}
      <motion.div
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-2.5"
      >
        {actionChips.map((chip) => {
          const isActive = activeChip === chip.id;
          return (
            <motion.button
              key={chip.id}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveChip(chip.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-250 ${
                isActive
                  ? "bg-violet-100/80 text-violet-700 border border-violet-200/60 shadow-sm shadow-violet-500/10"
                  : "bg-white/60 text-slate-500 border border-slate-200/40 hover:bg-white/80 hover:text-slate-600 hover:border-slate-200/60"
              }`}
            >
              <chip.icon className="w-3.5 h-3.5" strokeWidth={1.8} />
              {chip.label}
              {isActive && (
                <motion.div
                  layoutId="activeChip"
                  className="absolute inset-0 rounded-xl bg-violet-50/50 border border-violet-200/40"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
            </motion.button>
          );
        })}
      </motion.div>
    </section>
  );
}
