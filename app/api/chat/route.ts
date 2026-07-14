import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { dbTasks, dbChat } from '@/lib/db';
import type { Task } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'antzai-personal-taskboard-super-secret-key-2026';

// Authenticate request from JWT cookie
async function authenticateRequest(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch { return null; }
}

// GET: Retrieve chat history
export async function GET(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const history = dbChat.listByUser(userId);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Clear chat history
export async function DELETE(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    dbChat.clear(userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Build structured task context for the AI ───────────────────────────
function buildTaskContext(tasks: Task[]): string {
  if (tasks.length === 0) return 'The user has no tasks on their board yet. Encourage them to create their first task.';

  const now = new Date();
  const byStatus: Record<string, Task[]> = { backlog: [], planning: [], execution: [], review: [], archived: [] };
  tasks.forEach(t => byStatus[t.status]?.push(t));

  const overdue = tasks.filter(t => t.dueDate && t.status !== 'archived' && new Date(t.dueDate) < now);
  const dueSoon = tasks.filter(t => {
    if (!t.dueDate || t.status === 'archived') return false;
    const d = new Date(t.dueDate).getTime();
    return d >= now.getTime() && d <= now.getTime() + 48 * 3600000;
  });
  const high = tasks.filter(t => t.priority === 'high' && t.status !== 'archived');
  const total = tasks.length;
  const completed = byStatus.archived.length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  let ctx = `BOARD OVERVIEW: ${total} total tasks | ${total - completed} active | ${completed} completed (${rate}%)
Overdue: ${overdue.length} | Due within 48h: ${dueSoon.length} | High priority active: ${high.length}
Today's date: ${now.toISOString().split('T')[0]}

TASKS BY COLUMN:\n`;

  const labels: Record<string, string> = {
    backlog: 'BACKLOG', planning: 'PLANNING', execution: 'ACTIVE', review: 'REVIEW', archived: 'COMPLETED'
  };

  for (const [status, label] of Object.entries(labels)) {
    const items = byStatus[status] || [];
    ctx += `\n[${label}] (${items.length})\n`;
    items.forEach(t => {
      const flags: string[] = [];
      if (overdue.find(o => o.id === t.id)) flags.push('OVERDUE');
      if (dueSoon.find(d => d.id === t.id)) flags.push('DUE SOON');
      if (t.priority === 'high') flags.push('HIGH PRIORITY');
      const subDone = t.subtasks.filter(s => s.completed).length;
      const subTotal = t.subtasks.length;

      ctx += `  • "${t.title}" | Priority: ${t.priority} | Due: ${t.dueDate || 'none'}`;
      if (flags.length) ctx += ` | ⚠️ ${flags.join(', ')}`;
      if (subTotal > 0) ctx += ` | Subtasks: ${subDone}/${subTotal}`;
      ctx += '\n';
      if (t.description) ctx += `    Desc: ${t.description}\n`;
      if (subTotal > 0) {
        t.subtasks.forEach(s => ctx += `    ${s.completed ? '✅' : '⬜'} ${s.title}\n`);
      }
    });
  }

  return ctx;
}

// ─── System prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(taskContext: string): string {
  return `You are TaskFlow AI Assistant — a productivity coach embedded in the user's personal Kanban task board.

You have LIVE ACCESS to the user's actual task data below. Use it to give specific, data-driven answers.

${taskContext}

INSTRUCTIONS:
- Reference actual task names, due dates, and statuses from the data above.
- If asked "what should I work on?", prioritize: overdue → high priority → due soonest.
- If asked about bottlenecks, analyze task distribution across columns.
- When suggesting subtasks, provide 4-6 actionable bullet points.
- If asked about a specific task, find it in the data and give precise details.
- Use markdown for formatting (bold, bullets, etc).
- Be concise, specific, and actionable. Avoid generic advice.
- Never expose internal IDs or technical details.
- If the board is empty, encourage them to create tasks and explain the workflow.`;
}

// ─── OpenAI-compatible API call (works for Groq, OpenAI, OpenRouter) ────
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversationHistory
  ];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('Empty response from API');
  return reply;
}

