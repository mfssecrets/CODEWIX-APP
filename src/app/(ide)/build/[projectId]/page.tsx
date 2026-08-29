'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import {
  Send,
  Square,
  Paperclip,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  Download,
  Trash2,
  Edit3,
  FilePlus,
  FolderPlus,
  Loader2,
  Play,
  Eye,
  Code2,
  Save,
  Sparkles,
  Bot,
  User,
  CircleDot,
  Search,
  MessageSquare,
  ExternalLink,
  Settings,
  Github,
  RotateCcw,
} from 'lucide-react';

// Dynamic Monaco import (no SSR)
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    ),
  }
);

// ── Types ──────────────────────────────────────────────────────────

interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { tool: string; path?: string; status: string }[];
  isStreaming?: boolean;
}

interface ModelConfig {
  id: string;
  displayName: string;
  provider: string;
  enabled: boolean;
  isDefault: boolean;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

type RightMode = 'preview' | 'code';
type ViewportSize = 'desktop' | 'tablet' | 'mobile';
type MobileTab = 'ai' | 'code' | 'preview';
type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface FileDiff {
  path: string;
  originalContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

// ── Helpers ─────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    md: 'markdown',
    py: 'python',
    rs: 'rust',
    go: 'go',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'html',
    svelte: 'html',
  };
  return map[ext || ''] || 'plaintext';
}

function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const map = new Map<string, FileNode>();
  const fileSet = new Set(paths);

  paths.sort().forEach((p) => {
    const parts = p.split('/').filter(Boolean);
    let currentPath = '';
    let parent: FileNode[] = root;

    parts.forEach((part, i) => {
      const prev = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!map.has(currentPath)) {
        const isLeaf = i === parts.length - 1;
        const node: FileNode = {
          path: currentPath,
          name: part,
          type: isLeaf ? 'file' : 'folder',
          children: isLeaf ? undefined : [],
        };
        map.set(currentPath, node);
        parent.push(node);
      }

      const node = map.get(currentPath)!;
      if (node.type === 'folder') {
        parent = node.children || (node.children = []);
      }
    });
  });

  // Fix: a folder path that is also a file path should be a file
  map.forEach((node) => {
    if (node.type === 'folder' && fileSet.has(node.path)) {
      node.type = 'file';
      node.children = undefined;
    }
  });

  return root;
}

function sortTree(nodes: FileNode[]): FileNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    })
    .map((n) => ({
      ...n,
      children: n.children ? sortTree(n.children) : undefined,
    }));
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  const result: FileNode[] = [];

  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.name.toLowerCase().includes(lower)) {
        result.push(node);
      }
    } else if (node.children) {
      const filtered = filterTree(node.children, query);
      if (filtered.length > 0) {
        result.push({ ...node, children: filtered });
      }
    }
  }

  return result;
}

function getFileIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  const colors: Record<string, string> = {
    ts: 'text-blue-500',
    tsx: 'text-blue-500',
    js: 'text-amber-500',
    jsx: 'text-amber-500',
    json: 'text-yellow-500',
    css: 'text-pink-500',
    scss: 'text-pink-500',
    html: 'text-orange-500',
    md: 'text-slate-400',
    py: 'text-green-500',
    rs: 'text-orange-600',
    go: 'text-cyan-500',
  };
  return colors[ext || ''] || 'text-slate-400';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Sub-components ──────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  return (
    <File
      className={`w-4 h-4 flex-shrink-0 ${getFileIconColor(name)}`}
      strokeWidth={1.8}
    />
  );
}

function FileTreeItem({
  node,
  depth,
  activePath,
  onSelect,
  onContextMenu,
  expandedPaths,
  toggleExpand,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  node: FileNode;
  depth: number;
  activePath: string;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isActive = node.path === activePath;
  const isFolder = node.type === 'folder';
  const isRenaming = renamingPath === node.path;

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      const dotIndex = node.name.lastIndexOf('.');
      inputRef.current.setSelectionRange(0, dotIndex > 0 ? dotIndex : node.name.length);
    }
  }, [isRenaming, node.name]);

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-[13px] transition-all ${
          isActive
            ? 'bg-violet-50 text-violet-700 font-medium'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isFolder) toggleExpand(node.path);
          else onSelect(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {isFolder ? (
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0"
          >
            <ChevronRight
              className="w-3.5 h-3.5 text-slate-400"
              strokeWidth={2}
            />
          </motion.div>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen
              className="w-4 h-4 text-violet-400 flex-shrink-0"
              strokeWidth={1.8}
            />
          ) : (
            <Folder
              className="w-4 h-4 text-violet-300 flex-shrink-0"
              strokeWidth={1.8}
            />
          )
        ) : (
          <FileIcon name={node.name} />
        )}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 px-1 py-0 text-[13px] bg-white border border-violet-300 rounded outline-none focus:border-violet-500 font-mono"
          />
        ) : (
          <span className="truncate flex-1">{node.name}</span>
        )}
      </div>
      {isFolder && isExpanded && node.children && (
        <AnimatePresence>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.8} />
      ) : (
        <Copy className="w-3.5 h-3.5" strokeWidth={1.8} />
      )}
    </button>
  );
}

function ResizeHandle({ direction = 'horizontal' }: { direction?: 'horizontal' | 'vertical' }) {
  return (
    <PanelResizeHandle
      className={`${
        direction === 'horizontal'
          ? 'w-[1px] bg-slate-200 hover:bg-violet-400 active:bg-violet-500 transition-colors duration-150'
          : 'h-[1px] bg-slate-200 hover:bg-violet-400 active:bg-violet-500 transition-colors duration-150'
      }`}
    />
  );
}

