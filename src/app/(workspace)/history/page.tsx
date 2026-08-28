"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, MessageSquare, Bot, Trash2, Pencil, Check, X, ArrowRight, Loader2 } from 'lucide-react';

interface HistoryItem {
  id: string; title: string; type: string; modelId?: string; provider?: string;
  createdAt: string; updatedAt: string; _count: { messages: number };
}

function timeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - target.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const observerRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async (c?: string, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (c) params.set('cursor', c);
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setCursor(data.nextCursor);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Infinite scroll
  useEffect(() => {
    if (!observerRef.current || !cursor) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && cursor && !loading) fetchHistory(cursor, true); },
      { threshold: 0.5 }
    );
    obs.observe(observerRef.current);
    return () => obs.disconnect();
  }, [cursor, loading, fetchHistory]);

  const handleRename = async (id: string) => {
    if (!editVal.trim()) { setEditingId(null); return; }
    await fetch(`/api/chat/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: editVal }) });
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, title: editVal } : i));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/chat/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const grouped = items.reduce<Record<string, HistoryItem[]>>((acc, item) => {
    const label = timeLabel(item.updatedAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];

  return (
    <div className="flex flex-col h-full">
      <motion.header initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="px-6 py-3.5 border-b border-slate-200/30">
        <h2 className="text-[15px] font-semibold text-slate-700">History</h2>
      </motion.header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.8} />
            <input
              value={search} onChange={(e) => { setSearch(e.target.value); setCursor(undefined); }}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/70 border border-slate-200/50 text-[13.5px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all duration-200"
            />
          </div>

          {items.length === 0 && !loading ? (
            <div className="text-center py-16">
              <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-[14px] text-slate-500">No conversations yet</p>
            </div>
          ) : (
            groupOrder.filter((g) => grouped[g]).map((group) => (
              <div key={group} className="mb-6">
                <h3 className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-3">{group}</h3>
                <div className="flex flex-col gap-1.5">
                  {grouped[group].map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-white/50 border border-slate-200/30 hover:bg-white/80 hover:border-slate-200/50 hover:shadow-md hover:shadow-slate-200/20 transition-all duration-200 cursor-pointer"
                      onClick={() => router.push(`/${item.type}/${item.id}`)}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.type === 'agent' ? 'bg-violet-50' : 'bg-slate-100'
                      }`}>
                        {item.type === 'agent' ? (
                          <Bot className="w-4 h-4 text-violet-500" strokeWidth={1.8} />
                        ) : (
                          <MessageSquare className="w-4 h-4 text-slate-500" strokeWidth={1.8} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {editingId === item.id ? (
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <input value={editVal} onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(item.id); if (e.key === 'Escape') setEditingId(null); }}
                              className="flex-1 px-2 py-1 rounded-lg bg-white border border-slate-200/60 text-[13px] outline-none focus:border-violet-300" autoFocus
                            />
                            <button onClick={() => handleRename(item.id)} className="text-emerald-500 hover:text-emerald-600"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <p className="text-[13.5px] font-medium text-slate-700 truncate">{item.title}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11.5px] text-slate-400">{formatTime(item.updatedAt)}</span>
                          {item.provider && <span className="text-[11px] text-violet-400 font-medium">{item.provider}</span>}
                          <span className="text-[11px] text-slate-400">{item._count.messages} messages</span>
                        </div>
                      </div>

                      {editingId !== item.id && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => { setEditingId(item.id); setEditVal(item.title); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all">
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          )}

          {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-violet-500 animate-spin" /></div>}
          <div ref={observerRef} className="h-4" />
        </div>
      </div>
    </div>
  );
}