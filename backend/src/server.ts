import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatibility - create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

type Item = {
  id: string;
  text: string;
  updatedAt: string;
};

const TOTAL_ITEMS = 100;

function generateItems(): Item[] {
  return Array.from({ length: TOTAL_ITEMS }, (_, i) => {
    const id = `item-${i + 1}`;
    return {
      id,
      text: `Item ${i + 1}`,
      updatedAt: new Date().toISOString(),
    };
  });
}

const items = generateItems();

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

// Get all items - no pagination, no limit, large list
app.get('/api/items', (_req: Request, res: Response) => {
  res.json(items);
});

// Create a new item at the top of the list
app.post('/api/items', (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  if (typeof text !== 'string' || text.trim() === '') {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }

  const newItem: Item = {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.trim(),
    updatedAt: new Date().toISOString(),
  };

  items.unshift(newItem);
  res.status(201).json(newItem);
});

// Update an existing item
app.patch('/api/items/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = req.body as { text?: string };

  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'item not found' });
    return;
  }

  if (typeof text !== 'string' || text.trim() === '') {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }

  items[index] = {
    ...items[index],
    text: text.trim(),
    updatedAt: new Date().toISOString(),
  };

  res.json(items[index]);
});

// Delete an item
app.delete('/api/items/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    res.status(404).json({ error: 'item not found' });
    return;
  }

  const deleted = items.splice(index, 1)[0];
  res.json(deleted);
});

// 🆕 Serve static files in production
if (process.env.NODE_ENV === 'prod') {
  // Serve frontend build
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));

  // Handle React routing (SPA fallback)
  // Express 5 requires named wildcard: use '{*path}' instead of '*'
  app.get('{*path}', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