// ── Markdown Renderer ───────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-violet-600 prose-code:text-violet-600 prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match;
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[13px] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <div className="relative group/code rounded-lg overflow-hidden my-2 border border-slate-200">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-200">
                  <span className="text-[11px] text-slate-500 font-mono uppercase">
                    {match[1]}
                  </span>
                  <CopyBtn text={String(children)} />
                </div>
                <SyntaxHighlighter
                  style={oneLight}
                  language={match[1]}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    fontSize: '12.5px',
                    padding: '12px',
                    background: '#FAFAFA',
                  }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export default function BuilderIDEPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const isMobile = useIsMobile();
  // Initial prompt passed from the Agent workspace ("Build" button) or landing
  // hero. When present, it auto-fills the AI input and triggers send once
  // models are loaded. Consumed exactly once.
  const initialPrompt = searchParams.get('prompt');

  // ── State ────────────────────────────────────────────────────────
  const [project, setProject] = useState<{ name: string; description?: string } | null>(null);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Right panel state
  const [rightMode, setRightMode] = useState<RightMode>('code');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [files, setFiles] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<
    { path: string; content: string; unsaved: boolean }[]
  >([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  // File explorer
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  const [newItemParent, setNewItemParent] = useState<string>('');
  const [newFileName, setNewFileName] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Mobile
  const [mobileTab, setMobileTab] = useState<MobileTab>('ai');

  // Drag overlay
  const [isDragging, setIsDragging] = useState(false);

  // Project name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const editNameRef = useRef<HTMLInputElement>(null);

  // File diffs (for AI changes)
  const [pendingDiffs, setPendingDiffs] = useState<FileDiff[]>([]);
  const [showDiffFor, setShowDiffFor] = useState<string | null>(null);
  const preAiSnapshotRef = useRef<Record<string, string>>({});

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  // Ref to the latest handleSend (used by the initial-prompt auto-send effect).
  const handleSendRef = useRef<(() => Promise<void>) | null>(null);

  // ── Effects ──────────────────────────────────────────────────────

  // Fetch project info
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setProject({ name: data.name, description: data.description });
      })
      .catch(() => {});
  }, [projectId]);

  // Fetch models (Build Studio → coding models only: Cerebras + OpenRouter)
  useEffect(() => {
    fetch('/api/models?category=code')
      .then((r) => (r.ok ? r.json() : { configs: [] }))
      .then((data) => {
        const list: ModelConfig[] = (data.configs || []).filter(
          (c: ModelConfig) => c.enabled
        );
        setModels(list);
        const defaultModel = list.find((c) => c.isDefault) || list[0];
        if (defaultModel && !selectedModel) setSelectedModel(defaultModel.id);
      })
      .catch(() => {});
  }, []);

  // Auto-send the initial prompt (passed via ?prompt= from the Agent "Build"
  // button or the landing hero) once models are loaded. Consumed once.
  const initialPromptSentRef = useRef(false);
  useEffect(() => {
    if (!initialPrompt || initialPromptSentRef.current) return;
    if (models.length === 0) return; // wait for models to load
    if (streaming) return;
    initialPromptSentRef.current = true;
    // Defer setInput + handleSend out of the effect body to avoid cascading renders.
    const t = setTimeout(() => {
      setInput(initialPrompt);
      // Allow React to commit the input state before handleSend reads it.
      setTimeout(() => { handleSendRef.current?.(); }, 0);
    }, 0);
    return () => clearTimeout(t);
  }, [initialPrompt, models, streaming]);

  // Fetch files
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (res.ok) {
        const data = await res.json();
        const fileList: Array<{ path: string }> = data.files || [];
        const paths = fileList.map((f) => f.path);
        setFiles(paths);
        setFileTree(sortTree(buildFileTree(paths)));

        // Auto-expand first level
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          for (const p of paths) {
            const parts = p.split('/');
            if (parts.length > 1) {
              next.add(parts[0]);
            }
          }
          return next;
        });
      }
    } catch {
      // silently fail
    }
  }, [projectId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Focus name edit input
  useEffect(() => {
    if (isEditingName && editNameRef.current) {
      editNameRef.current.focus();
      editNameRef.current.select();
    }
  }, [isEditingName]);

  // ── File Operations ──────────────────────────────────────────────

  const loadFileContent = useCallback(
    async (path: string) => {
      const existing = openFiles.find((f) => f.path === path);
      if (existing) {
        setActiveFile(path);
        return;
      }
      try {
        const res = await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(path)}`
        );
        if (res.ok) {
          const data = await res.json();
          const fileData = data.file || data;
          const content = fileData.content || '';
          setOpenFiles((prev) => [...prev, { path, content, unsaved: false }]);
          setActiveFile(path);
        }
      } catch {
        // silently fail
      }
    },
    [projectId, openFiles]
  );

  const saveFile = useCallback(
    async (path: string, content: string) => {
      setSaveStatus('saving');
      try {
        await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(path)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          }
        );
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === path ? { ...f, unsaved: false } : f))
        );
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    },
    [projectId]
  );

  const handleEditorChange = useCallback(
    (value: string | undefined, path: string) => {
      if (value === undefined) return;
      setOpenFiles((prev) =>
        prev.map((f) =>
          f.path === path ? { ...f, content: value, unsaved: true } : f
        )
      );
      setSaveStatus('unsaved');

      if (saveTimers.current[path]) clearTimeout(saveTimers.current[path]);
      saveTimers.current[path] = setTimeout(() => saveFile(path, value), 500);
    },
    [saveFile]
  );

  const closeFile = useCallback(
    (path: string) => {
      setOpenFiles((prev) => {
        const next = prev.filter((f) => f.path !== path);
        if (activeFile === path) {
          setActiveFile(next.length > 0 ? next[next.length - 1].path : null);
        }
        return next;
      });
    },
    [activeFile]
  );

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleDeleteFile = useCallback(
    async (node: FileNode) => {
      if (node.type !== 'file') return;
      try {
        await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(node.path)}`,
          { method: 'DELETE' }
        );
        closeFile(node.path);
        fetchFiles();
      } catch {
        // silently fail
      }
    },
    [projectId, closeFile, fetchFiles]
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newName: string) => {
      if (!newName.trim()) {
        setRenamingPath(null);
        return;
      }
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName.trim();
      const newPath = parts.join('/');

      if (newPath === oldPath) {
        setRenamingPath(null);
        return;
      }

      try {
        // Get old content
        const res = await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(oldPath)}`
        );
        const data = res.ok ? await res.json() : null;
        const content = data?.file?.content || '';

        // Create new file
        await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: newPath, content }),
        });

        // Delete old file
        await fetch(
          `/api/projects/${projectId}/files/${encodeURIComponent(oldPath)}`,
          { method: 'DELETE' }
        );

        // Update open files
        setOpenFiles((prev) =>
          prev.map((f) => (f.path === oldPath ? { ...f, path: newPath } : f))
        );
        if (activeFile === oldPath) setActiveFile(newPath);

        setRenamingPath(null);
        fetchFiles();
      } catch {
        setRenamingPath(null);
      }
    },
    [projectId, activeFile, fetchFiles]
  );

  const createNewItem = useCallback(async () => {
    if (!newFileName.trim()) {
      setShowNewFileInput(false);
      return;
    }

    const basePath = newItemParent || '';
    const fullPath = basePath
      ? `${basePath}/${newFileName.trim()}`
      : newFileName.trim();

    try {
      if (newItemType === 'file') {
        await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath, content: '' }),
        });
        loadFileContent(fullPath);
      } else {
        // Create a placeholder file inside the folder
        const placeholderPath = `${fullPath}/.gitkeep`;
        await fetch(`/api/projects/${projectId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: placeholderPath, content: '' }),
        });
      }

      setShowNewFileInput(false);
      setNewFileName('');
      setNewItemParent('');

      // Expand parent
      if (basePath) {
        setExpandedPaths((prev) => {
          const next = new Set(prev);
          next.add(basePath);
          return next;
        });
      }

      fetchFiles();
    } catch {
      // silently fail
    }
  }, [newFileName, newItemType, newItemParent, projectId, fetchFiles, loadFileContent]);

  const handleContextMenuAction = useCallback(
    (action: string, node: FileNode) => {
      setCtxMenu(null);
      if (action === 'newFile') {
        setNewItemType('file');
        setNewItemParent(node.type === 'folder' ? node.path : '');
        setNewFileName('');
        setShowNewFileInput(true);
      } else if (action === 'newFolder') {
        setNewItemType('folder');
        setNewItemParent(node.type === 'folder' ? node.path : '');
        setNewFileName('');
        setShowNewFileInput(true);
      } else if (action === 'rename' && node.type === 'file') {
        setRenamingPath(node.path);
        setRenameValue(node.name);
      } else if (action === 'delete') {
        handleDeleteFile(node);
      }
    },
    [handleDeleteFile]
  );

  // ── AI Chat ──────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Snapshot current file contents before AI modifies them
    const snapshot: Record<string, string> = {};
    for (const f of openFiles) {
      snapshot[f.path] = f.content;
    }
    // Also snapshot files from the file list
    for (const p of files) {
      if (!(p in snapshot)) {
        const existing = openFiles.find((f) => f.path === p);
        if (existing) snapshot[p] = existing.content;
      }
    }
    preAiSnapshotRef.current = snapshot;

    const userMsg: Message = { id: uid(), role: 'user', content: prompt };
    const aiMsg: Message = {
      id: uid(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`/api/projects/${projectId}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          modelConfigId: selectedModel,
          conversationId,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (res.status === 429 && d.tokenExhausted) {
          window.dispatchEvent(new CustomEvent('codewix:token-exhausted', { detail: d }));
        }
        throw new Error(d.error || 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsg.id ? { ...m, isStreaming: false } : m
                )
              );
              // Detect diffs after AI completes
              detectDiffs();
              fetchFiles();
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'conversationId' && parsed.conversationId) {
                setConversationId(parsed.conversationId);
              }
              if (parsed.type === 'content') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsg.id
                      ? { ...m, content: m.content + parsed.content }
                      : m
                  )
                );
              } else if (parsed.type === 'tool') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsg.id
                      ? {
                          ...m,
                          toolCalls: [
                            ...(m.toolCalls || []),
                            {
                              tool: parsed.tool,
                              path: parsed.path,
                              status: parsed.status,
                            },
                          ],
                        }
                      : m
                  )
                );
              } else if (parsed.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsg.id
                      ? {
                          ...m,
                          content:
                            m.content +
                            `\n\n<span class="text-red-500">Error: ${parsed.error}</span>`,
                        }
                      : m
                  )
                );
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsg.id
              ? {
                  ...m,
                  content: 'Failed to get response. Please try again.',
                  isStreaming: false,
                }
              : m
          )
        );
        toast.error(err.message || 'AI request failed. Your token was refunded.');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setAttachments([]);
    }
  }, [input, streaming, selectedModel, conversationId, attachments, projectId, fetchFiles]);

  // Keep handleSendRef in sync so the initial-prompt effect can call the
  // latest handleSend without listing it as a dependency.
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  // ── Diff Detection & Management ────────────────────────────────

  const detectDiffs = useCallback(async () => {
    const snapshot = preAiSnapshotRef.current;
    if (Object.keys(snapshot).length === 0) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) return;
      const data = await res.json();
      const currentPaths: string[] = Array.isArray(data) ? data : (data.files || []).map((f: { path: string }) => f.path);

      const newDiffs: FileDiff[] = [];

      // Check for modified/new files
      for (const p of currentPaths) {
        try {
          const fileRes = await fetch(`/api/projects/${projectId}/files/${encodeURIComponent(p)}`);
          if (!fileRes.ok) continue;
          const fileData = await fileRes.json();
          const newContent = typeof fileData === 'string' ? fileData : (fileData.file?.content || fileData.content || '');
          const original = snapshot[p];
          if (original !== undefined && original !== newContent) {
            newDiffs.push({ path: p, originalContent: original, newContent, status: 'pending' });
          } else if (original === undefined && newContent) {
            newDiffs.push({ path: p, originalContent: '', newContent, status: 'pending' });
          }
        } catch {
          // skip individual file errors
        }
      }

      // Check for deleted files
      for (const p of Object.keys(snapshot)) {
        if (!currentPaths.includes(p)) {
          newDiffs.push({ path: p, originalContent: snapshot[p], newContent: '', status: 'pending' });
        }
      }

      if (newDiffs.length > 0) {
        setPendingDiffs((prev) => [...prev, ...newDiffs]);
      }
    } catch {
      // silently fail
    }
  }, [projectId]);

  const acceptDiff = useCallback((path: string) => {
    setPendingDiffs((prev) => prev.map((d) => d.path === path ? { ...d, status: 'accepted' } : d));
    setShowDiffFor(null);
  }, []);

  const rejectDiff = useCallback(async (path: string) => {
    const diff = pendingDiffs.find((d) => d.path === path);
    if (!diff) return;

    if (diff.originalContent) {
      // Restore original content
      try {
        await fetch(`/api/projects/${projectId}/files/${encodeURIComponent(path)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: diff.originalContent }),
        });
        // Update open files
        setOpenFiles((prev) => prev.map((f) => f.path === path ? { ...f, content: diff.originalContent, unsaved: false } : f));
      } catch {
        // silently fail
      }
    } else {
      // File was new - delete it
      try {
        await fetch(`/api/projects/${projectId}/files/${encodeURIComponent(path)}`, { method: 'DELETE' });
      } catch {
        // silently fail
      }
    }

    setPendingDiffs((prev) => prev.map((d) => d.path === path ? { ...d, status: 'rejected' } : d));
    setShowDiffFor(null);
    fetchFiles();
  }, [pendingDiffs, projectId, fetchFiles]);

  const acceptAllDiffs = useCallback(() => {
    setPendingDiffs((prev) => prev.map((d) => ({ ...d, status: 'accepted' as const })));
    setShowDiffFor(null);
  }, []);

  const rejectAllDiffs = useCallback(async () => {
    for (const diff of pendingDiffs.filter((d) => d.status === 'pending')) {
      await rejectDiff(diff.path);
    }
  }, [pendingDiffs, rejectDiff]);

  // Simple line-based diff computation
  const computeLineDiff = useCallback((oldText: string, newText: string) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: Array<{ type: 'same' | 'added' | 'removed'; content: string; oldLineNum?: number; newLineNum?: number }> = [];
    let oi = 0;
    let ni = 0;

    while (oi < oldLines.length || ni < newLines.length) {
      if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
        result.push({ type: 'same', content: oldLines[oi], oldLineNum: oi + 1, newLineNum: ni + 1 });
        oi++;
        ni++;
      } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.slice(oi).includes(newLines[ni]))) {
        result.push({ type: 'added', content: newLines[ni], newLineNum: ni + 1 });
        ni++;
      } else if (oi < oldLines.length) {
        result.push({ type: 'removed', content: oldLines[oi], oldLineNum: oi + 1 });
        oi++;
      } else {
        break;
      }
    }
    return result;
  }, []);

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  // ── Export ───────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project?.name || 'project'}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silently fail
    }
    setShowExportMenu(false);
  }, [projectId, project]);

  // ── Attachments ──────────────────────────────────────────────────

  const handleFileAttach = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList) return;

      const formData = new FormData();
      Array.from(fileList).forEach((f) => formData.append('files', f));

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          const uploaded: Attachment[] = (data.files || []).map(
            (f: { fileName: string; fileSize: number; filePath: string }) => ({
              id: uid(),
              name: f.fileName,
              size: f.fileSize,
              type: 'file',
              url: f.filePath,
            })
          );
          setAttachments((prev) => [...prev, ...uploaded]);
        }
      } catch {
        // silently fail
      }
      e.target.value = '';
    },
    []
  );

  // ── Drag & Drop ──────────────────────────────────────────────────

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length === 0) return;

      const formData = new FormData();
      Array.from(droppedFiles).forEach((f) => formData.append('files', f));

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          const uploaded: Attachment[] = (data.files || []).map(
            (f: { fileName: string; fileSize: number; filePath: string }) => ({
              id: uid(),
              name: f.fileName,
              size: f.fileSize,
              type: 'file',
              url: f.filePath,
            })
          );
          setAttachments((prev) => [...prev, ...uploaded]);
        }
      } catch {
        // silently fail
      }
    },
    []
  );

  // Clipboard paste for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          setAttachments((prev) => [
            ...prev,
            {
              id: uid(),
              name: file.name || 'pasted-image.png',
              size: file.size,
              type: file.type,
            },
          ]);
        }
      }
    }
  }, []);

  // ── Keyboard handler for textarea ───────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // ── Project name editing ────────────────────────────────────────

  const handleNameDoubleClick = useCallback(() => {
    if (project) {
      setIsEditingName(true);
      setEditingName(project.name);
    }
  }, [project]);

  const handleNameSubmit = useCallback(async () => {
    if (!editingName.trim()) {
      setIsEditingName(false);
      return;
    }
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      setProject((prev) => (prev ? { ...prev, name: editingName.trim() } : prev));
    } catch {
      // silently fail
    }
    setIsEditingName(false);
  }, [editingName, projectId]);

  // ── Computed values ─────────────────────────────────────────────

  const activeFileData = useMemo(
    () => openFiles.find((f) => f.path === activeFile),
    [openFiles, activeFile]
  );

  const filteredTree = useMemo(
    () => (searchQuery ? filterTree(fileTree, searchQuery) : fileTree),
    [fileTree, searchQuery]
  );

  const viewportWidth =
    viewport === 'desktop' ? '100%' : viewport === 'tablet' ? '768px' : '375px';

  // ── Render helpers ──────────────────────────────────────────────

  const renderTopBar = () => (
    <div className="h-12 flex-shrink-0 flex items-center justify-between px-3 sm:px-4 border-b border-slate-200 bg-white">
      {/* Left */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          onClick={() => router.push('/build')}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all flex-shrink-0"
          title="Back to projects"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        </button>
        {isEditingName ? (
          <input
            ref={editNameRef}
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') setIsEditingName(false);
            }}
            className="text-[14px] font-medium text-slate-800 bg-slate-50 border border-violet-300 rounded-md px-2 py-0.5 outline-none focus:border-violet-500 min-w-0 max-w-[200px]"
          />
        ) : (
          <h1
            className="text-[14px] font-medium text-slate-800 truncate cursor-default"
            onDoubleClick={handleNameDoubleClick}
            title="Double-click to rename"
          >
            {project?.name || 'Loading...'}
          </h1>
        )}
        <div className="flex items-center gap-1 text-[12px] text-slate-400 flex-shrink-0">
          {saveStatus === 'saving' && (
            <Loader2 className="w-3 h-3 animate-spin" />
          )}
          {saveStatus === 'saved' && (
            <Save className="w-3 h-3 text-emerald-500" strokeWidth={2} />
          )}
          {saveStatus === 'unsaved' && (
            <CircleDot className="w-3 h-3 text-amber-500" strokeWidth={2} />
          )}
          <span
            className={`hidden sm:inline ${
              saveStatus === 'unsaved' ? 'text-amber-500' : ''
            }`}
          >
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
                ? 'Saved'
                : 'Unsaved'}
          </span>
        </div>
      </div>

      {/* Center - Preview/Code toggle */}
      <div className="flex items-center gap-1 mx-2">
        <div className="flex items-center rounded-full bg-slate-100 p-0.5">
          <button
            onClick={() => setRightMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
              rightMode === 'preview'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Eye className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => setRightMode('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-all ${
              rightMode === 'code'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Code</span>
          </button>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Viewport buttons (preview mode) */}
        {rightMode === 'preview' && !isMobile && (
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
            {(
              [
                ['desktop', Monitor],
                ['tablet', Tablet],
                ['mobile', Smartphone],
              ] as const
            ).map(([vp, Icon]) => (
              <button
                key={vp}
                onClick={() => setViewport(vp)}
                className={`p-1.5 rounded-md transition-all ${
                  viewport === vp
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            ))}
          </div>
        )}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Refresh */}
        <button
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" strokeWidth={1.8} />
        </button>

        {/* GitHub */}
        <button
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
          title="GitHub"
        >
          <Github className="w-4 h-4" strokeWidth={1.8} />
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
            title="Export"
          >
            <Download className="w-4 h-4" strokeWidth={1.8} />
          </button>
          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-xl shadow-lg min-w-[160px] z-50"
              >
                <button
                  onClick={handleExport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors rounded-t-lg"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Download ZIP
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings */}
        <button
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
          title="Settings"
        >
          <Settings className="w-4 h-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );

  const renderAIPanel = () => (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Model selector + New conversation */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/20 transition-all appearance-none cursor-pointer"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
            {models.length === 0 && (
              <option value="">Loading models...</option>
            )}
          </select>
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-all flex-shrink-0"
            title="New conversation"
          >
            <RotateCcw className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-violet-500" strokeWidth={1.8} />
            </div>
            <h3 className="text-[15px] font-semibold text-slate-800 mb-1">
              AI Assistant
            </h3>
            <p className="text-[13px] text-slate-400 max-w-[240px] leading-relaxed">
              Describe what you want to build and I&apos;ll create it for you.
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                  msg.role === 'user'
                    ? 'bg-violet-100'
                    : 'bg-slate-100'
                }`}
              >
                {msg.role === 'user' ? (
                  <User
                    className="w-4 h-4 text-violet-600"
                    strokeWidth={1.8}
                  />
                ) : (
                  <Bot
                    className="w-4 h-4 text-slate-500"
                    strokeWidth={1.8}
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={`flex-1 min-w-0 ${msg.role === 'user' ? 'text-right' : ''}`}
              >
                <div
                  className={`inline-block rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed max-w-full ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-tr-md'
                      : 'bg-white text-slate-700 rounded-tl-md border border-slate-200 shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <>
                      <MarkdownRenderer content={msg.content} />
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle rounded-full" />
                      )}
                    </>
                  )}
                </div>

                {/* Tool calls / activity badges */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div
                    className={`flex flex-wrap gap-1.5 mt-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.toolCalls.map((tc, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                          tc.status === 'done'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-amber-50 text-amber-600 border border-amber-200'
                        }`}
                      >
                        {tc.tool === 'writeFile' || tc.tool === 'createFile'
                          ? '✏️'
                          : tc.tool === 'readFile'
                            ? '📄'
                            : tc.tool === 'deleteFile'
                              ? '🗑️'
                              : '🔧'}
                        {tc.path ? tc.path.split('/').pop() : tc.tool}
                        {tc.status === 'done' ? ' ✓' : '...'}
                      </span>
                    ))}
                  </div>
                )}

                {/* Copy for AI messages */}
                {msg.role === 'assistant' && msg.content && !msg.isStreaming && (
                  <div className="mt-1.5">
                    <CopyBtn text={msg.content} />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading dots */}
        {streaming &&
          messages.length > 0 &&
          messages[messages.length - 1].content === '' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                <Bot
                  className="w-4 h-4 text-slate-500"
                  strokeWidth={1.8}
                />
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-violet-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-violet-50/80 border-2 border-dashed border-violet-300 rounded-lg z-10 flex items-center justify-center"
          >
            <div className="text-center">
              <Paperclip
                className="w-8 h-8 text-violet-400 mx-auto mb-2"
                strokeWidth={1.5}
              />
              <p className="text-sm font-medium text-violet-600">
                Drop files here
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-2 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[12px] text-slate-600 shadow-sm"
            >
              <Paperclip className="w-3 h-3 text-slate-400" strokeWidth={2} />
              <span className="truncate max-w-[100px]">{att.name}</span>
              <span className="text-slate-400">{formatFileSize(att.size)}</span>
              <button
                onClick={() =>
                  setAttachments((prev) =>
                    prev.filter((a) => a.id !== att.id)
                  )
                }
                className="ml-0.5 text-slate-300 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Prompt composer */}
      <div className="flex-shrink-0 p-3 border-t border-slate-200 bg-white relative">
        <div
          className="flex items-end gap-2 p-2 rounded-2xl bg-slate-50 border border-slate-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/10 transition-all"
          onPaste={handlePaste}
        >
          {/* Attach button */}
          <label className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-all cursor-pointer">
            <Paperclip className="w-4 h-4" strokeWidth={1.8} />
            <input
              type="file"
              multiple
              onChange={handleFileAttach}
              className="hidden"
            />
          </label>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to build..."
            rows={1}
            className="flex-1 bg-transparent text-[14px] text-slate-700 placeholder-slate-400 resize-none focus:outline-none py-1.5 max-h-[200px]"
          />

          {/* Send / Stop */}
          {streaming ? (
            <button
              onClick={handleStop}
              className="flex-shrink-0 p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all border border-red-200"
              title="Stop generating"
            >
              <Square className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex-shrink-0 p-2 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 transition-all shadow-md shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );

  const renderFileExplorer = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Files
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setNewItemType('file');
                setNewItemParent('');
                setNewFileName('');
                setShowNewFileInput(true);
              }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-all"
              title="New File"
            >
              <FilePlus className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
            <button
              onClick={() => {
                setNewItemType('folder');
                setNewItemParent('');
                setNewFileName('');
                setShowNewFileInput(true);
              }}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-violet-600 transition-all"
              title="New Folder"
            >
              <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" strokeWidth={2} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-violet-400 transition-colors"
          />
        </div>
      </div>

      {/* New file input */}
      <AnimatePresence>
        {showNewFileInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-2 py-1.5 border-b border-slate-200 overflow-hidden"
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-400 flex-shrink-0">
                {newItemType === 'file' ? '📄' : '📁'}
              </span>
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createNewItem();
                  if (e.key === 'Escape') {
                    setShowNewFileInput(false);
                    setNewFileName('');
                  }
                }}
                placeholder={
                  newItemType === 'file' ? 'filename.ts' : 'folder-name'
                }
                className="flex-1 px-2 py-1 bg-white border border-violet-300 rounded-md text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            activePath={activeFile || ''}
            onSelect={loadFileContent}
            onContextMenu={(e, node) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, node });
            }}
            expandedPaths={expandedPaths}
            toggleExpand={toggleExpand}
            renamingPath={renamingPath}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={() =>
              handleRenameFile(renamingPath || '', renameValue)
            }
            onRenameCancel={() => setRenamingPath(null)}
          />
        ))}
        {fileTree.length === 0 && (
          <div className="px-3 py-8 text-center">
            <File
              className="w-8 h-8 text-slate-300 mx-auto mb-2"
              strokeWidth={1.5}
            />
            <p className="text-[12px] text-slate-400">
              No files yet. Use AI to generate code.
            </p>
          </div>
        )}
        {searchQuery && filteredTree.length === 0 && fileTree.length > 0 && (
          <div className="px-3 py-6 text-center text-[12px] text-slate-400">
            No files match &quot;{searchQuery}&quot;
          </div>
        )}
      </div>
    </div>
  );

  const renderCodeEditor = () => (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Tabs */}
      {openFiles.length > 0 && (
        <div className="flex-shrink-0 flex items-center border-b border-slate-200 bg-slate-50/50 overflow-x-auto">
          {openFiles.map((f) => {
            const hasDiff = pendingDiffs.some((d) => d.path === f.path && d.status === 'pending');
            return (
            <div
              key={f.path}
              onClick={() => { setActiveFile(f.path); if (hasDiff) setShowDiffFor(f.path); }}
              className={`group flex items-center gap-1.5 px-3 py-2 text-[12px] border-r border-slate-200 cursor-pointer min-w-0 flex-shrink-0 transition-all ${
                activeFile === f.path
                  ? 'bg-white text-slate-800 border-b-2 border-b-violet-500 font-medium'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {hasDiff && (
                <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
              )}
              {f.unsaved && !hasDiff && (
                <CircleDot
                  className="w-2.5 h-2.5 text-amber-500 flex-shrink-0"
                  strokeWidth={2}
                />
              )}
              <FileIcon name={f.path.split('/').pop() || ''} />
              <span className="truncate max-w-[120px]">
                {f.path.split('/').pop()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(f.path);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all"
              >
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            </div>
            );
          })}
        </div>
      )}

      {/* Pending diffs banner */}
      {pendingDiffs.filter((d) => d.status === 'pending').length > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-amber-50 border-b border-amber-200/60">
          <div className="flex items-center gap-2 text-[12px] text-amber-700">
            <CircleDot className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="font-medium">{pendingDiffs.filter((d) => d.status === 'pending').length} file(s) modified by AI</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const next = pendingDiffs.find((d) => d.status === 'pending');
                if (next) setShowDiffFor(next.path);
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
            >
              Review Changes
            </button>
            <button onClick={acceptAllDiffs} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors">
              Accept All
            </button>
            <button onClick={rejectAllDiffs} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-colors">
              Reject All
            </button>
          </div>
        </div>
      )}

      {/* Diff view overlay */}
      <AnimatePresence>
        {showDiffFor && (() => {
          const diff = pendingDiffs.find((d) => d.path === showDiffFor);
          if (!diff) return null;
          const lineDiff = computeLineDiff(diff.originalContent, diff.newContent);
          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: '60%' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex-shrink-0 border-t-2 border-violet-300 flex flex-col overflow-hidden bg-white"
            >
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-700">Diff: {diff.path}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                    {diff.newContent === '' ? 'Deleted' : diff.originalContent === '' ? 'New File' : 'Modified'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => acceptDiff(diff.path)} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors">
                    Accept
                  </button>
                  <button onClick={() => rejectDiff(diff.path)} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-100 hover:bg-red-200 text-red-700 transition-colors">
                    Reject
                  </button>
                  <button onClick={() => setShowDiffFor(null)} className="p-1 rounded-md hover:bg-slate-200 text-slate-400 transition-colors">
                    <X className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto text-[12px] font-mono">
                {lineDiff.map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-stretch ${
                      line.type === 'added' ? 'bg-emerald-50 border-l-2 border-emerald-400' :
                      line.type === 'removed' ? 'bg-red-50 border-l-2 border-red-400' :
                      'border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`w-10 flex-shrink-0 text-right pr-2 select-none ${
                      line.type === 'added' ? 'text-emerald-500' : line.type === 'removed' ? 'text-red-400' : 'text-slate-300'
                    }`} style={{ fontSize: '11px' }}>
                      {line.type === 'removed' ? (line.oldLineNum || '') : (line.newLineNum || '')}
                    </span>
                    <span className={`w-4 flex-shrink-0 text-center select-none ${
                      line.type === 'added' ? 'text-emerald-500' : line.type === 'removed' ? 'text-red-400' : 'text-slate-300'
                    }`} style={{ fontSize: '11px' }}>
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    <pre className="flex-1 whitespace-pre-wrap break-all pr-4 py-0.5" style={{ fontSize: '12px' }}>
                      {line.content || ' '}
                    </pre>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {showDiffFor && activeFileData ? (
          /* When viewing diff, show editor read-only below */
          <MonacoEditor
            key={activeFileData.path + '-readonly'}
            height="100%"
            language={getLanguage(activeFileData.path)}
            value={activeFileData.content}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: '"Geist Mono", "Fira Code", "Cascadia Code", monospace',
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              readOnly: true,
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        ) : activeFileData ? (
          <MonacoEditor
            key={activeFileData.path}
            height="100%"
            language={getLanguage(activeFileData.path)}
            value={activeFileData.content}
            theme="vs-dark"
            onChange={(v) => handleEditorChange(v, activeFileData.path)}
            options={{
              fontSize: 13,
              fontFamily: '"Geist Mono", "Fira Code", "Cascadia Code", monospace',
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 12 },
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              tabSize: 2,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-300">
            <Code2 className="w-12 h-12 mb-3" strokeWidth={1.2} />
            <p className="text-[14px] font-medium text-slate-400">
              {openFiles.length === 0
                ? 'Select a file to edit'
                : 'Select a tab'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderPreviewMode = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50/50">
      <div
        className="h-full rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 flex flex-col shadow-sm"
        style={{ width: viewportWidth, maxWidth: '100%' }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-16 h-16 mx-auto rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center"
            >
              <Play className="w-8 h-8 text-violet-500" strokeWidth={1.8} />
            </motion.div>
            <div>
              <h3 className="text-[15px] font-semibold text-slate-800 mb-1">
                Live Preview
              </h3>
              <p className="text-[13px] text-slate-400 max-w-[260px]">
                Run the project to see live changes here
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 text-white text-[13.5px] font-medium hover:from-violet-700 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/20"
            >
              <Play className="w-4 h-4" strokeWidth={2} />
              Run Project
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRightPanel = () => (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {rightMode === 'preview' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Preview toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-1">
              {isMobile && (
                <div className="flex items-center rounded-lg bg-slate-100 p-0.5 mr-2">
                  {(
                    [
                      ['desktop', Monitor],
                      ['tablet', Tablet],
                      ['mobile', Smartphone],
                    ] as const
                  ).map(([vp, Icon]) => (
                    <button
                      key={vp}
                      onClick={() => setViewport(vp)}
                      className={`p-1.5 rounded-md transition-all ${
                        viewport === vp
                          ? 'bg-white text-violet-600 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  ))}
                </div>
              )}
              <span className="text-[12px] text-slate-400 font-medium">
                Preview
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
              <button className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          </div>
          {renderPreviewMode()}
        </div>
      ) : (
        <PanelGroup direction="horizontal">
          <Panel defaultSize={25} minSize={15} maxSize={40}>
            {renderFileExplorer()}
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={75} minSize={40}>
            {renderCodeEditor()}
          </Panel>
        </PanelGroup>
      )}
    </div>
  );

  // ── Main Render ──────────────────────────────────────────────────

  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="h-full flex flex-col bg-white"
      >
        {renderTopBar()}

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {mobileTab === 'ai' && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0"
              >
                {renderAIPanel()}
              </motion.div>
            )}
            {mobileTab === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0"
              >
                <PanelGroup direction="horizontal">
                  <Panel defaultSize={30} minSize={20} maxSize={45}>
                    {renderFileExplorer()}
                  </Panel>
                  <ResizeHandle />
                  <Panel defaultSize={70} minSize={40}>
                    {renderCodeEditor()}
                  </Panel>
                </PanelGroup>
              </motion.div>
            )}
            {mobileTab === 'preview' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0"
              >
                {renderPreviewMode()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile bottom tab bar */}
        <div className="flex-shrink-0 flex items-center border-t border-slate-200 bg-white">
          {(
            [
              ['ai', MessageSquare, 'AI'],
              ['code', Code2, 'Code'],
              ['preview', Eye, 'Preview'],
            ] as const
          ).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-all ${
                mobileTab === tab
                  ? 'text-violet-600'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-4.5 h-4.5" strokeWidth={1.8} />
              <span className="text-[10px] font-medium">{label}</span>
              {mobileTab === tab && (
                <motion.div
                  layoutId="mobile-tab-indicator"
                  className="w-5 h-0.5 rounded-full bg-violet-600 -mt-0.5"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Context Menu (mobile) */}
        <AnimatePresence>
          {ctxMenu && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                onClick={() => setCtxMenu(null)}
              />
              <motion.div
                ref={ctxMenuRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="fixed z-50 py-1 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[160px]"
                style={{
                  left: Math.min(ctxMenu.x, window.innerWidth - 180),
                  top: Math.min(ctxMenu.y, window.innerHeight - 200),
                }}
              >
                <button
                  onClick={() => handleContextMenuAction('newFile', ctxMenu.node)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <FilePlus className="w-3.5 h-3.5" strokeWidth={1.8} />
                  New File
                </button>
                <button
                  onClick={() => handleContextMenuAction('newFolder', ctxMenu.node)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
                  New Folder
                </button>
                {ctxMenu.node.type === 'file' && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      onClick={() => handleContextMenuAction('rename', ctxMenu.node)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" strokeWidth={1.8} />
                      Rename
                    </button>
                    <button
                      onClick={() => handleContextMenuAction('delete', ctxMenu.node)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                      Delete
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Desktop layout
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col bg-white"
    >
      {renderTopBar()}

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Panel: AI Assistant */}
          <Panel defaultSize={35} minSize={20} maxSize={55}>
            {renderAIPanel()}
          </Panel>

          <ResizeHandle />

          {/* Right Panel: Code / Preview */}
          <Panel defaultSize={65} minSize={35}>
            {renderRightPanel()}
          </Panel>
        </PanelGroup>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {ctxMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              onClick={() => setCtxMenu(null)}
            />
            <motion.div
              ref={ctxMenuRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-50 py-1 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[160px]"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <button
                onClick={() => handleContextMenuAction('newFile', ctxMenu.node)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors rounded-t-lg"
              >
                <FilePlus className="w-3.5 h-3.5" strokeWidth={1.8} />
                New File
              </button>
              <button
                onClick={() => handleContextMenuAction('newFolder', ctxMenu.node)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
                New Folder
              </button>
              {ctxMenu.node.type === 'file' && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => handleContextMenuAction('rename', ctxMenu.node)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Rename
                  </button>
                  <button
                    onClick={() => handleContextMenuAction('delete', ctxMenu.node)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors rounded-b-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    Delete
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
