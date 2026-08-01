import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Item = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type CachedPage = {
  key: string;
  items: Item[];
  prevCursor: string | null;
  nextCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
};

interface ItemDBSchema extends DBSchema {
  pages: {
    key: string;
    value: CachedPage;
  };
}

const DB_NAME = 'rendering-list-cache';
const DB_VERSION = 1;
const STORE_NAME = 'pages';

let dbPromise: Promise<IDBPDatabase<ItemDBSchema>> | null = null;

function getDB(): Promise<IDBPDatabase<ItemDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ItemDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getCachedPage(key: string): Promise<CachedPage | undefined> {
  try {
    const db = await getDB();
    return db.get(STORE_NAME, key);
  } catch {
    return undefined;
  }
}

export async function putCachedPage(page: CachedPage): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, page);
  } catch {
    // # NOTE: graceful degradation — if IDB write fails, page just isn't cached
  }
}

export async function deleteCachedPage(key: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, key);
  } catch {
    // # NOTE: ignore — page may already be gone
  }
}

export async function clearAllPages(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
  } catch {
    // # NOTE: ignore — cache may not exist
  }
}
