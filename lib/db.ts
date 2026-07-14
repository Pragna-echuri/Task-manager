import fs from 'fs';
import path from 'path';

// Define DB paths
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Interface definitions
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: 'backlog' | 'planning' | 'execution' | 'review' | 'archived';
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface DatabaseSchema {
  users: User[];
  tasks: Task[];
  chatHistory: ChatMessage[];
}

const initialDb: DatabaseSchema = {
  users: [],
  tasks: [],
  chatHistory: []
};

// Initialize database file if it doesn't exist
function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
  }
}

// Atomic helper to read database
export function readDb(): DatabaseSchema {
  initDb();
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database, resetting...', error);
    return initialDb;
  }
}

// Atomic helper to write database
export function writeDb(data: DatabaseSchema) {
  initDb();
  const tempFile = `${DB_FILE}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    console.error('Failed atomic write to database:', error);
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch {}
    }
    throw error;
  }
}

// User Actions
export const dbUsers = {
  create: (user: Omit<User, 'id' | 'createdAt'>): User => {
    const db = readDb();
    const newUser: User = {
      ...user,
      id: Math.random().toString(36).substring(2, 11),
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    writeDb(db);
    return newUser;
  },
  findByEmail: (email: string): User | undefined => {
    const db = readDb();
    return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findById: (id: string): User | undefined => {
    const db = readDb();
    return db.users.find(u => u.id === id);
  }
};

// Task Actions
export const dbTasks = {
  listByUser: (userId: string): Task[] => {
    const db = readDb();
    return db.tasks.filter(t => t.userId === userId);
  },
  create: (userId: string, task: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Task => {
    const db = readDb();
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substring(2, 11),
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.tasks.push(newTask);
    writeDb(db);
    return newTask;
  },
  update: (userId: string, taskId: string, updates: Partial<Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Task | undefined => {
    const db = readDb();
    const index = db.tasks.findIndex(t => t.id === taskId && t.userId === userId);
    if (index === -1) return undefined;
    
    const updatedTask: Task = {
      ...db.tasks[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    db.tasks[index] = updatedTask;
    writeDb(db);
    return updatedTask;
  },
  delete: (userId: string, taskId: string): boolean => {
    const db = readDb();
    const initialLength = db.tasks.length;
    db.tasks = db.tasks.filter(t => !(t.id === taskId && t.userId === userId));
    if (db.tasks.length === initialLength) return false;
    writeDb(db);
    return true;
  }
};

// Chat History Actions
export const dbChat = {
  listByUser: (userId: string): ChatMessage[] => {
    const db = readDb();
    return db.chatHistory.filter(c => c.userId === userId);
  },
  addMessage: (userId: string, role: 'user' | 'assistant', content: string): ChatMessage => {
    const db = readDb();
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(2, 11),
      userId,
      role,
      content,
      createdAt: new Date().toISOString()
    };
    db.chatHistory.push(newMessage);
    writeDb(db);
    return newMessage;
  },
  clear: (userId: string) => {
    const db = readDb();
    db.chatHistory = db.chatHistory.filter(c => c.userId !== userId);
    writeDb(db);
  }
};
