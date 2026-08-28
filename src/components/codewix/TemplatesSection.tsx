"use client";

import { motion } from "framer-motion";
import { ArrowRight, Monitor, BarChart3, ShoppingCart, FolderOpen } from "lucide-react";

const templates = [
  {
    title: "Landing Page",
    description: "Modern landing page for your product",
    icon: Monitor,
    gradient: "from-violet-50 to-purple-50",
    iconColor: "text-violet-500",
  },
  {
    title: "SaaS Dashboard",
    description: "Analytics dashboard for your SaaS",
    icon: BarChart3,
    gradient: "from-blue-50 to-cyan-50",
    iconColor: "text-blue-500",
  },
  {
    title: "E-commerce",
    description: "Online store with cart & checkout",
    icon: ShoppingCart,
    gradient: "from-amber-50 to-orange-50",
    iconColor: "text-amber-500",
  },
  {
    title: "Portfolio",
    description: "Creative portfolio website",
    icon: FolderOpen,
    gradient: "from-emerald-50 to-teal-50",
    iconColor: "text-emerald-500",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const cardVariants = {
  hidden: { y: 24, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function TemplatesSection() {
  return (
    <section className="px-6 pb-6">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between mb-5"
      >
        <h2 className="text-[15px] font-semibold text-slate-700">
          Start with a template
        </h2>
        <motion.button
          whileHover={{ x: 3 }}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-slate-400 hover:text-violet-600 transition-colors duration-200"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </motion.button>
      </motion.div>

      {/* Cards Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-30px" }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {templates.map((template) => (
          <motion.div
            key={template.title}
            variants={cardVariants}
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            className="group relative bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200/40 p-5 hover:bg-white/80 hover:shadow-xl hover:shadow-slate-200/40 hover:border-slate-200/60 transition-all duration-300 cursor-pointer"
          >
            {/* Icon Area */}
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${template.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
              <template.icon className={`w-5 h-5 ${template.iconColor}`} strokeWidth={1.6} />
            </div>

            {/* Text */}
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1">
              {template.title}
            </h3>
            <p className="text-[12.5px] text-slate-500 leading-relaxed mb-4">
              {template.description}
            </p>

            {/* Action */}
            <motion.span
              className="text-[12px] font-semibold text-violet-600 flex items-center gap-1 group-hover:gap-2 transition-all duration-300"
            >
              Use Template
              <ArrowRight className="w-3 h-3" />
            </motion.span>

            {/* Hover Glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-50/0 to-purple-50/0 group-hover:from-violet-50/30 group-hover:to-purple-50/10 transition-all duration-500 pointer-events-none" />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}