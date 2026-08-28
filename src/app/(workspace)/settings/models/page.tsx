"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2, Image as ImageIcon, Zap, Crown, Info } from 'lucide-react';

interface PlatformModel {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  status: string;
}

export default function ModelSettingsPage() {
  const [models, setModels] = useState<PlatformModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    fetch('/api/models')
      .then((r) => (r.ok ? r.json() : { configs: [], platformConfigured: false }))
      .then((data) => {
        setModels(data.configs || []);
        setConfigured(data.platformConfigured !== false);
      })
      .catch(() => { setConfigured(false); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <motion.header
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/30"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          <h2 className="text-[15px] font-semibold text-slate-700">AI Models</h2>
        </div>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-violet-600 text-[12px] font-semibold">
          <Crown className="w-3.5 h-3.5" /> Included in your plan
        </span>
      </motion.header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Info banner */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-4 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/50 mb-6"
          >
            <Info className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-slate-700 mb-0.5">Platform-managed AI models</p>
              <p className="text-[12.5px] text-slate-500 leading-relaxed">
                CodeWIX provides Google Gemini models powered by our server-side API key. No setup needed — just pick a model in Chat, Agent, or Build. Usage is gated by your plan&apos;s token allowance.
              </p>
            </div>
          </motion.div>

          {!configured && !loading && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200/60 mb-6">
              <span className="text-[12.5px] text-amber-700">
                AI models are temporarily unavailable. The platform Gemini key is being configured — please check back shortly.
              </span>
            </div>
          )}

          {/* Model list (read-only) */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[14px] text-slate-500 mb-1">No models available</p>
              <p className="text-[12.5px] text-slate-400">Please contact support if this persists.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {models.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-slate-200/40 bg-white/60 hover:shadow-md hover:shadow-slate-200/20 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-semibold text-slate-700">{m.displayName}</span>
                      {m.isDefault && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[10.5px] font-semibold">
                          <Crown className="w-3 h-3" fill="currentColor" /> Default
                        </span>
                      )}
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[10.5px] font-semibold">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11.5px] text-slate-400 font-mono">{m.modelId}</span>
                      <span className="text-[11.5px] text-slate-400">·</span>
                      <span className="text-[11.5px] text-slate-400 capitalize">{m.provider}</span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-1">{m.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-500" title="Supports image inputs">
                      <ImageIcon className="w-3.5 h-3.5" /> Vision
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-500" title="Streaming responses">
                      <Zap className="w-3.5 h-3.5" /> Stream
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <p className="text-center text-[12px] text-slate-400 mt-6">
            Tip: switch models anytime from the dropdown at the top of Chat, Agent, or Build.
          </p>
        </div>
      </div>
    </div>
  );
}
