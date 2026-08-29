"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp, Plus, Paperclip, X, Copy, Check, RefreshCw, Square, Pencil, Trash2,
  ChevronDown, Loader2, Image as ImageIcon, FileText, AlertCircle, StopCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Attachment {
  id: string;
  fileName: string;
  filePath: string;
  fileType: 'image' | 'document';
  fileSize: number;
  mimeType: string;
  preview?: string;
  uploadProgress?: number;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

interface ModelOption {
  id: string;
  displayName: string;
  provider: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-slate-200/60 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 border-b border-slate-200/50">
        <span className="text-[11.5px] font-medium text-slate-500">{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-[11.5px] text-slate-500 hover:text-slate-700 transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <SyntaxHighlighter language={language || 'text'} style={oneLight} customStyle={{ margin: 0, padding: '16px', fontSize: '13px', background: '#FAFBFC' }}>
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageBubble({ msg, onCopy, onRegenerate, onEdit, onDelete, isStreaming, streamContent }: {
  msg: Message; onCopy: () => void; onRegenerate: () => void; onEdit: (val: string) => void; onDelete: () => void; isStreaming?: boolean; streamContent?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  const isUser = msg.role === 'user';
  const content = isStreaming && !isUser ? (streamContent || '') : msg.content;
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`group flex gap-3 px-4 sm:px-6 py-5 ${isUser ? '' : 'bg-white/20'}`}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-bold mt-0.5 ${
        isUser ? 'bg-gradient-to-br from-violet-500 to-purple-500 text-white shadow-sm shadow-violet-500/15' : 'bg-white border border-slate-200/60 text-slate-500'
      }`}>
        {isUser ? 'U' : 'AI'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[12.5px] font-semibold text-slate-700">{isUser ? 'You' : 'Assistant'}</span>
          <span className="text-[11px] text-slate-400">{time}</span>
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)} className="w-full min-h-[80px] p-3 rounded-xl bg-white/80 border border-slate-200/60 text-[13.5px] text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 transition-all resize-y" />
            <div className="flex gap-2">
              <button onClick={() => { onEdit(editVal); setEditing(false); }} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 transition-colors">Save</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium hover:bg-slate-200 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:text-slate-700 prose-headings:text-slate-800 prose-code:text-violet-600 prose-code:bg-violet-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent prose-a:text-violet-600 prose-li:text-slate-700">
            <ReactMarkdown
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  if (match) return <CodeBlock language={match[1]}>{codeStr}</CodeBlock>;
                  return <code className={className} {...props}>{children}</code>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {/* Attachments thumbnails */}
        {msg.attachments?.map((att) => (
          <div key={att.id} className="mt-2">
            {att.fileType === 'image' ? (
              <img src={att.filePath} alt={att.fileName} className="max-w-[240px] max-h-[180px] rounded-xl border border-slate-200/40 object-cover" />
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 text-[12px] text-slate-600">
                <FileText className="w-3.5 h-3.5" /> {att.fileName}
              </div>
            )}
          </div>
        ))}

        {/* Actions */}
        {!isStreaming && content && (
          <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <CopyButton text={content} />
            {isUser ? (
              <>
                <button onClick={() => { setEditVal(msg.content); setEditing(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={onDelete} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
              </>
            ) : (
              <button onClick={onRegenerate} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export default function ChatWorkspace() {
  const router = useRouter();
  const params = useParams();
  const conversationId = params.conversationId as string | undefined;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamContent, scrollToBottom]);

  // Fetch models (Chat mode → Gemini models only)
  useEffect(() => {
    fetch('/api/models?category=chat').then((r) => r.json()).then((d) => {
      const list: ModelOption[] = (d.enabled || []).map((m: { modelId: string; displayName: string; provider: string }) => ({
        id: m.modelId, displayName: m.displayName, provider: m.provider,
      }));
      setModels(list);
      if (list[0]) setSelectedModel(list[0].id);
    }).catch(() => {});
  }, []);

  // Load conversation
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    fetch(`/api/chat/${conversationId}`).then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then((convo) => {
      setMessages(convo.messages?.map((m: { id: string; role: string; content: string; timestamp: string; attachments?: Attachment[] }) => ({
        id: m.id, role: m.role as 'user' | 'assistant', content: m.content, timestamp: m.timestamp,
        attachments: m.attachments,
      })) || []);
      if (convo.modelId) setSelectedModel(convo.modelId);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [conversationId]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; }
  }, [input]);

  const uploadFiles = async (files: FileList | File[]) => {
    const fd = new FormData();
    const fileArr = Array.from(files);
    for (const f of fileArr) fd.append('files', f);

    const temp: Attachment[] = fileArr.map((f) => ({
      id: crypto.randomUUID(), fileName: f.name, filePath: '', fileType: (f.type.startsWith('image/') ? 'image' : 'document') as 'image' | 'document',
      fileSize: f.size, mimeType: f.type, uploadProgress: 0,
    }));
    setAttachments((prev) => [...prev, ...temp]);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setAttachments((prev) =>
        prev.map((a) => {
          const uploaded = data.files?.find((u: { fileName: string }) => u.fileName === a.fileName);
          return uploaded ? { ...a, filePath: uploaded.filePath, uploadProgress: 100 } : { ...a, error: 'Upload failed' };
        })
      );
    } catch (err) {
      setAttachments((prev) => prev.map((a) => ({ ...a, error: err instanceof Error ? err.message : 'Upload failed' })));
    }
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const handleSend = async () => {
    const text = input.trim();
    const validAttachments = attachments.filter((a) => a.filePath && !a.error);
    if (!text && !validAttachments.length) return;

    // Find or create conversation
    let convoId = conversationId;
    if (!convoId) {
      try {
        const res = await fetch('/api/conversations', { method: 'POST' });
        const data = await res.json();
        convoId = data.id;
        router.replace(`/chat/${convoId}`);
      } catch { setError('Failed to create conversation'); return; }
    }

    const userMsg: Message = {
      id: crypto.randomUUID(), role: 'user', content: text,
      timestamp: new Date().toISOString(), attachments: validAttachments,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setStreaming(true);
    setStreamContent('');
    setError('');

    try {
      const ctrl = new AbortController();
      setAbortCtrl(ctrl);
      const res = await fetch('/api/chat', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, attachments: validAttachments,
          modelConfigId: selectedModel, conversationId: convoId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 && data.tokenExhausted) {
          window.dispatchEvent(new CustomEvent('codewix:token-exhausted', { detail: data }));
          throw new Error(data.error || 'Token limit reached');
        }
        throw new Error(data.error || 'Failed to send message');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response');
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) { setError(parsed.error); toast.error(parsed.error); break; }
            if (parsed.content) { full += parsed.content; setStreamContent(full); }
          } catch { /* skip */ }
        }
      }

      if (full) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: full, timestamp: new Date().toISOString() }]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.info('Generation stopped');
      } else {
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      setAbortCtrl(null);
    }
  };

  const handleStop = () => { abortCtrl?.abort(); };

  const handleRegenerate = () => {
    if (!conversationId || messages.length < 2) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, -1));
    setInput(lastUserMsg.content);
  };

  const handleDelete = async (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    toast.success('Message deleted');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!streaming) handleSend(); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') { const f = items[i].getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); uploadFiles(files); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.header initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200/30">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-slate-700">Chat</h2>
          {conversationId && (
            <button onClick={() => router.push('/chat')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100/80 text-[12px] font-medium text-slate-600 hover:bg-slate-200/80 transition-colors">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={dropRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        ) : messages.length === 0 && !streaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-4">
              <ImageIcon className="w-7 h-7 text-violet-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-700 mb-2">Start a conversation</h3>
            <p className="text-[13.5px] text-slate-500 max-w-sm">Ask anything — code, ideas, analysis, or upload images and documents.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onCopy={() => navigator.clipboard.writeText(msg.content)}
                onRegenerate={handleRegenerate}
                onEdit={(val) => setMessages((prev) => prev.map((m, idx) => idx === i ? { ...m, content: val } : m))}
                onDelete={() => handleDelete(msg.id)}
                isStreaming={streaming && i === messages.length - 1 && msg.role === 'assistant'}
                streamContent={streamContent}
              />
            ))}
            {streaming && streamContent && (
              <MessageBubble
                msg={{ id: 'stream', role: 'assistant', content: '', timestamp: new Date().toISOString() }}
                onCopy={() => {}} onRegenerate={() => {}} onEdit={() => {}} onDelete={() => {}}
                isStreaming streamContent={streamContent}
              />
            )}
            {streaming && !streamContent && (
              <div className="flex items-center gap-3 px-6 py-5">
                <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/60 flex items-center justify-center text-[11px] font-bold text-slate-500">AI</div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            {error && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-4 sm:mx-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200/60 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1"><p className="text-[13px] text-red-600">{error}</p><button onClick={() => setError('')} className="text-[11.5px] text-red-500 font-medium mt-1 hover:underline">Dismiss</button></div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Attachment Previews */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 overflow-hidden">
            <div className="flex gap-2 flex-wrap py-3">
              {attachments.map((att) => (
                <motion.div key={att.id} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border ${att.error ? 'bg-red-50 border-red-200/60' : 'bg-white/80 border-slate-200/50'}`}>
                  {att.fileType === 'image' && att.filePath ? (
                    <img src={att.filePath} alt={att.fileName} className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><FileText className="w-5 h-5 text-slate-400" /></div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium text-slate-700 truncate max-w-[120px]">{att.fileName}</span>
                    <span className="text-[11px] text-slate-400">{att.error || formatSize(att.fileSize)}</span>
                  </div>
                  <button onClick={() => removeAttachment(att.id)} className="ml-1 text-slate-400 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="px-4 sm:px-6 pb-5 pt-2">
        <div className="relative group max-w-3xl mx-auto">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-200/60 via-purple-200/40 to-violet-200/60 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />
          <div className="relative flex items-end gap-2 bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/60 px-4 py-3 shadow-lg shadow-slate-200/30 group-focus-within:shadow-xl group-focus-within:shadow-purple-500/10 transition-all duration-300">
            <input type="file" ref={fileInputRef} className="hidden" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx,.csv,.json,.md" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
            <button onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all duration-200" title="Attach files">
              <Paperclip className="w-5 h-5" strokeWidth={1.8} />
            </button>
            <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} onPaste={handlePaste}
              placeholder="Type a message... (Shift+Enter for new line)"
              rows={1} className="flex-1 bg-transparent text-[14px] text-slate-700 placeholder:text-slate-400 outline-none resize-none min-h-[24px] max-h-[200px] py-1"
            />
            {streaming ? (
              <button onClick={handleStop} className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/25 hover:shadow-xl transition-all duration-200" title="Stop generation">
                <Square className="w-3.5 h-3.5" fill="white" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={(!input.trim() && !attachments.filter((a) => a.filePath).length)} className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/35 disabled:opacity-40 disabled:shadow-none transition-all duration-200">
                <ArrowUp className="w-4 h-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-2.5">Supports images, PDFs, documents, code files. Drag & drop or paste.</p>
      </div>
    </div>
  );
}
