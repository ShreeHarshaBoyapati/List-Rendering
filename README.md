# Rendering Large Lists on the UI — A Pragmatic Guide

I was working on a couple of projects — one displaying FTP folders and files, another powering a RAG system — where I needed to show lists of data in cards. The lists had to handle large datasets without lagging, crashing, or freezing the browser. I came up with a four-phase plan, tested it in those projects, and then rebuilt it here as a clean reference implementation. This repo demonstrates each phase, what problem it solves, and what trade-offs remain.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TypeScript |
| Virtualization | `react-window` |
| Client-side cache | `idb` (IndexedDB) |
| Backend | Express 5, TypeScript |
| Database | PostgreSQL via TypeORM |

## Project Setup

### Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** (running locally or remotely)

### 1. Clone and install

```bash
git clone https://github.com/ShreeHarshaBoyapati/List-Rendering.git
cd List-Rendering
npm run install:all
```

This installs dependencies for the root, `frontend/`, and `backend/` in one command.

### 2. Configure environment files

Create `.env` files from the examples:

**Backend** (`backend/.env`):

```bash
cp backend/.env.example backend/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port |
| `DATABASE_HOST` | `localhost` | Postgres host |
| `DATABASE_PORT` | `5432` | Postgres port |
| `DATABASE_USERNAME` | `postgres` | Postgres username |
| `DATABASE_PASSWORD` | `postgres` | Postgres password |
| `DATABASE_NAME` | `rendering_list` | Database name |

**Frontend** (`frontend/.env`):

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | Backend API URL |
| `VITE_PORT` | `3000` | Dev server port |

### 3. Create the database

```bash
createdb rendering_list
```

Or via `psql`:

```bash
psql -U postgres -c "CREATE DATABASE rendering_list;"
```

### 4. Seed the database

The seed script populates the database with 5 million items by default (configurable via env vars):

```bash
cd backend && npm run seed
```

To seed a different amount:

```bash
TOTAL_ITEMS=50000 BATCH_SIZE=5000 npm run seed
```

### 5. Run the app

From the project root:

```bash
npm run dev
```

This starts both the frontend (port 3000) and backend (port 8000) concurrently using `concurrently`. Open `http://localhost:3000` in your browser.

### Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend + backend in dev mode |
| `npm run build` | Build both frontend and backend |
| `npm run lint` | Lint both frontend and backend |
| `npm run format` | Format all files with Prettier |
| `cd backend && npm run seed` | Seed the database with test data |

---

## The Four Phases

Each phase is captured in a specific commit so you can check out the code at any stage.

### Phase 1: Initial List Rendering

