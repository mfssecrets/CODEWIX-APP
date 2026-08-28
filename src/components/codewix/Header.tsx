"use client";

import { motion } from "framer-motion";
import { ChevronDown, Wifi } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Header() {
  return (
    <motion.header
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-between px-6 py-3.5"
    >
      {/* Model Selector */}
      <Select defaultValue="glm-5.2">
        <SelectTrigger className="w-[180px] h-9 text-[13px] font-medium bg-white/60 border-slate-200/50 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
          <SelectValue placeholder="Select Model" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-slate-200/60 shadow-lg">
          <SelectItem value="glm-5.2" className="text-[13px]">GLM-5.2</SelectItem>
          <SelectItem value="glm-5" className="text-[13px]">GLM-5</SelectItem>
          <SelectItem value="glm-4" className="text-[13px]">GLM-4</SelectItem>
          <SelectItem value="code-llm" className="text-[13px]">CodeLLM-Pro</SelectItem>
        </SelectContent>
      </Select>

      {/* Right Side */}
      <div className="flex items-center gap-4">
        {/* API Status */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50/80 border border-emerald-200/50"
        >
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-40" />
          </div>
          <span className="text-[11.5px] font-semibold text-emerald-700 tracking-wide uppercase">API</span>
        </motion.div>

        {/* User Avatar */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-[12px] font-semibold shadow-md shadow-purple-500/15 hover:shadow-lg hover:shadow-purple-500/25 transition-shadow duration-300"
        >
          U
        </motion.button>
      </div>
    </motion.header>
  );
}
