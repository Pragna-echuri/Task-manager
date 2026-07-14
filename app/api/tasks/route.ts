import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { dbTasks } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'antzai-personal-taskboard-super-secret-key-2026';

// Helper to authenticate request and get user ID
async function authenticateRequest(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch (err) {
    return null;
  }
}

// GET: Retrieve all tasks for the logged-in user
export async function GET(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tasks = dbTasks.listByUser(userId);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Failed to retrieve tasks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new task
export async function POST(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, description, status, dueDate, priority, assignee, subtasks } = body;

    if (!title) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
    }

    const newTask = dbTasks.create(userId, {
      title,
      description: description || '',
      status: status || 'backlog',
      dueDate: dueDate || '',
      priority: priority || 'medium',
      assignee: assignee || '',
      subtasks: subtasks || []
    });

    return NextResponse.json({ success: true, task: newTask });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update an existing task or move its lifecycle status
export async function PUT(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const body = await req.json();
    // Restrict what can be updated
    const { title, description, status, dueDate, priority, assignee, subtasks } = body;

    const updatedTask = dbTasks.update(userId, id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(dueDate !== undefined && { dueDate }),
      ...(priority !== undefined && { priority }),
      ...(assignee !== undefined && { assignee }),
      ...(subtasks !== undefined && { subtasks })
    });

    if (!updatedTask) {
      return NextResponse.json({ error: 'Task not found or not owned by user' }, { status: 404 });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Delete a task
export async function DELETE(req: NextRequest) {
  const userId = await authenticateRequest();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const deleted = dbTasks.delete(userId, id);
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found or not owned by user' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
