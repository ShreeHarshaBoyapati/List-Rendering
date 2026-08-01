import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { List, type RowComponentProps } from 'react-window';
import './App.css';

type Item = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

type Pagination = {
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
};

type PaginatedResponse = {
  data: Item[];
  pagination: Pagination;
};

type RowData = {
  items: Item[];
  loadingNext: boolean;
  loadingPrev: boolean;
  updateItem: (id: string, text: string) => void;
  deleteItem: (id: string) => void;
};

const api = axios.create({
  baseURL: '/api',
});

const ITEM_HEIGHT = 80;
const PAGE_LIMIT = 50;
const MAX_PAGES = 3;

function Row({
  index,
  style,
  items,
  loadingNext,
  loadingPrev,
  updateItem,
  deleteItem,
}: RowComponentProps<RowData>) {
  if (loadingPrev && index === 0) {
    return (
      <div style={style} className="card-row loading-more-row">
        <div className="card loading-more-card">Loading previous…</div>
      </div>
    );
  }

  const shiftedIndex = loadingPrev ? index - 1 : index;
  const item = items[shiftedIndex];

  if (loadingNext && shiftedIndex === items.length) {
    return (
      <div style={style} className="card-row loading-more-row">
        <div className="card loading-more-card">Loading more…</div>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div style={style} className="card-row" data-id={item.id}>
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
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState('');

  const [hasNext, setHasNext] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);

  const pageBoundariesRef = useRef<
    { start: number; end: number; prevCursor: string | null; nextCursor: string | null }[]
  >([]);

  const loadNextRef = useRef(() => {});
  const loadPrevRef = useRef(() => {});

  const pendingScrollRestoreRef = useRef<{
    oldScrollTop: number;
    prependedCount: number;
  } | null>(null);

  async function fetchPage(cursor: string | null, direction: 'next' | 'prev') {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_LIMIT));
    if (cursor) {
      params.set('cursor', cursor);
      params.set('direction', direction);
    }

    const { data } = await api.get<PaginatedResponse>(`/items?${params.toString()}`);
    return data;
  }

  const loadInitial = useCallback(async () => {
    setLoadingInitial(true);
    setError(null);

    try {
      const { data, pagination } = await fetchPage(null, 'next');
      setItems(data);
      setHasNext(pagination.hasNext);
      setNextCursor(pagination.nextCursor);
      setHasPrev(pagination.hasPrev);
      setPrevCursor(pagination.prevCursor);

      pageBoundariesRef.current = [
        {
          start: 0,
          end: data.length - 1,
          prevCursor: pagination.prevCursor,
          nextCursor: pagination.nextCursor,
        },
      ];

      const wrapperEl = document.querySelector('.card-list');
      if (wrapperEl) {
        wrapperEl.scrollTop = 0;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setItems([]);
      setHasNext(false);
      setNextCursor(null);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  async function loadNext() {
    if (!hasNext || !nextCursor || loadingNext || loadingInitial) return;

    setLoadingNext(true);
    setError(null);

    try {
      const { data, pagination } = await fetchPage(nextCursor, 'next');
      if (data.length === 0) {
        setHasNext(false);
        setNextCursor(null);
        return;
      }

      const prevLength = items.length;
      setItems((prev) => [...prev, ...data]);

      const newBoundary = {
        start: prevLength,
        end: prevLength + data.length - 1,
        prevCursor: pagination.prevCursor,
        nextCursor: pagination.nextCursor,
      };
      pageBoundariesRef.current = [...pageBoundariesRef.current, newBoundary];

      // Evict the oldest (top) page when the window exceeds MAX_PAGES.
      if (pageBoundariesRef.current.length > MAX_PAGES) {
        const dropped = pageBoundariesRef.current.shift()!;
        const droppedCount = dropped.end - dropped.start + 1;

        const wrapperEl = document.querySelector('.card-list');
        if (wrapperEl) {
          wrapperEl.scrollTop -= droppedCount * ITEM_HEIGHT;
        }

        setItems((prev) => prev.slice(droppedCount));

        pageBoundariesRef.current = pageBoundariesRef.current.map((boundary) => ({
          ...boundary,
          start: boundary.start - droppedCount,
          end: boundary.end - droppedCount,
        }));
      }

      setHasNext(pagination.hasNext);
      setNextCursor(pagination.nextCursor);

      const firstBoundary = pageBoundariesRef.current[0];
      if (firstBoundary) {
        setPrevCursor(firstBoundary.prevCursor);
        setHasPrev(firstBoundary.prevCursor !== null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingNext(false);
    }
  }

  async function loadPrev() {
    if (!hasPrev || !prevCursor || loadingPrev || loadingInitial) return;

    const wrapperEl = document.querySelector('.card-list');

    if (wrapperEl) {
      pendingScrollRestoreRef.current = {
        oldScrollTop: wrapperEl.scrollTop,
        prependedCount: 0,
      };
    }

    setLoadingPrev(true);
    setError(null);

    try {
      const { data, pagination } = await fetchPage(prevCursor, 'prev');
      if (data.length === 0) {
        setHasPrev(false);
        setPrevCursor(null);
        pendingScrollRestoreRef.current = null;
        return;
      }

      const prependedCount = data.length;
      setItems((prev) => [...data, ...prev]);

      if (pendingScrollRestoreRef.current) {
        pendingScrollRestoreRef.current.prependedCount = prependedCount;
      }

      const newBoundary = {
        start: 0,
        end: prependedCount - 1,
        prevCursor: pagination.prevCursor,
        nextCursor: pagination.nextCursor,
      };

      pageBoundariesRef.current = pageBoundariesRef.current.map((boundary) => ({
        ...boundary,
        start: boundary.start + prependedCount,
        end: boundary.end + prependedCount,
      }));
      pageBoundariesRef.current = [newBoundary, ...pageBoundariesRef.current];

      if (pageBoundariesRef.current.length > MAX_PAGES) {
        const dropped = pageBoundariesRef.current.pop()!;
        const droppedCount = dropped.end - dropped.start + 1;
        setItems((prev) => prev.slice(0, -droppedCount));
      }

      setHasPrev(pagination.hasPrev);
      setPrevCursor(pagination.prevCursor);

      const lastBoundary = pageBoundariesRef.current[pageBoundariesRef.current.length - 1];
      if (lastBoundary) {
        setNextCursor(lastBoundary.nextCursor);
        setHasNext(lastBoundary.nextCursor !== null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      pendingScrollRestoreRef.current = null;
    } finally {
      setLoadingPrev(false);
    }
  }

  loadNextRef.current = loadNext;
  loadPrevRef.current = loadPrev;

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Restore scroll after a previous-page load completes. This runs after React
  // has committed the new items[] so react-window knows the new rowCount. The
  // restore is pure arithmetic: newScrollTop = oldScrollTop + prependedCount *
  // ITEM_HEIGHT. We do NOT querySelector for the anchored row — react-window
  // only renders rows near scrollTop, and after prepend the anchored row is at
  // a new offset that hasn't been rendered yet, so querySelector would fail.
  // Instead we add the exact pixel delta that keeps the viewport stable.
  //
  // oldScrollTop was captured BEFORE setLoadingPrev(true), so it reflects the
  // list without the "Loading previous…" row. When this effect runs,
  // loadingPrev is false, so there is no loading row either — both states are
  // loading-row-free, making the simple formula exact:
  //   newScrollTop = oldScrollTop + prependedCount * ITEM_HEIGHT
  useEffect(() => {
    if (loadingPrev || !pendingScrollRestoreRef.current) return;
    if (pendingScrollRestoreRef.current.prependedCount === 0) {
      pendingScrollRestoreRef.current = null;
      return;
    }

    const wrapperEl = document.querySelector('.card-list');
    if (!wrapperEl) {
      pendingScrollRestoreRef.current = null;
      return;
    }

    const { oldScrollTop, prependedCount } = pendingScrollRestoreRef.current;
    wrapperEl.scrollTop = oldScrollTop + (prependedCount - 1) * ITEM_HEIGHT;
    pendingScrollRestoreRef.current = null;
  }, [loadingPrev, items.length]);

  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (loadingInitial || loadingNext || loadingPrev) return;

    const wrapperEl = event.currentTarget;
    const nearBottom = wrapperEl.scrollHeight - wrapperEl.clientHeight - wrapperEl.scrollTop <= 100;
    const nearTop = wrapperEl.scrollTop <= 100;

    if (nearBottom && hasNext && !loadingNext) {
      loadNextRef.current();
    }

    if (nearTop && hasPrev && !loadingPrev) {
      loadPrevRef.current();
    }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;

    try {
      const { data: newItem } = await api.post<Item>('/items', { text: newText.trim() });
      setNewText('');

      if (!hasPrev) {
        setItems((prev) => [newItem, ...prev]);
        pageBoundariesRef.current = pageBoundariesRef.current.map((boundary) => ({
          ...boundary,
          start: boundary.start + 1,
          end: boundary.end + 1,
        }));
      } else {
        setHasPrev(true);
      }
    } catch {
      setError('Failed to create item');
    }
  }

  const updateItem = useCallback(async (id: string, text: string) => {
    try {
      const { data: updated } = await api.patch<Item>(`/items/${id}`, { text });
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch {
      setError('Failed to update item');
    }
  }, []);

  const deleteItem = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/items/${id}`);
        setItems((prev) => {
          const next = prev.filter((item) => item.id !== id);
          if (next.length === 0 && hasNext && !loadingNext) {
            loadNextRef.current();
          }
          return next;
        });
      } catch {
        setError('Failed to delete item');
      }
    },
    [hasNext, loadingNext]
  );

  const rowData: RowData = useMemo(
    () => ({ items, loadingNext, loadingPrev, updateItem, deleteItem }),
    [items, loadingNext, loadingPrev, updateItem, deleteItem]
  );

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
        <button
          className="refresh-button"
          onClick={loadInitial}
          disabled={loadingInitial || loadingNext}
        >
          {loadingInitial ? 'Loading…' : 'Refresh'}
        </button>
        <span className="total-count">Loaded items: {items.length}</span>
      </div>

      {error && <p className="error-message">{error}</p>}
      {loadingInitial && items.length === 0 && <p className="loading-message">Loading items…</p>}

      {!error && (
        <div className="list-wrapper">
          <List<RowData>
            className="card-list"
            rowCount={items.length + (loadingNext ? 1 : 0) + (loadingPrev ? 1 : 0)}
            rowHeight={ITEM_HEIGHT}
            rowComponent={Row}
            rowProps={rowData}
            onScroll={handleScroll}
          />
        </div>
      )}
    </div>
  );
}

export default App;
