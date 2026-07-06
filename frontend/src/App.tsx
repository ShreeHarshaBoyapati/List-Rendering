import { useEffect, useState } from 'react';
import axios from 'axios';
import { List, type RowComponentProps } from 'react-window';
import './App.css';

type Item = {
  id: string;
  text: string;
  updatedAt: string;
};

type RowData = {
  items: Item[];
  updateItem: (id: string, text: string) => void;
  deleteItem: (id: string) => void;
};

const api = axios.create({
  baseURL: '/api',
});

const ITEM_HEIGHT = 80;

function Row({ index, style, items, updateItem, deleteItem }: RowComponentProps<RowData>) {
  const item = items[index];

  return (
    <div style={style} className="card-row">
      <div className="card">
        <span className="card-text">{item.text}</span>
        <div className="card-actions">
          <button
            className="edit-button"
            onClick={() => {
              const next = window.prompt('Update text:', item.text);
              if (next !== null && next.trim() !== '') {
                updateItem(item.id, next.trim());
              }
            }}
          >
            Edit
          </button>
          <button className="delete-button" onClick={() => deleteItem(item.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState('');

  async function fetchItems() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Item[]>('/items');
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;

    try {
      await api.post('/items', { text: newText.trim() });
      setNewText('');
      await fetchItems();
    } catch {
      setError('Failed to create item');
    }
  }

  async function updateItem(id: string, text: string) {
    try {
      await api.patch(`/items/${id}`, { text });
      await fetchItems();
    } catch {
      setError('Failed to update item');
    }
  }

  async function deleteItem(id: string) {
    try {
      await api.delete(`/items/${id}`);
      await fetchItems();
    } catch {
      setError('Failed to delete item');
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  const listHeight = Math.min(items.length * ITEM_HEIGHT, 480);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">Large List Rendering</h1>
        <p className="app-subtitle">Manage your items quickly and easily.</p>
      </header>

      <form className="add-form" onSubmit={createItem}>
        <input
          className="add-input"
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="What do you need to add?"
        />
        <button className="add-button" type="submit" disabled={!newText.trim()}>
          Add
        </button>
      </form>

      <div className="toolbar">
        <button className="refresh-button" onClick={fetchItems} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="total-count">Total items: {items.length}</span>
      </div>

      {error && <p className="error-message">{error}</p>}
      {loading && items.length === 0 && <p className="loading-message">Loading items…</p>}

      {items.length > 0 && (
        <List
          className="card-list"
          rowCount={items.length}
          rowHeight={ITEM_HEIGHT}
          rowComponent={Row}
          rowProps={{ items, updateItem, deleteItem }}
          style={{ height: listHeight, width: '100%' }}
        />
      )}
    </div>
  );
}

export default App;