// ─── Gemini API call ────────────────────────────────────────────────────
async function callGemini(
  apiKey: string,
  systemPrompt: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const contents: { role: string; parts: { text: string }[] }[] = [];

  // System instructions as first exchange
  contents.push(
    { role: 'user', parts: [{ text: `[System]\n${systemPrompt}\n[End System]\n\nRespond to the user's messages.` }] },
    { role: 'model', parts: [{ text: 'Understood. I have your taskboard data. How can I help?' }] }
  );

  // Conversation history
  for (const m of conversationHistory) {
    contents.push({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Empty Gemini response');
  return reply;
}

// ─── POST: Send message and get AI response ─────────────────────────────
export async function POST(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 });

    // Save user message
    dbChat.addMessage(userId, 'user', message);

    // Load task data and build context
    const tasks = dbTasks.listByUser(userId);
    const taskContext = buildTaskContext(tasks);
    const systemPrompt = buildSystemPrompt(taskContext);

    // Load recent conversation history
    const history = dbChat.listByUser(userId).slice(-20);
    const convoHistory = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // Try providers in priority order: Groq → Gemini → OpenAI → Local fallback
    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    let reply = '';
    let provider = '';

    // 1. Try Groq (fastest, most generous free tier)
    if (groqKey && !reply) {
      try {
        reply = await callOpenAICompatible(
          'https://api.groq.com/openai/v1',
          groqKey,
          'llama-3.3-70b-versatile',
          systemPrompt,
          convoHistory
        );
        provider = 'groq';
      } catch (err: any) {
        console.error('Groq failed:', err.message);
      }
    }

    // 2. Try Gemini
    if (geminiKey && !reply) {
      try {
        reply = await callGemini(geminiKey, systemPrompt, convoHistory);
        provider = 'gemini';
      } catch (err: any) {
        console.error('Gemini failed:', err.message);
      }
    }

    // 3. Try OpenAI
    if (openaiKey && !reply) {
      try {
        reply = await callOpenAICompatible(
          'https://api.openai.com/v1',
          openaiKey,
          'gpt-4o-mini',
          systemPrompt,
          convoHistory
        );
        provider = 'openai';
      } catch (err: any) {
        console.error('OpenAI failed:', err.message);
      }
    }

    // 4. Local fallback
    if (!reply) {
      reply = getLocalFallbackReply(message, tasks);
      provider = 'local';
    }

    console.log(`Chat response via: ${provider}`);

    // Save assistant reply
    dbChat.addMessage(userId, 'assistant', reply);
    return NextResponse.json({ reply, provider });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Local fallback (no API needed) ─────────────────────────────────────
function getLocalFallbackReply(msg: string, tasks: Task[]): string {
  const q = msg.toLowerCase();
  const now = new Date();
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'archived').length;
  const active = total - completed;
  const overdue = tasks.filter(t => t.dueDate && t.status !== 'archived' && new Date(t.dueDate) < now);
  const high = tasks.filter(t => t.priority === 'high' && t.status !== 'archived');
  const execution = tasks.filter(t => t.status === 'execution');
  const review = tasks.filter(t => t.status === 'review');

  if (q.includes('urgent') || q.includes('overdue') || q.includes('deadline') || q.includes('due')) {
    let r = '';
    if (overdue.length > 0) {
      r += `⚠️ **${overdue.length} Overdue:**\n`;
      overdue.forEach(t => r += `- **${t.title}** — Due: ${t.dueDate}, Priority: ${t.priority}\n`);
    }
    if (high.length > 0) {
      r += `\n🔥 **${high.length} High Priority:**\n`;
      high.forEach(t => r += `- **${t.title}** — ${t.status}, Due: ${t.dueDate || 'No date'}\n`);
    }
    return r || '✅ No overdue or urgent tasks. You\'re on track!';
  }

  if (q.includes('bottleneck') || q.includes('analyz') || q.includes('productivity') || q.includes('tip')) {
    let r = '📊 **Workflow Analysis:**\n\n';
    if (execution.length > 3) r += `- ⚠️ **${execution.length} in Active** — Focus on fewer tasks.\n`;
    if (review.length > 2) r += `- ⚠️ **${review.length} in Review** — Finish reviewing these first.\n`;
    if (overdue.length > 0) r += `- 🔴 **${overdue.length} overdue** — Address these first.\n`;
    if (execution.length <= 3 && review.length <= 2 && overdue.length === 0) r += '- ✅ Workflow looks healthy!\n';
    r += `\n**Stats:** ${total} total | ${completed} done (${total > 0 ? Math.round((completed/total)*100) : 0}%) | ${active} active`;
    return r;
  }

  if (q.includes('what should') || q.includes('work on') || q.includes('focus') || q.includes('next')) {
    const items = [...overdue, ...high.filter(t => !overdue.includes(t))];
    if (items.length === 0 && active === 0) return 'Your board is clear! Create a new task to get started.';
    if (items.length === 0) return `No urgent items. You have ${active} active task${active > 1 ? 's' : ''} — pick one and make progress!`;
    let r = '🎯 **Priority order:**\n';
    items.slice(0, 5).forEach((t, i) => {
      r += `${i + 1}. **${t.title}** [${overdue.includes(t) ? '🔴 OVERDUE' : '🟡 HIGH'}] — Due: ${t.dueDate || 'none'}\n`;
    });
    return r;
  }

  if (q.includes('break') || q.includes('subtask') || q.includes('steps') || q.includes('plan')) {
    const match = tasks.find(t => q.includes(t.title.toLowerCase()));
    const name = match ? `"${match.title}"` : 'your task';
    return `📋 **Subtasks for ${name}:**\n\n- [ ] Define scope and requirements\n- [ ] Research and gather resources\n- [ ] Build initial version\n- [ ] Implement details\n- [ ] Test and review\n- [ ] Final polish and archive`;
  }

  if (q.includes('status') || q.includes('summary') || q.includes('overview') || q.includes('board')) {
    return `📊 **Board Summary:**\n- Total: ${total} | Done: ${completed} (${total > 0 ? Math.round((completed/total)*100) : 0}%) | Active: ${active}\n- Overdue: ${overdue.length} | High Priority: ${high.length}\n- In Execution: ${execution.length} | In Review: ${review.length}`;
  }

  return `👋 I'm your TaskFlow assistant! You have **${total} tasks** (${active} active).\n\nTry asking:\n- "What should I work on?"\n- "Any overdue tasks?"\n- "Analyze my bottlenecks"\n- "Break down my tasks"`;
}
