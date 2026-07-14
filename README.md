# TaskFlow — Personal Taskboard Application

A production-ready, fully interactive Personal Taskboard with secure authentication, drag-and-drop Kanban board, analytics dashboard, and an AI-powered chatbot assistant.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack & Why](#tech-stack--why)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Database Design](#database-design)
- [Authentication Flow](#authentication-flow)
- [AI Chatbot](#ai-chatbot)
- [Frontend Components](#frontend-components)

---

## Overview

TaskFlow is a single-user (or multi-user) personal task management application built as a full-stack Next.js app. It provides:

- A **5-column Kanban board** with drag-and-drop task management
- **Secure JWT-based authentication** with bcrypt password hashing
- An **analytics dashboard** with completion rates, velocity charts, and deadline tracking
- A **context-aware AI chatbot** that reads your actual task data to give personalized productivity advice

The entire application runs as a single Next.js project — no separate backend server needed.

---

## Features

### Authentication & Security
- **Signup/Login/Logout** with email and password
- **bcrypt** password hashing (10 salt rounds) — passwords are never stored in plain text
- **JWT tokens** stored in HttpOnly, SameSite cookies — prevents XSS and CSRF attacks
- **7-day session persistence** — users stay logged in across browser restarts
- **Data isolation** — every query filters by authenticated userId

### Kanban Board
- **5 custom workflow columns**: Backlog → Planning → Active Execution → Review → Archived
- **HTML5 drag-and-drop** — drag cards between columns to change status
- **Visual drop indicators** — columns highlight when dragging over them
- **Priority badges** — color-coded (red = high, amber = medium, green = low)
- **Due date warnings** — overdue tasks pulse red, tasks due within 48h show amber
- **Subtask progress bars** — visual completion indicator on each card
- **Instant task creation** — "Add Card" button on each column

### Task Detail Editor
- Click any card to open a **full detail modal**
- Inline-editable title, description, status, priority, due date, assignee
- **Subtask checklist** — add, toggle, edit, and delete subtasks
- **Debounced auto-save** — changes save 400ms after you stop typing (no save button needed)
- Delete with confirmation

### Analytics Dashboard
- **Completion rate ring** — SVG donut chart showing percentage done
- **Workflow velocity bars** — horizontal bars showing tasks per column
- **Diagnostics panel** — auto-detects bottlenecks (too many active tasks, overdue items)
- **Critical deadlines** — lists all tasks due within 48 hours

### AI Chatbot Assistant
- **Context-grounded** — the AI receives your full task data (names, statuses, due dates, subtasks)
- **Multi-provider support**: Groq (primary) → Gemini → OpenAI → Local fallback
- **Persistent chat history** — conversations are saved per user
- **Quick-action suggestions** — predefined prompts for common questions
- **Works offline** — local fallback analyzer provides useful responses without any API key

---

## Tech Stack & Why

### Core Framework: Next.js 16 (App Router)

**Why Next.js?**
- **Full-stack in one project** — API routes and frontend live together, no need for a separate Express/Fastify backend
- **App Router** — modern React Server Components architecture with file-based routing
- **API Routes** — `app/api/*/route.ts` files become REST endpoints automatically, no routing setup needed
- **Built-in optimizations** — automatic code splitting, image optimization, font loading
- **Turbopack** — blazing fast development server with instant hot reload
- **Single deployment** — deploy one project instead of separate frontend + backend

**Why not Express + React separately?**
- Adds deployment complexity (two servers, CORS config, separate hosting)
- Next.js API routes give us everything Express would, with zero extra config

---

### Language: TypeScript

**Why TypeScript?**
- **Type safety** — catches bugs at compile time (e.g., wrong task status values, missing fields)
- **IntelliSense** — auto-complete for all interfaces (Task, User, ChatMessage)
- **Refactoring confidence** — changing a field name in the Task interface highlights every place that needs updating
- **Self-documenting** — the interfaces in `lib/db.ts` serve as living documentation of the data schema

**Why not JavaScript?**
- No compile-time error detection — bugs appear only at runtime
- No auto-complete or type checking for API response shapes

---

### Styling: Tailwind CSS v4

**Why Tailwind CSS?**
- **Utility-first** — styles are co-located with components, no switching between CSS and TSX files
- **Design tokens via `@theme`** — all colors (`brand-indigo`, `surface-0`), animations, and spacing are defined in one place (`globals.css`)
- **Dark mode by default** — `color-scheme: dark` with custom surface colors for a premium feel
- **Zero unused CSS** — Tailwind only ships the utilities you actually use
- **Rapid prototyping** — building complex layouts takes minutes, not hours

**Why not plain CSS or CSS Modules?**
- Plain CSS leads to naming conflicts and large stylesheets
- CSS Modules solve naming but add file overhead (one `.module.css` per component)
- Tailwind gives us both scoping and speed in a single approach

---

### Authentication: JWT + bcryptjs

**Why JWT (JSON Web Tokens)?**
- **Stateless** — no server-side session store needed (no Redis, no database session table)
- **Self-contained** — the token carries the userId payload, so authentication is a single `jwt.verify()` call
- **Cookie-based** — stored as HttpOnly cookie, not in localStorage (prevents XSS theft)
- **Expiration built-in** — tokens auto-expire after 7 days

**Why bcryptjs?**
- **Industry standard** for password hashing — used by every major web framework
- **Salt rounds** — each password gets a unique salt, so identical passwords produce different hashes
- **Deliberately slow** — makes brute-force attacks computationally expensive
- **Pure JavaScript** — no native C++ dependencies, works everywhere without build issues

**Why not OAuth (Google/GitHub login)?**
- Adds external dependencies and API registrations
- For a personal taskboard, email/password is simpler and self-contained
- OAuth can be added later as an enhancement

---

### Database: JSON File (lib/db.ts)

**Why a JSON file instead of PostgreSQL/MongoDB?**
- **Zero setup** — no database server to install, configure, or connect to
- **Portable** — the entire database is one `data/db.json` file you can copy, backup, or inspect
- **Perfect for personal use** — a single-user taskboard doesn't need horizontal scaling
- **No ORM needed** — direct read/write with `fs.readFileSync` and `fs.writeFileSync`
- **Atomic writes** — we write to a `.tmp` file first, then rename (prevents corruption on crash)

**Why not SQLite?**
- SQLite would be the next logical step for multi-user or larger datasets
- For a personal app with <1000 tasks, JSON file is simpler and has zero dependencies

**Why not PostgreSQL/MongoDB?**
- Requires a running database server
- Adds connection pooling, migration management, and ORM complexity
- Overkill for a personal task management app

---

### AI Provider: Groq (Primary)

**Why Groq?**
- **Free tier** — 30 requests/minute, 14,400 requests/day (practically unlimited for personal use)
- **No credit card required** — sign up with Google/GitHub and get instant access
- **Fastest inference** — Groq's LPU (Language Processing Unit) returns responses in <1 second
- **High quality models** — Llama 3.3 70B is comparable to GPT-4o-mini in quality
- **OpenAI-compatible API** — uses the same request/response format, easy to integrate

**Why not OpenAI?**
- No free tier — requires credit card and charges per token
- Slower response times compared to Groq

**Why not Gemini (as primary)?**
- Aggressive rate limits on free tier (15 req/min, and quota resets are unreliable)
- We still support Gemini as a fallback

**Provider priority**: Groq → Gemini → OpenAI → Local fallback

---

### Icons: Lucide React

**Why Lucide?**
- **Tree-shakeable** — only the icons you import are bundled (not the full 1000+ icon set)
- **Consistent design** — clean, modern line icons that look professional
- **React-native** — each icon is a proper React component with props for size, color, className
- **MIT licensed** — free for commercial use

**Why not Font Awesome or Material Icons?**
- Font Awesome loads the entire icon font (large bundle size)
- Material Icons have a different aesthetic that doesn't match our design
- Lucide is the modern successor to Feather Icons, optimized for React

---

## Project Structure

```
c:\VSCode\Antzai\
├── app/                          # Next.js App Router
│   ├── api/                      # REST API endpoints
│   │   ├── auth/route.ts         # POST signup/login, GET session, DELETE logout
│   │   ├── tasks/route.ts        # CRUD: GET list, POST create, PUT update, DELETE remove
│   │   └── chat/route.ts         # AI chatbot: POST message, GET history, DELETE clear
│   ├── globals.css               # Design system: theme tokens, animations, scrollbars
│   ├── layout.tsx                # Root HTML layout, fonts, SEO metadata
│   └── page.tsx                  # Entire frontend UI (landing, board, dashboard, chat)
├── lib/
│   └── db.ts                     # JSON file database with atomic writes
├── data/
│   └── db.json                   # Auto-generated data file (created at runtime)
├── .env.local                    # API keys (GROQ_API_KEY, etc.) — gitignored
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── next.config.ts                # Next.js configuration
```

**Total custom code: ~1,800 lines across 7 files.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Landing   │  │ Kanban   │  │Analytics │  │ Chat Sidebar │   │
│  │ Page      │  │ Board    │  │Dashboard │  │              │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                         │                                       │
│                    fetch() calls                                │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS SERVER (API Routes)                  │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ /api/auth    │  │ /api/tasks   │  │ /api/chat            │  │
│  │              │  │              │  │                      │  │
│  │ JWT sign/    │  │ CRUD with    │  │ Groq/Gemini/OpenAI   │  │
│  │ verify +     │  │ userId       │  │ + task context       │  │
│  │ bcrypt hash  │  │ filtering    │  │ grounding            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────────┘  │
│         │                 │                  │                  │
│         └─────────────────┼──────────────────┘                  │
│                           ▼                                     │
│                    ┌──────────────┐                              │
│                    │  lib/db.ts   │                              │
│                    │ Atomic JSON  │                              │
│                    │ Read/Write   │                              │
│                    └──────┬───────┘                              │
│                           ▼                                     │
│                    ┌──────────────┐                              │
│                    │ data/db.json │                              │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setup & Installation

### Prerequisites
- **Node.js** 18+ installed
- **npm** (comes with Node.js)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Create environment file (optional — app works without it)
# Add your Groq API key for AI chatbot
echo GROQ_API_KEY=gsk_your_key_here > .env.local

# 3. Start development server
npm run dev

# 4. Open in browser
# http://localhost:3000
```

### Production Build

```bash
npm run build    # Create optimized production build
npm start        # Start production server
```

---

## Environment Variables

Create a `.env.local` file in the project root:

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Recommended | Groq API key for AI chatbot (free at [console.groq.com](https://console.groq.com)) |
| `GEMINI_API_KEY` | Optional | Google Gemini API key (fallback if Groq fails) |
| `OPENAI_API_KEY` | Optional | OpenAI API key (fallback if both Groq and Gemini fail) |
| `JWT_SECRET` | Optional | Custom JWT signing secret (defaults to built-in secret) |

**Note:** The AI chatbot works without any API key — it falls back to a built-in local analyzer that reads your task data directly.

---

## API Endpoints

### Authentication — `/api/auth`

| Method | Purpose | Body | Response |
|---|---|---|---|
| `GET` | Check session | — | `{ user: { id, email, name } }` or 401 |
| `POST` | Signup or Login | `{ action, email, password, name? }` | `{ user: { id, email, name } }` |
| `DELETE` | Logout | — | `{ success: true }` |

### Tasks — `/api/tasks`

| Method | Purpose | Body / Params | Response |
|---|---|---|---|
| `GET` | List user's tasks | — | `{ tasks: Task[] }` |
| `POST` | Create task | `{ title, description, status, ... }` | `{ task: Task }` |
| `PUT` | Update task | `?id=xxx` + body fields | `{ task: Task }` |
| `DELETE` | Delete task | `?id=xxx` | `{ success: true }` |

### Chat — `/api/chat`

| Method | Purpose | Body | Response |
|---|---|---|---|
| `GET` | Get chat history | — | `{ history: ChatMessage[] }` |
| `POST` | Send message | `{ message: string }` | `{ reply: string, provider: string }` |
| `DELETE` | Clear history | — | `{ success: true }` |

---

## Database Design

Three collections stored in `data/db.json`:

### Users
```typescript
{
  id: string,          // Random alphanumeric ID
  email: string,       // Lowercase, unique
  passwordHash: string, // bcrypt hash (never plain text)
  name: string,        // Display name
  createdAt: string    // ISO timestamp
}
```

### Tasks
```typescript
{
  id: string,
  userId: string,       // Owner — enforces data isolation
  title: string,
  description: string,
  status: 'backlog' | 'planning' | 'execution' | 'review' | 'archived',
  dueDate: string,      // YYYY-MM-DD format
  priority: 'low' | 'medium' | 'high',
  assignee: string,
  subtasks: [{ id, title, completed }],
  createdAt: string,
  updatedAt: string
}
```

### Chat History
```typescript
{
  id: string,
  userId: string,       // Per-user isolation
  role: 'user' | 'assistant',
  content: string,
  createdAt: string
}
```

---

## Authentication Flow

```
1. User fills signup form → POST /api/auth { action: "signup", email, password, name }
2. Server hashes password with bcrypt (10 rounds)
3. Server creates user record in db.json
4. Server signs JWT with userId → sets HttpOnly cookie (7-day expiry)
5. Client receives { user } → renders Kanban board

On page reload:
1. Client calls GET /api/auth
2. Server reads JWT from cookie → verifies → returns user profile
3. Client loads tasks and chat history

On logout:
1. Client calls DELETE /api/auth
2. Server sets cookie maxAge=0 (instant expiry)
3. Client clears local state → shows landing page
```

---

## AI Chatbot

### How it works

1. User sends a message via the chat sidebar
2. Server saves the message to chat history
3. Server loads ALL of the user's tasks from the database
4. Server builds a structured context string with:
   - Board summary (total, active, completed, overdue counts)
   - Every task organized by column (with names, priorities, due dates, subtask progress)
   - Overdue task warnings
5. Server sends the context + conversation history to the AI provider
6. AI responds with task-specific, data-driven advice
7. Server saves the AI response to chat history

### Provider Priority

```
GROQ_API_KEY set?  → Use Groq (Llama 3.3 70B, <1s response)
       ↓ fail
GEMINI_API_KEY set? → Use Gemini (Gemini 2.0 Flash)
       ↓ fail
OPENAI_API_KEY set? → Use OpenAI (GPT-4o-mini)
       ↓ fail
No keys configured  → Use Local Fallback Analyzer
```

### Local Fallback

Even without any API key, the chatbot understands these queries:
- **"What should I work on?"** → Prioritizes overdue → high priority → due soonest
- **"Any overdue tasks?"** → Lists all overdue and high priority tasks
- **"Analyze bottlenecks"** → Checks task distribution across columns
- **"Break down my tasks"** → Generates subtask templates
- **"Board summary"** → Shows completion rate and column counts

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with Turbopack (http://localhost:3000) |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint checks |

---

## License

MIT
