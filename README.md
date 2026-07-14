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
