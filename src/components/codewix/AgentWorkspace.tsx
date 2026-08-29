"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp, Plus, Paperclip, X, Loader2, FileText, AlertCircle, Square,
  Play, CheckCircle2, Circle, Clock, Code2, Wrench, TestTube, Bug, Hammer,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Attachment {
  id: string; fileName: string; filePath: string; fileType: 'image' | 'document';
  fileSize: number; mimeType: string; error?: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof Circle; color: string; label: string }> = {
  planning: { icon: Clock, color: 'text-amber-500', label: 'Planning' },
  analyzing: { icon: Code2, color: 'text-blue-500', label: 'Analyzing' },
  creating: { icon: Wrench, color: 'text-violet-500', label: 'Creating' },
  editing: { icon: FileText, color: 'text-indigo-500', label: 'Editing' },
  testing: { icon: TestTube, color: 'text-cyan-500', label: 'Testing' },
  fixing: { icon: Bug, color: 'text-orange-500', label: 'Fixing' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
};

const TIMELINE_ORDER = ['planning', 'analyzing', 'creating', 'editing', 'testing', 'fixing', 'completed'];

export default function AgentWorkspace() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params.conversationId as string | undefined;

  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [activity, setActivity] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<Array<{ id: string; displayName: string; provider: string }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [timeline, setTimeline] = useState<string[]>([]);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => { outputRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);
  useEffect(() => { scrollToBottom(); }, [output, scrollToBottom]);

  useEffect(() => {
    fetch('/api/models?category=code').then((r) => r.json()).then((d) => {
      const list = (d.enabled || []).map((m: { modelId: string; displayName: string; provider: string }) => ({ id: m.modelId, displayName: m.displayName, provider: m.provider }));
      setModels(list); if (list[0]) setSelectedModel(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    fetch(`/api/agent/${conversationId}`).then((r) => r.json()).then((convo) => {
      setMessages(convo.messages?.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })) || []);
      if (convo.agentTasks?.[0]) {
        const t = convo.agentTasks[0];
        setStatus(t.status); setActivity(t.activity); setOutput(t.output);
      }
      if (convo.modelId) setSelectedModel(convo.modelId);
    }).catch(() => {});
  }, [conversationId]);

  const uploadFiles = async (files: FileList | File[]) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    const temp: Attachment[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(), fileName: f.name, filePath: '',
      fileType: (f.type.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
      fileSize: f.size, mimeType: f.type,
    }));
    setAttachments((prev) => [...prev, ...temp]);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAttachments((prev) => prev.map((a) => {
        const u = data.files?.find((up: { fileName: string }) => up.fileName === a.fileName);
        return u ? { ...a, filePath: u.filePath } : { ...a, error: 'Failed' };
      }));
    } catch { setAttachments((prev) => prev.map((a) => ({ ...a, error: 'Failed' }))); }
  };

  const handleStart = async () => {
    if (!prompt.trim() && !attachments.some((a) => a.filePath)) return;
    setRunning(true); setOutput(''); setError(''); setTimeline([]);

    try {
      const ctrl = new AbortController(); setAbortCtrl(ctrl);
      const res = await fetch('/api/agent', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          attachments: attachments.filter((a) => a.filePath && !a.error),
          modelConfigId: selectedModel, conversationId,
        }),
      });

      if (!res.ok) { const d = await res.json().catch(() => ({})); if (res.status === 429 && d.tokenExhausted) { window.dispatchEvent(new CustomEvent('codewix:token-exhausted', { detail: d })); } throw new Error(d.error || 'Agent failed'); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response');
      const decoder = new TextDecoder();
      let full = '';

      // If no conversation existed, get the new one from redirect
      const location = res.headers.get('Location');
      if (location && !conversationId) {
        const id = location.split('/').pop();
        if (id) router.replace(`/agent/${id}`);
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'status') {
              setStatus(parsed.status); setActivity(parsed.activity);
              setTimeline((prev) => prev.includes(parsed.status) ? prev : [...prev, parsed.status]);
            } else if (parsed.type === 'content') {
              full += parsed.content; setOutput(full);
            } else if (parsed.type === 'error') {
              setError(parsed.error);
            }
          } catch { /* skip */ }
        }
      }

      if (!conversationId) {
        // Try to get the conversation from messages
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const msg = err instanceof Error ? err.message : 'Agent failed';
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setRunning(false); setAbortCtrl(null);
    }
  };

  // "Build" button — create a new project from the prompt and open the
  // Build Studio (the full in-browser IDE) with the prompt pre-loaded so the
  // AI immediately starts generating files via tool-calls. This is the real
  // "build a website/app" experience (Monaco editor + live preview + file
  // tree), not a chat-style markdown response.
  const [building, setBuilding] = useState(false);
  const handleBuild = async () => {
    if (!prompt.trim()) return;
    setBuilding(true);
    try {
      const projName = prompt.trim().slice(0, 60).replace(/\s+/g, ' ').trim() || 'New Project';
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projName, description: prompt.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create project');
      }
      const { project } = await res.json();
      toast.success('Opening Build Studio…');
      router.push(`/build/${project.id}?prompt=${encodeURIComponent(prompt.trim())}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open Build Studio';
      setError(msg);
      toast.error(msg);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.header initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/30">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-slate-700">Agent</h2>
          {conversationId && (
            <button onClick={() => router.push('/agent')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100/80 text-[12px] font-medium text-slate-600 hover:bg-slate-200/80 transition-colors">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          )}
        </div>
        {models.length > 0 && (
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[180px] h-9 text-[13px] font-medium bg-white/60 border-slate-200/50 rounded-lg shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-[13px]">{m.displayName} <span className="text-slate-400 ml-1.5">· {m.provider}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </motion.header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!output && !running && !error && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-4">
              <Code2 className="w-7 h-7 text-violet-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-700 mb-2">AI Coding Agent</h3>
            <p className="text-[13.5px] text-slate-500 max-w-sm">Describe what you want to build, then click <span className="font-semibold text-violet-600">Build</span> to open the Build Studio (full IDE with live preview) or <span className="font-semibold text-slate-600">Chat</span> for a markdown walkthrough.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6">
            {/* Timeline */}
            {timeline.length > 0 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                {TIMELINE_ORDER.filter((s) => timeline.includes(s)).map((s, i) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  const isLast = i === timeline.length - 1 && running;
                  return (
                    <motion.div key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2">
                      {i > 0 && <div className="w-6 h-px bg-slate-200" />}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium ${
                        s === 'completed' ? 'bg-emerald-50 text-emerald-700' : isLast ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Icon className={`w-3.5 h-3.5 ${isLast ? 'animate-pulse' : ''}`} strokeWidth={1.8} />
                        {cfg.label}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Output */}
            {(output || running) && (
              <div className="glass rounded-2xl border border-slate-200/40 p-5 sm:p-6">
                <div className="prose prose-sm max-w-none prose-p:text-slate-700 prose-headings:text-slate-800 prose-code:text-violet-600 prose-code:bg-violet-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent">
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (match) {
                          return (
                            <div className="relative my-3 rounded-xl overflow-hidden border border-slate-200/60">
                              <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 border-b border-slate-200/50">
                                <span className="text-[11.5px] font-medium text-slate-500">{match[1]}</span>
                              </div>
                              <SyntaxHighlighter language={match[1]} style={oneLight} customStyle={{ margin: 0, padding: '16px', fontSize: '13px', background: '#FAFBFC' }}>
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          );
                        }
                        return <code className={className} {...props}>{children}</code>;
                      },
                    }}
                  >
                    {output}
                  </ReactMarkdown>
                  {running && <span className="inline-block w-1.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />}
                </div>
                <div ref={outputRef} />
              </div>
            )}

            {/* Previous messages */}
            {messages.map((m, i) => (
              <div key={i} className="glass rounded-2xl border border-slate-200/40 p-5 mt-4">
                <div className="text-[12px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">{m.role === 'user' ? 'You' : 'Agent'}</div>
                <div className="prose prose-sm max-w-none prose-p:text-slate-700">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200/60 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-[13px] text-red-600">{error}</p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 pb-5 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {attachments.map((att) => (
                <div key={att.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${att.error ? 'bg-red-50 border-red-200/60' : 'bg-white/80 border-slate-200/50'}`}>
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-[12px] text-slate-600 max-w-[120px] truncate">{att.fileName}</span>
                  <button onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))} className="text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-200/60 via-purple-200/40 to-violet-200/60 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />
            <div className="relative flex items-end gap-2 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 px-4 py-3 shadow-lg shadow-slate-200/30 transition-all duration-300">
              <input type="file" ref={fileInputRef} className="hidden" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx,.csv,.json,.md" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
              <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all duration-200">
                <Paperclip className="w-5 h-5" strokeWidth={1.8} />
              </button>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!running) handleStart(); } }}
                placeholder="Describe what you want the agent to build..."
                rows={2} className="flex-1 bg-transparent text-[14px] text-slate-700 placeholder:text-slate-400 outline-none resize-none min-h-[48px] max-h-[200px] py-1"
              />
              {running ? (
                <button onClick={() => abortCtrl?.abort()} className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/25 transition-all duration-200">
                  <Square className="w-3.5 h-3.5" fill="white" />
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={handleStart} disabled={!prompt.trim() && !attachments.some((a) => a.filePath)}
                    className="flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-white/80 text-slate-600 text-[13px] font-semibold border border-slate-200/60 hover:bg-slate-50 disabled:opacity-40 transition-all duration-200">
                    <Play className="w-3.5 h-3.5" /> Chat
                  </button>
                  <button onClick={handleBuild} disabled={!prompt.trim() || building}
                    className="flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white text-[13px] font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-40 disabled:shadow-none transition-all duration-200">
                    {building ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
                    {building ? 'Opening...' : 'Build'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
