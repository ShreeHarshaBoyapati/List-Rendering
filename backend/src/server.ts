import 'reflect-metadata';
import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './config/data-source.js';
import { Item } from './entities/Item.js';
import { ItemService } from './services/ItemService.js';

// ES Module compatibility - create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

type Cursor = {
  createdAt: string;
  id: string;
};

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

function toIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt},${cursor.id}`).toString('base64url');
}

function decodeCursor(value: string): Cursor | null {
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf-8');
    const [createdAt, id] = decoded.split(',');
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

app.get('/api/items', async (req: Request, res: Response) => {
  const itemService = await ItemService.getInstance();

  const rawLimit = Number(req.query.limit);
  const limit = Math.min(
    Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_PAGE_LIMIT,
    MAX_PAGE_LIMIT
  );

  const rawCursor = req.query.cursor;
  const cursor = typeof rawCursor === 'string' ? decodeCursor(rawCursor) : null;

  if (rawCursor !== undefined && cursor === null) {
    res.status(400).json({ error: 'invalid cursor' });
    return;
  }

  const direction = req.query.direction === 'prev' ? 'prev' : 'next';

  let data: Item[] = [];
  let hasNext = false;
  let hasPrev = false;

  if (direction === 'prev') {
    if (!cursor) {
      res.status(400).json({ error: 'cursor is required for prev direction' });
      return;
    }
    const prevResult = await itemService.findPrevPage(limit, cursor);
    data = prevResult.data;
    hasPrev = prevResult.hasPrev;
    // If we fetched a previous page, rows below the returned window still exist.
    hasNext = data.length > 0;
  } else {
    const nextResult = await itemService.findNextPage(limit, cursor);
    data = nextResult.data;
    hasNext = nextResult.hasNext;
    // If a cursor was supplied, rows above the returned window must exist.
    hasPrev = cursor !== null && data.length > 0;
  }

  const nextCursor =
    data.length > 0 && hasNext
      ? encodeCursor({
          createdAt: toIsoTimestamp(data[data.length - 1].createdAt),
          id: data[data.length - 1].id,
        })
      : null;

  const prevCursor =
    data.length > 0 && hasPrev
      ? encodeCursor({
          createdAt: toIsoTimestamp(data[0].createdAt),
          id: data[0].id,
        })
      : null;

  res.json({
    data,
    pagination: {
      nextCursor,
      prevCursor,
      hasNext,
      hasPrev,
    },
  });
});

// Create a new item at the top of the list
app.post('/api/items', async (req: Request, res: Response) => {
  const itemService = await ItemService.getInstance();

  const { text } = req.body as { text?: string };
  if (typeof text !== 'string' || text.trim() === '') {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }

  const newItem = await itemService.create(text);
  res.status(201).json(newItem);
});

// Update an existing item
app.patch('/api/items/:id', async (req: Request, res: Response) => {
  const itemService = await ItemService.getInstance();

  const id = req.params.id as string;
  const { text } = req.body as { text?: string };

  const existing = await itemService.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'item not found' });
    return;
  }

  if (typeof text !== 'string' || text.trim() === '') {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }

  const updated = await itemService.update(id, text);
  res.json(updated);
});

// Delete an item
app.delete('/api/items/:id', async (req: Request, res: Response) => {
  const itemService = await ItemService.getInstance();

  const id = req.params.id as string;
  const existing = await itemService.findById(id);

  if (!existing) {
    res.status(404).json({ error: 'item not found' });
    return;
  }

  const deleted = await itemService.delete(id);
  res.json(deleted);
});

// Serve static files in production
if (process.env.NODE_ENV === 'prod') {
  // Serve frontend build
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));

  app.get('{*path}', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Start server
async function startServer(): Promise<void> {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
