"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Star, Wifi, WifiOff, Loader2, AlertCircle, Eye, EyeOff,
} from 'lucide-react';
import { maskApiKey } from '@/lib/crypto';

const PROVIDERS = [
  { id: 'google', name: 'Google Gemini', placeholder: 'gemini-2.0-flash', placeholderKey: 'AIza...' },
  { id: 'zai', name: 'Z.ai', placeholder: 'glm-4-plus', placeholderKey: 'Enter API key' },
  { id: 'groq', name: 'Groq', placeholder: 'llama-3.3-70b-versatile', placeholderKey: 'gsk_' },
];

interface ModelConfig {
  id: string; provider: string; modelId: string; displayName: string;
  apiKey: string; enabled: boolean; isDefault: boolean; status: string;
}

export default function ModelSettingsPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Add form state
  const [provider, setProvider] = useState('google');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showKey, setShowKey] = useState(false);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchModels(); }, []);

  const handleAdd = async () => {
    if (!apiKey || !modelId || !displayName) { setAddError('All fields are required'); return; }
    setAdding(true); setAddError('');
    try {
      const res = await fetch('/api/models', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, modelId, displayName, isDefault: configs.length === 0 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowAdd(false); setApiKey(''); setModelId(''); setDisplayName('');
      await fetchModels();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add model');
    } finally { setAdding(false); }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    setConfigs((prev) => prev.map((c) => c.id === id ? { ...c, enabled } : c));
  };

  const handleDefault = async (id: string) => {
    await fetch(`/api/models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) });
    setConfigs((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/models/${id}`, { method: 'DELETE' });
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  };

  const providerMeta = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex flex-col h-full">
      <motion.header initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/30">
        <h2 className="text-[15px] font-semibold text-slate-700">Model Settings</h2>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white text-[12.5px] font-semibold shadow-md shadow-violet-500/20 hover:shadow-lg transition-all">
          <Plus className="w-3.5 h-3.5" /> Add Model
        </motion.button>
      </motion.header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Add Form */}
          <AnimatePresence>
            {showAdd && (
              <motion.div initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 24 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }} className="overflow-hidden">
                <div className="glass rounded-2xl border border-slate-200/40 p-6">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-4">Add new model</h3>
                  {addError && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200/60 mb-4">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-[12.5px] text-red-600">{addError}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12.5px] font-medium text-slate-600">Provider</label>
                      <select value={provider} onChange={(e) => { setProvider(e.target.value); const p = PROVIDERS.find(x => x.id === e.target.value); if (p) setModelId(p.placeholder); }}
                        className="px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 outline-none focus:border-violet-300 transition-all">
                        {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12.5px] font-medium text-slate-600">Display Name</label>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={providerMeta?.name + ' Model'}
                        className="px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 transition-all" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12.5px] font-medium text-slate-600">Model ID</label>
                      <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder={providerMeta?.placeholder || 'model-id'}
                        className="px-3 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 transition-all font-mono text-[13px]" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[12.5px] font-medium text-slate-600">API Key</label>
                      <div className="relative">
                        <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={providerMeta?.placeholderKey}
                          className="w-full px-3 pr-9 py-2.5 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 transition-all font-mono text-[13px]" />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowAdd(false); setAddError(''); }} className="px-4 py-2 rounded-xl text-[13px] font-medium text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAdd} disabled={adding}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white text-[13px] font-semibold shadow-md shadow-violet-500/20 disabled:opacity-60 transition-all">
                      {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {adding ? 'Adding...' : 'Add Model'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model List */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
          ) : configs.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[14px] text-slate-500 mb-1">No models configured</p>
              <p className="text-[12.5px] text-slate-400">Add an AI model to get started</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {configs.map((cfg, i) => (
                <motion.div key={cfg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 ${
                    cfg.enabled ? 'bg-white/60 border-slate-200/40 hover:shadow-md hover:shadow-slate-200/20' : 'bg-slate-50/60 border-slate-200/30 opacity-70'
                  }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold ${
                    cfg.provider === 'google' ? 'bg-blue-50 text-blue-600' :
                    cfg.provider === 'zai' ? 'bg-violet-50 text-violet-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {cfg.provider === 'google' ? 'G' : cfg.provider === 'zai' ? 'Z' : 'Gq'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-slate-700">{cfg.displayName}</span>
                      {cfg.isDefault && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[10.5px] font-semibold">
                          <Star className="w-3 h-3" fill="currentColor" /> Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11.5px] text-slate-400 font-mono">{cfg.modelId}</span>
                      <span className="text-[11.5px] text-slate-400">·</span>
                      <span className="text-[11.5px] text-slate-400 capitalize">{cfg.provider}</span>
                      <span className="text-[11.5px] text-slate-400">·</span>
                      <span className="text-[11.5px]">{maskApiKey(cfg.apiKey)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!cfg.isDefault && (
                      <button onClick={() => handleDefault(cfg.id)} className="p-2 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-all" title="Set as default">
                        <Star className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    )}
                    <button onClick={() => handleToggle(cfg.id, !cfg.enabled)} className={`p-2 rounded-lg transition-all ${cfg.enabled ? 'hover:bg-red-50 text-emerald-500 hover:text-red-500' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-500'}`} title={cfg.enabled ? 'Disable' : 'Enable'}>
                      {cfg.enabled ? <Wifi className="w-4 h-4" strokeWidth={1.8} /> : <WifiOff className="w-4 h-4" strokeWidth={1.8} />}
                    </button>
                    <button onClick={() => handleDelete(cfg.id)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all" title="Delete">
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
