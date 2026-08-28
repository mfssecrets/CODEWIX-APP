"use client";

import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";

const integrations = [
  { name: "Figma", color: "bg-gradient-to-br from-pink-500 via-red-400 to-orange-400", letter: "F" },
  { name: "Supabase", color: "bg-gradient-to-br from-emerald-500 to-green-600", letter: "S" },
  { name: "GitHub", color: "bg-slate-800", letter: "G" },
  { name: "Vercel", color: "bg-slate-900", letter: "V" },
  { name: "Google Drive", color: "bg-gradient-to-br from-blue-500 via-blue-400 to-cyan-400", letter: "G" },
];

export default function IntegrationsSection() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5 }}
      className="px-6 pb-8"
    >
      <h2 className="text-[15px] font-semibold text-slate-700 mb-4">
        Connect your favorite tools
      </h2>
      <div className="flex items-center gap-3 flex-wrap">
        {integrations.map((tool, i) => (
          <motion.button
            key={tool.name}
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -2, scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/70 border border-slate-200/40 hover:bg-white/90 hover:shadow-lg hover:shadow-slate-200/30 hover:border-slate-200/60 transition-all duration-250"
          >
            <div className={`w-6 h-6 rounded-lg ${tool.color} flex items-center justify-center text-white text-[10px] font-bold shadow-sm`}>
              {tool.letter}
            </div>
            <span className="text-[12.5px] font-medium text-slate-600">
              {tool.name}
            </span>
          </motion.button>
        ))}
        <motion.button
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/70 border border-slate-200/40 hover:bg-white/90 hover:shadow-lg hover:shadow-slate-200/30 transition-all duration-250"
        >
          <MoreHorizontal className="w-4 h-4 text-slate-400" strokeWidth={1.8} />
          <span className="text-[12.5px] font-medium text-slate-500">More</span>
        </motion.button>
      </div>
    </motion.section>
  );
}