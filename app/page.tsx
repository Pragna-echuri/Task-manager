'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, Calendar, AlertTriangle, User, Check,
  LayoutDashboard, BarChart3, MessageCircle, Send, LogOut,
  Clock, ArrowRight, Lock, Mail, GripVertical,
  Search, Filter, X, ChevronRight, TrendingUp, CheckCircle2, Zap
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Subtask { id: string; title: string; completed: boolean; }

interface Task {
  id: string; userId: string; title: string; description: string;
  status: 'backlog' | 'planning' | 'execution' | 'review' | 'archived';
  dueDate: string; priority: 'low' | 'medium' | 'high';
  assignee: string; subtasks: Subtask[];
  createdAt: string; updatedAt: string;
}

interface ChatMessage {
  id: string; userId: string; role: 'user' | 'assistant';
  content: string; createdAt: string;
}

type AuthUser = { id: string; email: string; name: string };

// ─── Column Config ──────────────────────────────────────────────────────────
const COLUMNS: { key: Task['status']; label: string; color: string; bg: string }[] = [
  { key: 'backlog',   label: 'Backlog / Ideas',       color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
  { key: 'planning',  label: 'In Planning',           color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  { key: 'execution', label: 'Active Execution',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  { key: 'review',    label: 'Evaluation / Review',   color: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
  { key: 'archived',  label: 'Archived / Completed',  color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: '#f43f5e', medium: '#f59e0b', low: '#10b981',
};

// ─── Helper ─────────────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 10); }

function isOverdue(d: string) {
  if (!d) return false;
  return new Date(d).getTime() < new Date().setHours(0,0,0,0);
}

function isDueSoon(d: string) {
  if (!d) return false;
  const t = new Date(d).getTime();
  const now = Date.now();
  return t >= now && t <= now + 48 * 3600000;
}

// ─── Main Page Component ────────────────────────────────────────────────────
export default function Home() {
  // ── Auth ──
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // ── App State ──
  const [view, setView] = useState<'board' | 'dashboard'>('board');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [prioFilter, setPrioFilter] = useState<'all'|'low'|'medium'|'high'>('all');

  // ── Detail Editor ──
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [newSubTitle, setNewSubTitle] = useState('');

  // ── Drag-and-Drop ──
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // ── Chat ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Update timer ref for debounced saves ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Session Check ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/auth').then(async r => {
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
        loadTasks();
        loadChat();
      }
    }).catch(() => {}).finally(() => setLoadingUser(false));
  }, []);

  // ─── Data Loaders ─────────────────────────────────────────────────────────
  async function loadTasks() {
    try { const r = await fetch('/api/tasks'); if (r.ok) { const d = await r.json(); setTasks(d.tasks); } } catch {}
  }
  async function loadChat() {
    try { const r = await fetch('/api/chat'); if (r.ok) { const d = await r.json(); setChatMsgs(d.history || []); } } catch {}
  }

  // ─── Auth Handlers ────────────────────────────────────────────────────────
  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAuthErr('');
    setAuthBusy(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: authMode,
          email: authEmail,
          password: authPass,
          ...(authMode === 'signup' ? { name: authName } : {})
        })
      });
      const data = await res.json();
      if (!res.ok) { setAuthErr(data.error || 'Failed'); return; }
      setUser(data.user);
      setShowAuth(false);
      setAuthEmail(''); setAuthPass(''); setAuthName('');
      loadTasks();
      loadChat();
    } catch { setAuthErr('Network error'); }
    finally { setAuthBusy(false); }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    setUser(null); setTasks([]); setChatMsgs([]);
    setView('board'); setChatOpen(false);
  }

  // ─── Task CRUD ────────────────────────────────────────────────────────────
  async function createTask(status: Task['status']) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Task',
          description: '',
          status,
          dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          priority: 'medium',
          assignee: user?.name || '',
          subtasks: []
        })
      });
      if (res.ok) {
        const d = await res.json();
        setTasks(prev => [...prev, d.task]);
        setEditTask(d.task);
      }
    } catch {}
  }

  // Debounced save to avoid hammering the API on every keystroke
  const saveTask = useCallback((t: Task) => {
    setTasks(prev => prev.map(x => x.id === t.id ? t : x));
    setEditTask(t);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/tasks?id=${t.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(t)
        });
      } catch {}
    }, 400);
  }, []);

  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    setEditTask(null);
    try { await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' }); } catch {}
  }

  // ─── Drag and Drop ────────────────────────────────────────────────────────
  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    // Make drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }

  function onDragEnd(e: React.DragEvent) {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragId(null);
    setDragOverCol(null);
  }

  function onDrop(e: React.DragEvent, status: Task['status']) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    setDragOverCol(null);
    if (!id) return;
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === status) return;
    const updated = { ...task, status };
    saveTask(updated);
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  async function sendChat(text?: string) {
    const msg = text || chatInput;
    if (!msg.trim() || chatBusy) return;
    setChatInput('');
    setChatBusy(true);

    const userMsg: ChatMessage = {
      id: genId(), userId: user?.id || '', role: 'user',
      content: msg, createdAt: new Date().toISOString()
    };
    setChatMsgs(prev => [...prev, userMsg]);
    scrollChat();

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const d = r.ok ? await r.json() : { reply: 'Failed to get response.' };
      setChatMsgs(prev => [...prev, {
        id: genId(), userId: user?.id || '', role: 'assistant',
        content: d.reply, createdAt: new Date().toISOString()
      }]);
    } catch {
      setChatMsgs(prev => [...prev, {
        id: genId(), userId: user?.id || '', role: 'assistant',
        content: 'Connection error.', createdAt: new Date().toISOString()
      }]);
    } finally { setChatBusy(false); scrollChat(); }
  }

  async function clearChat() {
    await fetch('/api/chat', { method: 'DELETE' }).catch(() => {});
    setChatMsgs([]);
  }

  function scrollChat() {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 120);
  }

  useEffect(() => { if (chatOpen) scrollChat(); }, [chatOpen, chatMsgs.length]);

  // ─── Filtered Tasks ───────────────────────────────────────────────────────
  const filtered = useMemo(() => tasks.filter(t => {
    if (prioFilter !== 'all' && t.priority !== prioFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tasks, search, prioFilter]);

  const byCol = useMemo(() => {
    const m: Record<Task['status'], Task[]> = { backlog:[], planning:[], execution:[], review:[], archived:[] };
    filtered.forEach(t => m[t.status]?.push(t));
    return m;
  }, [filtered]);

  // ─── Metrics ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'archived').length;
    const rate = total ? Math.round((done / total) * 100) : 0;
    const byStat = {
      backlog: tasks.filter(t => t.status === 'backlog').length,
      planning: tasks.filter(t => t.status === 'planning').length,
      execution: tasks.filter(t => t.status === 'execution').length,
      review: tasks.filter(t => t.status === 'review').length,
      archived: done,
    };
    const urgent = tasks.filter(t => t.status !== 'archived' && isDueSoon(t.dueDate));
    const overdue = tasks.filter(t => t.status !== 'archived' && isOverdue(t.dueDate));
    return { total, done, rate, byStat, urgent, overdue };
  }, [tasks]);

  // ─── LOADING ──────────────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-0">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-brand-indigo rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LANDING PAGE (unauthenticated)
  // ═════════════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        {/* Nav */}
        <header className="w-full max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-indigo flex items-center justify-center">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white">TaskFlow</span>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setAuthMode('login'); setShowAuth(true); setAuthErr(''); }}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
              Sign In
            </button>
            <button type="button" onClick={() => { setAuthMode('signup'); setShowAuth(true); setAuthErr(''); }}
              className="px-4 py-2 text-sm bg-brand-indigo hover:bg-brand-indigo/90 rounded-lg text-white font-medium transition-colors">
              Get Started
            </button>
          </div>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-3xl mx-auto py-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 text-xs font-medium text-brand-indigo mb-6">
            <Zap className="h-3 w-3" /> Personal Task Management
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
            Organize your work.<br />
            <span className="text-brand-indigo">Ship faster.</span>
          </h1>
          <p className="text-lg text-zinc-400 mb-10 max-w-xl">
            A drag-and-drop Kanban board with custom workflow states, visual analytics,
            and an AI assistant that understands your tasks.
          </p>
          <div className="flex gap-4">
            <button type="button" onClick={() => { setAuthMode('signup'); setShowAuth(true); setAuthErr(''); }}
              className="px-6 py-3 bg-brand-indigo hover:bg-brand-indigo/90 rounded-xl text-white font-semibold flex items-center gap-2 transition-colors">
              Create Free Account <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { setAuthMode('login'); setShowAuth(true); setAuthErr(''); }}
              className="px-6 py-3 bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-xl text-zinc-300 font-semibold transition-colors">
              Sign In
            </button>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full text-left">
            {[
              { icon: LayoutDashboard, title: 'Kanban Board', desc: '5-column workflow: Backlog → Planning → Active → Review → Archived.' },
              { icon: BarChart3, title: 'Analytics Dashboard', desc: 'Track completion rates, velocity distribution, and urgent deadlines.' },
              { icon: MessageCircle, title: 'AI Assistant', desc: 'Context-aware chatbot grounded in your actual task data.' },
            ].map(f => (
              <div key={f.title} className="p-5 rounded-xl bg-surface-1 border border-surface-3 flex flex-col gap-3">
                <f.icon className="h-5 w-5 text-brand-indigo" />
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm text-zinc-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="text-center py-6 text-xs text-zinc-600">© 2026 TaskFlow</footer>

        {/* ── AUTH MODAL ── */}
        {showAuth && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setShowAuth(false)}>
            <div className="w-full max-w-sm bg-surface-1 border border-surface-3 rounded-2xl p-6 shadow-2xl animate-slide-up"
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-white">
                  {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <button type="button" onClick={() => setShowAuth(false)} className="p-1 text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
              </div>

              {authErr && <div className="p-2.5 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center">{authErr}</div>}

              <form onSubmit={submitAuth} className="flex flex-col gap-3.5">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                      <input type="text" required value={authName} onChange={e => setAuthName(e.target.value)}
                        placeholder="John Doe" autoComplete="name"
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/60" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                      placeholder="you@example.com" autoComplete="email"
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/60" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input type="password" required value={authPass} onChange={e => setAuthPass(e.target.value)}
                      placeholder="••••••••" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/60" />
                  </div>
                </div>
                <button type="submit" disabled={authBusy}
                  className="w-full mt-1 py-2.5 rounded-lg bg-brand-indigo hover:bg-brand-indigo/90 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {authBusy ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
                </button>
              </form>

              <p className="mt-5 text-center text-xs text-zinc-500">
                {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthErr(''); }}
                  className="text-brand-indigo hover:underline font-medium">
                  {authMode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // AUTHENTICATED APP
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">

      {/* ── HEADER ── */}
      <header className="border-b border-surface-3 bg-surface-1/80 backdrop-blur-sm px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-brand-indigo flex items-center justify-center">
              <LayoutDashboard className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-white">TaskFlow</span>
          </div>
          <nav className="flex bg-surface-2 p-0.5 rounded-lg border border-surface-3">
            <button type="button" onClick={() => setView('board')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${view === 'board' ? 'bg-brand-indigo text-white' : 'text-zinc-400 hover:text-white'}`}>
              <LayoutDashboard className="h-3.5 w-3.5" /> Board
            </button>
            <button type="button" onClick={() => setView('dashboard')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${view === 'dashboard' ? 'bg-brand-indigo text-white' : 'text-zinc-400 hover:text-white'}`}>
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-surface-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/50" />
          </div>
          <select value={prioFilter} onChange={e => setPrioFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-surface-3 text-xs text-zinc-300 focus:outline-none cursor-pointer">
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button type="button" onClick={() => setChatOpen(v => !v)}
            className={`p-2 rounded-lg border transition-colors ${chatOpen ? 'bg-brand-indigo/20 border-brand-indigo/40 text-brand-indigo' : 'bg-surface-2 border-surface-3 text-zinc-400 hover:text-white'}`}>
            <MessageCircle className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 pl-2 border-l border-surface-3">
            <div className="w-7 h-7 rounded-full bg-brand-indigo/15 text-brand-indigo text-xs font-bold flex items-center justify-center">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-zinc-300 hidden sm:inline font-medium">{user.name}</span>
            <button type="button" onClick={logout} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors" title="Logout">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="flex-1 flex overflow-hidden relative">

        {/* ═══ BOARD VIEW ═══ */}
        {view === 'board' && (
          <div className="flex-1 overflow-x-auto p-4 flex gap-4 items-start" style={{ height: 'calc(100vh - 64px)' }}>
            {COLUMNS.map(col => (
              <div key={col.key}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={e => onDrop(e, col.key)}
                className={`w-72 shrink-0 flex flex-col rounded-xl border transition-all h-full ${
                  dragOverCol === col.key ? 'border-brand-indigo/50 bg-brand-indigo/[0.03]' : 'border-surface-3 bg-surface-1/50'
                }`}>
                {/* Col header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-surface-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{col.label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 bg-surface-2 px-1.5 py-0.5 rounded">{byCol[col.key].length}</span>
                </div>
                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-2.5">
                  {byCol[col.key].map(task => (
                    <div key={task.id} draggable
                      onDragStart={e => onDragStart(e, task.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => setEditTask(task)}
                      className={`p-3 rounded-lg bg-surface-2 border border-surface-3 hover:border-zinc-600 cursor-pointer transition-all group ${
                        dragId === task.id ? 'opacity-50' : ''
                      }`}>
                      {/* Priority + Date row */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                          style={{ color: PRIORITY_COLORS[task.priority], backgroundColor: PRIORITY_COLORS[task.priority] + '18' }}>
                          {task.priority}
                        </span>
                        {task.dueDate && (
                          <span className={`text-[10px] font-mono flex items-center gap-1 ${
                            isOverdue(task.dueDate) && task.status !== 'archived' ? 'text-red-400 font-bold animate-pulse-border' :
                            isDueSoon(task.dueDate) && task.status !== 'archived' ? 'text-amber-400' : 'text-zinc-500'
                          }`}>
                            {isOverdue(task.dueDate) && task.status !== 'archived' && <AlertTriangle className="h-3 w-3" />}
                            {task.dueDate}
                          </span>
                        )}
                      </div>
                      {/* Title */}
                      <h4 className="text-sm font-semibold text-white group-hover:text-brand-indigo transition-colors line-clamp-2 mb-1">{task.title}</h4>
                      {task.description && <p className="text-xs text-zinc-500 line-clamp-1 mb-2">{task.description}</p>}
                      {/* Subtask progress */}
                      {task.subtasks.length > 0 && (
                        <div className="mt-1 pt-2 border-t border-surface-3">
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                            <span>Subtasks</span>
                            <span className="font-mono">{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                          </div>
                          <div className="w-full h-1 bg-surface-3 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-indigo rounded-full transition-all duration-300"
                              style={{ width: `${(task.subtasks.filter(s => s.completed).length / task.subtasks.length) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      {/* Assignee */}
                      {task.assignee && (
                        <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-zinc-500">
                          <User className="h-3 w-3" /> {task.assignee}
                        </div>
                      )}
                    </div>
                  ))}
                  {byCol[col.key].length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-xs text-zinc-600 border border-dashed border-surface-3 rounded-lg min-h-[200px]">
                      Drop tasks here
                    </div>
                  )}
                </div>
                {/* Add button */}
                <button type="button" onClick={() => createTask(col.key)}
                  className="mx-2.5 mb-2.5 py-2 rounded-lg border border-dashed border-surface-4 hover:border-brand-indigo/40 hover:bg-brand-indigo/5 text-xs text-zinc-500 hover:text-white flex items-center justify-center gap-1.5 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add Card
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ═══ DASHBOARD VIEW ═══ */}
        {view === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Volume Ring */}
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Completion Rate</h3>
                <TrendingUp className="h-4 w-4 text-brand-indigo" />
              </div>
              <div className="flex items-center gap-5 flex-1">
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#27272a" strokeWidth="8" fill="none" />
                    <circle cx="50" cy="50" r="40" stroke="#6366f1" strokeWidth="8" fill="none"
                      strokeLinecap="round" strokeDasharray={2*Math.PI*40}
                      strokeDashoffset={2*Math.PI*40*(1-stats.rate/100)}
                      className="transition-all duration-700" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center font-bold text-white text-lg">{stats.rate}%</span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-zinc-400">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-brand-indigo" /> Completed: {stats.done}</div>
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Active: {stats.total - stats.done}</div>
                  <div className="mt-1 font-medium text-zinc-300">Total: {stats.total} tasks</div>
                </div>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Workflow Velocity</h3>
                <BarChart3 className="h-4 w-4 text-brand-purple" />
              </div>
              <div className="flex flex-col gap-2.5 flex-1 justify-center">
                {COLUMNS.map(col => (
                  <div key={col.key} className="flex items-center gap-3">
                    <span className="w-16 text-[10px] text-zinc-400 truncate">{col.label.split('/')[0].trim()}</span>
                    <div className="flex-1 h-2.5 bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: stats.total ? `${(stats.byStat[col.key]/stats.total)*100}%` : '0%', backgroundColor: col.color }} />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 w-6 text-right">{stats.byStat[col.key]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostics */}
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 flex flex-col">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-4">Diagnostics</h3>
              <div className="flex flex-col gap-2.5 flex-1">
                {stats.overdue.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span><b>{stats.overdue.length} overdue tasks.</b> Address these immediately.</span>
                  </div>
                )}
                {stats.byStat.execution > 3 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                    <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                    <span><b>{stats.byStat.execution} active tasks.</b> Focus on fewer items at once.</span>
                  </div>
                )}
                {stats.overdue.length === 0 && stats.byStat.execution <= 3 && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span><b>Workflow healthy.</b> No bottlenecks detected.</span>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => { setChatOpen(true); sendChat('Analyze my workflow bottlenecks'); }}
                className="mt-3 w-full py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-surface-3 text-xs text-zinc-300 font-medium flex items-center justify-center gap-1.5 transition-colors">
                Ask AI for advice <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Urgent Tasks */}
            <div className="bg-surface-1 border border-surface-3 rounded-xl p-5 lg:col-span-3">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-surface-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-rose" /> Critical Deadlines (48h)
                </h3>
                <span className="text-[10px] bg-red-500/10 text-red-400 font-bold px-2 py-0.5 rounded">{stats.urgent.length} items</span>
              </div>
              {stats.urgent.length === 0 ? (
                <p className="text-center py-8 text-xs text-zinc-500">No critical deadlines approaching.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {stats.urgent.map(t => (
                    <div key={t.id} onClick={() => setEditTask(t)}
                      className="p-3 rounded-lg bg-surface-2 border border-red-500/20 hover:border-red-500/40 cursor-pointer transition-colors">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[9px] font-bold uppercase" style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                        <span className="text-[10px] text-red-400 font-mono flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {t.dueDate}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-white">{t.title}</h4>
                      <p className="text-xs text-zinc-500 mt-1">{t.status.toUpperCase()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ═══ CHAT SIDEBAR ═══ */}
      {chatOpen && (
        <div className="fixed top-0 right-0 z-40 h-screen w-full sm:w-96 bg-surface-1 border-l border-surface-3 shadow-2xl flex flex-col animate-slide-right">
          <div className="p-3.5 border-b border-surface-3 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-sm text-white">AI Assistant</h3>
              <span className="text-[10px] text-zinc-500">Grounded in your task data</span>
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={clearChat} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Clear"><Trash2 className="h-4 w-4" /></button>
              <button type="button" onClick={() => setChatOpen(false)} className="p-1.5 text-zinc-500 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3">
            {chatMsgs.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-4">
                <MessageCircle className="h-10 w-10 text-brand-indigo/40" />
                <p className="text-xs text-zinc-400">Ask about deadlines, bottlenecks, or task breakdowns.</p>
                <div className="flex flex-col gap-2 w-full">
                  {['What is urgent this week?', 'Analyze my bottlenecks', 'Break down my tasks'].map(q => (
                    <button key={q} type="button" onClick={() => sendChat(q)}
                      className="p-2.5 text-left rounded-lg bg-surface-2 hover:bg-surface-3 border border-surface-3 text-xs text-zinc-300 transition-colors flex justify-between items-center">
                      {q} <ChevronRight className="h-3 w-3 text-zinc-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMsgs.map(m => (
              <div key={m.id} className={`flex gap-2.5 max-w-[85%] ${m.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  m.role === 'user' ? 'bg-brand-indigo/20 text-brand-indigo' : 'bg-surface-3 text-zinc-300'}`}>
                  {m.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className={`p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-brand-indigo text-white rounded-tr-none' : 'bg-surface-2 border border-surface-3 text-zinc-200 rounded-tl-none'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="flex gap-2.5 self-start">
                <div className="w-6 h-6 rounded-full bg-surface-3 text-zinc-300 flex items-center justify-center text-[10px]">AI</div>
                <div className="p-2.5 rounded-xl bg-surface-2 border border-surface-3 text-xs text-zinc-400 rounded-tl-none flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-zinc-600 border-t-brand-indigo rounded-full animate-spin" /> Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-surface-3 flex gap-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Ask something..."
              className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/50" />
            <button type="button" onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()}
              className="p-2 rounded-lg bg-brand-indigo hover:bg-brand-indigo/90 text-white disabled:opacity-40 transition-colors">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ TASK DETAIL EDITOR MODAL ═══ */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setEditTask(null)}>
          <div className="w-full max-w-2xl bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-surface-3 flex justify-between items-start">
              <div className="flex-1 mr-4">
                <input type="text" value={editTask.title}
                  onChange={e => saveTask({ ...editTask, title: e.target.value })}
                  className="w-full bg-transparent text-lg font-bold text-white border-b border-transparent hover:border-surface-4 focus:border-brand-indigo focus:outline-none pb-1 transition-colors"
                  placeholder="Task title" />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Created {new Date(editTask.createdAt).toLocaleDateString()} · ID: {editTask.id}
                </p>
              </div>
              <button type="button" onClick={() => setEditTask(null)} className="p-1.5 text-zinc-500 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Properties */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
                  <select value={editTask.status} onChange={e => saveTask({ ...editTask, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white focus:outline-none focus:border-brand-indigo/50 cursor-pointer">
                    <option value="backlog">Backlog / Ideas</option>
                    <option value="planning">In Planning</option>
                    <option value="execution">Active Execution</option>
                    <option value="review">Evaluation / Review</option>
                    <option value="archived">Archived / Completed</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Due Date</label>
                    <input type="date" value={editTask.dueDate} onChange={e => saveTask({ ...editTask, dueDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white focus:outline-none focus:border-brand-indigo/50 cursor-pointer" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Priority</label>
                    <select value={editTask.priority} onChange={e => saveTask({ ...editTask, priority: e.target.value as any })}
                      className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white focus:outline-none focus:border-brand-indigo/50 cursor-pointer">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Assignee</label>
                  <input type="text" value={editTask.assignee} onChange={e => saveTask({ ...editTask, assignee: e.target.value })}
                    placeholder="Name" className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-indigo/50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Description</label>
                  <textarea rows={4} value={editTask.description}
                    onChange={e => saveTask({ ...editTask, description: e.target.value })}
                    placeholder="Task details..."
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-brand-indigo/50 resize-none" />
                </div>
              </div>

              {/* Right: Subtasks */}
              <div className="flex flex-col gap-3 md:border-l md:border-surface-3 md:pl-6">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-zinc-400">Subtask Checklist</label>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {editTask.subtasks.filter(s => s.completed).length}/{editTask.subtasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {editTask.subtasks.length === 0 && (
                    <p className="text-center py-6 text-xs text-zinc-600">No subtasks yet.</p>
                  )}
                  {editTask.subtasks.map(s => (
                    <div key={s.id} className="flex items-center gap-2.5 group">
                      <button type="button" onClick={() => {
                        const updated = editTask.subtasks.map(x => x.id === s.id ? { ...x, completed: !x.completed } : x);
                        saveTask({ ...editTask, subtasks: updated });
                      }} className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                        s.completed ? 'bg-brand-indigo/20 border-brand-indigo/40 text-brand-indigo' : 'border-zinc-600 text-transparent hover:border-zinc-400'}`}>
                        <Check className="h-3 w-3" />
                      </button>
                      <input type="text" value={s.title} onChange={e => {
                        const updated = editTask.subtasks.map(x => x.id === s.id ? { ...x, title: e.target.value } : x);
                        saveTask({ ...editTask, subtasks: updated });
                      }} className={`flex-1 bg-transparent text-xs text-white border-b border-transparent focus:border-brand-indigo/30 focus:outline-none py-0.5 ${
                        s.completed ? 'line-through text-zinc-500' : ''}`} />
                      <button type="button" onClick={() => {
                        saveTask({ ...editTask, subtasks: editTask.subtasks.filter(x => x.id !== s.id) });
                      }} className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Add subtask */}
                <div className="flex gap-2 mt-1">
                  <input type="text" value={newSubTitle} onChange={e => setNewSubTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newSubTitle.trim()) {
                        saveTask({ ...editTask, subtasks: [...editTask.subtasks, { id: genId(), title: newSubTitle.trim(), completed: false }] });
                        setNewSubTitle('');
                      }
                    }}
                    placeholder="Add subtask..."
                    className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-surface-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-brand-indigo/50" />
                  <button type="button" onClick={() => {
                    if (!newSubTitle.trim()) return;
                    saveTask({ ...editTask, subtasks: [...editTask.subtasks, { id: genId(), title: newSubTitle.trim(), completed: false }] });
                    setNewSubTitle('');
                  }} className="p-2 rounded-lg bg-brand-indigo text-white hover:bg-brand-indigo/90 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-surface-3 flex justify-between items-center">
              <button type="button" onClick={() => { if (confirm('Delete this task?')) deleteTask(editTask.id); }}
                className="px-4 py-2 rounded-lg border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 text-xs font-medium flex items-center gap-1.5 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button type="button" onClick={() => setEditTask(null)}
                className="px-5 py-2 rounded-lg bg-brand-indigo text-white text-xs font-semibold hover:bg-brand-indigo/90 transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
