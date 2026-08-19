import { openDB, IDBPDatabase } from 'idb';
import { MangaItem, ReadingHistoryItem, ReadingProgress } from '../types';

const DB_NAME = 'xpodrao_local_v3';
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getLocalDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cached_manga')) {
          db.createObjectStore('cached_manga', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_library')) {
          db.createObjectStore('offline_library', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_history')) {
          db.createObjectStore('offline_history', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_progress')) {
          db.createObjectStore('offline_progress', { keyPath: 'mangaId' });
        }
      },
    });
  }
  return dbPromise;
}

// --- 1. MANGA CACHE ---
export async function cacheMangaForOffline(manga: MangaItem): Promise<void> {
  try {
    const db = await getLocalDB();
    await db.put('cached_manga', manga);
  } catch (err) {
    console.warn('cacheMangaForOffline failed:', err);
  }
}

export async function getCachedManga(mangaId: string): Promise<MangaItem | undefined> {
  try {
    const db = await getLocalDB();
    return db.get('cached_manga', mangaId);
  } catch (err) {
    return undefined;
  }
}

// --- 2. OFFLINE LIBRARY ---
export async function syncOfflineLibrary(library: MangaItem[]): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction('offline_library', 'readwrite');
    await tx.store.clear();
    for (const item of library) {
      await tx.store.put(item);
    }
    await tx.done;
  } catch (err) {
    console.warn('syncOfflineLibrary failed:', err);
  }
}

export async function getOfflineLibrary(): Promise<MangaItem[]> {
  try {
    const db = await getLocalDB();
    return db.getAll('offline_library');
  } catch (err) {
    return [];
  }
}

// --- 3. OFFLINE HISTORY ---
export async function saveOfflineHistory(history: ReadingHistoryItem[]): Promise<void> {
  try {
    const db = await getLocalDB();
    const tx = db.transaction('offline_history', 'readwrite');
    await tx.store.clear();
    for (const item of history) {
      await tx.store.put(item);
    }
    await tx.done;
  } catch (err) {
    console.warn('saveOfflineHistory failed:', err);
  }
}

export async function getOfflineHistory(): Promise<ReadingHistoryItem[]> {
  try {
    const db = await getLocalDB();
    return db.getAll('offline_history');
  } catch (err) {
    return [];
  }
}

// --- 4. OFFLINE PROGRESS ---
export async function saveOfflineProgress(prog: ReadingProgress): Promise<void> {
  try {
    const db = await getLocalDB();
    await db.put('offline_progress', prog);
  } catch (err) {
    console.warn('saveOfflineProgress failed:', err);
  }
}

export async function getOfflineProgress(mangaId: string): Promise<ReadingProgress | undefined> {
  try {
    const db = await getLocalDB();
    return db.get('offline_progress', mangaId);
  } catch (err) {
    return undefined;
  }
}