**Commit:** [`75c2be7`](https://github.com/ShreeHarshaBoyapati/List-Rendering/commit/75c2be7076f5c1c5d70e12e446cbdbfabd9fb009)

The simplest approach: fetch every item from the backend in one go and render every card as a DOM node.

The backend was an Express server with an in-memory array — no pagination, no limit. The frontend called `GET /api/items`, received the entire dataset as JSON, and rendered it with `items.map(...)` inside a `<ul>`. CRUD operations were straightforward: **Create** sent a `POST` and prepended the new item; **Update** sent a `PATCH` and spliced the item in place; **Delete** sent a `DELETE` and filtered the item out. After each mutation, the app called `loadInitial()` — a full refetch and re-render.

**Memory:** All the JS objects (the entire dataset) sat in the heap, and every card's DOM node was also created and stored in the heap. For 100 items this was fine. For 50,000 it was not.

**What went wrong:**

1. **Slow rendering after fetch.** Even after the backend responded, the UI froze for seconds while the browser created 50,000 DOM nodes. The fetch was done, but the user saw nothing.
2. **JSON body limit.** When the dataset grew large enough, the response exceeded the JSON body size limit configured in the backend middleware. The request failed outright — no data was rendered at all.
3. **Heap overflow.** Even if the fetch succeeded, the browser's heap could fill up. The GC collector would thrash trying to free memory, and in extreme cases the tab would crash.

**Demos:**

<video src="https://github.com/user-attachments/assets/32daa580-f1c9-4309-a972-dcda8d95a9fe" controls width="100%"></video>

<video src="https://github.com/user-attachments/assets/afa3508c-9347-42d3-b7ba-0445ed440951" controls width="100%"></video>

---

### Phase 2: Virtualization

**Commit:** [`447c57d`](https://github.com/ShreeHarshaBoyapati/List-Rendering/commit/447c57d5d70e8766bdfa36fe2163e9657e78baf6)

The first problem — slow rendering — was caused by creating DOM nodes for every item. Virtualization fixes this by only rendering the cards visible in the viewport (plus a small overscan buffer).

I added [`react-window`](https://github.com/bvaughn/react-window), which provides a `<List>` component. You give it a `rowHeight` (80px), a `rowCount` (the total number of items), and a custom `Row` renderer. The library handles the rest — it mounts only the ~10–15 rows that fit on screen and recycles them as you scroll.

**Memory:** The JS objects for all items still lived in the heap, but now only a handful of DOM nodes existed at a time. The virtualization library also maintained a height map in the heap, but this was negligible compared to the full DOM tree from Phase 1.

**The win:** Rendering 50,000 items became instant. The browser only ever had a dozen DOM nodes to worry about.

**What remained:** The backend still sent all 50,000 items in a single JSON response. If the dataset was large enough, the JSON body limit would still kill the request, and the heap could still overflow from the JS objects alone — no DOM needed.

**Demo:**

<video src="https://github.com/user-attachments/assets/7dc1d423-154f-4e87-88b9-7eaa7e8d3394" controls width="100%"></video>

A note on library choice: before reaching for `react-window` or any virtualization library, check its bundle size, maintenance status, and vulnerabilities. You can also build your own — it's not much code for fixed-height rows — but I'd start with a proven library.

---

### Phase 3: Cursor Pagination + Sliding Window

**Commits:** [`8951667`](https://github.com/ShreeHarshaBoyapati/List-Rendering/commit/8951667bf6cdfbfc705f092e15fe81027817beb5) (pagination) · [`14441fc`](https://github.com/ShreeHarshaBoyapati/List-Rendering/commit/14441fce84d813f4b7772eb17b6f1f749b6eda72) (CRUD fixes)

Phase 2 solved the DOM problem. Phase 3 solves the data problem: instead of fetching everything at once, fetch it in pages.

#### Cursor vs. Offset Pagination

I used **cursor (keyset) pagination**, not offset pagination. The cursor is a `base64url`-encoded string of `"createdAt,id"` — a compound keyset sorted by `createdAt DESC, id ASC`. It's a boundary value: "give me everything that sorts *after* this point."

The key difference: **offsets shift when rows are inserted or deleted; keyset cursors don't.** If you're on page 3 at offset 100 and someone deletes a row above you, offset 100 now points to a different row. A cursor pointing to a specific `(createdAt, id)` boundary stays valid no matter what happens elsewhere in the table.

On the backend (now backed by Postgres via TypeORM), `findNextPage` queries `WHERE createdAt < cursor.createdAt OR (createdAt = cursor.createdAt AND id < cursor.id)`, ordered `DESC`. `findPrevPage` inverts the condition and ordering, then reverses the result to restore `DESC` order.

#### The Sliding Window

The frontend keeps at most `MAX_PAGES = 3` pages (150 items) in memory. When a new page is fetched at the bottom, the top page is evicted. When a page is fetched at the top, the bottom page is evicted. A `pageBoundariesRef` tracks which slice of the `items[]` array belongs to which page, along with each page's cursors.

#### The Scroll Problem

Here's the tricky part: when you prepend items (scrolling up), the browser's `scrollTop` doesn't change, but the content above has grown — so the viewport jumps to a different item. The user loses their place.

The fix: capture `scrollTop` *before* the prepend. Then, in a `useEffect` that runs after React has committed the new items, restore the scroll position using pure arithmetic:

```
newScrollTop = oldScrollTop + prependedCount × ITEM_HEIGHT
```

No DOM queries needed — `react-window` hasn't rendered the anchored row yet at the new offset, so `querySelector` would fail. The formula is exact because both states (before capture and after restore) have no loading row, so the math is clean.

#### CRUD Without Full Reload

Commit `14441fc` fixed the CRUD operations to work with the sliding window instead of calling `loadInitial()` after every mutation:

| Op | Handling |
|----|----------|
| **Create** | If at the true top (`!hasPrev`): prepend to `items[]`, shift page boundaries. Else: just set `hasPrev = true` — the new item exists above the window. |
| **Update** | Splice the updated item in place by `id`. Sort position is unchanged (`createdAt` and `id` are immutable), so all cursors stay valid. |
| **Delete** | Filter the item out locally. If the window becomes empty and `hasNext`, auto-trigger `loadNext()`. |

No full reloads, no scroll jumps.

> A note on TanStack Query: I've seen teams adopt it to reduce CRUD boilerplate. It's genuinely useful when you need to **invalidate a cache from a different component**. But if your CRUD lives in a single component, plain `fetch` (or `axios`) is leaner — smaller bundle, fewer abstractions, and the code is just as readable.

**Memory:** Similar to Phase 2, but the dataset coming from the backend is tiny — only one page at a time. The heap holds at most 150 items. It's essentially a sliding window.

**Demo:**

<video src="https://github.com/user-attachments/assets/404ce920-5e8b-4ce4-8cb2-c9eb3261dfc7" controls width="100%"></video>

**What remained:** An edge case where a single page contains one extremely large item. The JSON response for that page could still exceed the body limit, or the heap could spike. I hardcoded the page limit, but you could make it dynamic — monitor performance metrics and adjust the limit up or down in a `useEffect` to keep things smooth.

---

### Phase 4: IndexedDB Cache Layer

**Commit:** [`3b804ec`](https://github.com/ShreeHarshaBoyapati/List-Rendering/commit/3b804ecafde562a65da6f5135009bb5980c1c057)

Phase 3 fixed the data problem but introduced a new one: every time a page was evicted and the user scrolled back, the app hit the backend again. Phase 4 adds a client-side cache to avoid those redundant fetches.

#### Three-Tier Storage

| Tier | Storage | Contents | Size |
|------|---------|----------|------|
| **1. Heap** | React state `items[]` | Currently visible window | 3 pages (150 items) |
| **2. IndexedDB** | Browser DB `rendering-list-cache` | Recently evicted pages — 3 above + 3 below | 6 pages (300 items) |
| **3. Backend** | Postgres | Source of truth | All items |

When a page is evicted from the heap, it's written to IndexedDB. When the user scrolls back, the app checks IDB first. A **cache hit** means no backend call at all. A **cache miss** falls through to the backend, and the result gets cached on future eviction.

#### Cache Key Scheme

Pages are keyed by the cursor that would be used to fetch them:

- **Top-evicted page** (evicted during `loadNext`): stored as `prev:${cursor}` — scrolling back up calls `loadPrev(cursor)`, so we look up `prev:${cursor}` in IDB.
- **Bottom-evicted page** (evicted during `loadPrev`): stored as `next:${cursor}` — scrolling back down calls `loadNext(cursor)`, so we look up `next:${cursor}`.

When a page is restored from IDB to the heap, it's deleted from IDB — a page exists in **exactly one tier at a time**.

#### CRUD with IDB Awareness

- **Create:** If the topmost cached page in IDB is the true top (`hasPrev = false`), the new item is prepended to that cached page so the user sees it on scroll-up without a backend call. Otherwise, no sync — the backend serves it on cache miss.
- **Update / Delete:** Only touch the heap. Since a page lives in exactly one tier, if the item is in the heap, it's not in IDB — no IDB sync needed.

**Demo:**

<video src="https://github.com/user-attachments/assets/f9d8c8e1-e055-4900-917d-3e766b6440bc" controls width="100%"></video>

**What remained:** The same edge case as Phase 3 — a single extremely large item in a page could still exceed limits. IDB doesn't solve that; it solves the *number of backend calls*, not the *size of a single response*.

---

## Summary

| Phase | What it solves | What remains |
|-------|---------------|--------------|
| **1. Initial render** | Baseline — fetch all, render all | Slow render, JSON limit, heap overflow |
| **2. Virtualization** | DOM node count — only visible rows rendered | JSON limit, heap overflow (all data still fetched) |
| **3. Cursor pagination** | Data volume — only one page fetched at a time; CRUD-safe cursors | Single huge item per page could still hit limits |
| **4. IndexedDB cache** | Backend call count — evicted pages cached client-side | Same single-huge-item edge case |

Each phase addresses a specific bottleneck without regressing on the previous one. The result is a list that can handle tens of thousands of items smoothly — visible rows are virtualized, data is paginated with CRUD-safe cursors, the heap is bounded by a sliding window, and recently viewed pages are cached in IndexedDB to avoid redundant fetches.