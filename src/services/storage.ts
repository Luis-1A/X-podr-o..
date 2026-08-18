import { openDB, IDBPDatabase } from 'idb';
import { AutoCachedChapter, DownloadedChapter, MangaItem, ReadingProgress } from '../types';

const DB_NAME = 'xpodrao_local_v2';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getLocalDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Manual user downloads store (Permanent, never auto-deleted)
        if (!db.objectStoreNames.contains('downloaded_chapters')) {
          const dlStore = db.createObjectStore('downloaded_chapters', { keyPath: 'chapterId' });
          dlStore.createIndex('by_manga', 'mangaId');
        }

        // Automatic reader cache store (Rolling LRU cache, safe to auto-prune)
        if (!db.objectStoreNames.contains('auto_cached_chapters')) {
          const cacheStore = db.createObjectStore('auto_cached_chapters', { keyPath: 'chapterId' });
          cacheStore.createIndex('by_manga', 'mangaId');
          cacheStore.createIndex('by_last_accessed', 'lastAccessedAt');
          cacheStore.createIndex('by_cached_at', 'cachedAt');
        }

        if (!db.objectStoreNames.contains('cached_manga')) {
          db.createObjectStore('cached_manga', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('offline_progress_queue')) {
          db.createObjectStore('offline_progress_queue', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('offline_library')) {
          db.createObjectStore('offline_library', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// --- 1. MANUAL DOWNLOADS MANAGEMENT (Permanent User Downloads) ---
export async function saveDownloadedChapter(chapter: DownloadedChapter): Promise<void> {
  const db = await getLocalDB();
  await db.put('downloaded_chapters', chapter);
}

export async function getDownloadedChapter(chapterId: string): Promise<DownloadedChapter | undefined> {
  const db = await getLocalDB();
  return db.get('downloaded_chapters', chapterId);
}

export async function getDownloadedChaptersForManga(mangaId: string): Promise<DownloadedChapter[]> {
  const db = await getLocalDB();
  const tx = db.transaction('downloaded_chapters', 'readonly');
  const index = tx.store.index('by_manga');
  return index.getAll(mangaId);
}

export async function getAllDownloadedChapters(): Promise<DownloadedChapter[]> {
  const db = await getLocalDB();
  return db.getAll('downloaded_chapters');
}

export async function deleteDownloadedChapter(chapterId: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete('downloaded_chapters', chapterId);
}

// --- 2. AUTOMATIC PRELOAD & ROLLING CACHE MANAGEMENT ---
export async function saveAutoCachedChapter(chapter: AutoCachedChapter): Promise<void> {
  const db = await getLocalDB();
  await db.put('auto_cached_chapters', chapter);
}

export async function getAutoCachedChapter(chapterId: string): Promise<AutoCachedChapter | undefined> {
  const db = await getLocalDB();
  const cached = await db.get('auto_cached_chapters', chapterId);
  if (cached) {
    cached.lastAccessedAt = Date.now();
    await db.put('auto_cached_chapters', cached);
  }
  return cached;
}

export async function getAutoCachedChaptersForManga(mangaId: string): Promise<AutoCachedChapter[]> {
  const db = await getLocalDB();
  const tx = db.transaction('auto_cached_chapters', 'readonly');
  const index = tx.store.index('by_manga');
  return index.getAll(mangaId);
}

export async function getAllAutoCachedChapters(): Promise<AutoCachedChapter[]> {
  const db = await getLocalDB();
  return db.getAll('auto_cached_chapters');
}

export async function deleteAutoCachedChapter(chapterId: string): Promise<void> {
  const db = await getLocalDB();
  await db.delete('auto_cached_chapters', chapterId);
}

export async function clearAllAutoCache(): Promise<void> {
  const db = await getLocalDB();
  await db.clear('auto_cached_chapters');
}

export const clearAllAutoCachedChapters = clearAllAutoCache;

/**
 * Intelligent Auto-Cache Rolling Retention & Size Purge
 * Keeps only the most recent N chapters (default 3) per active manga
 * And ensures total auto-cache size stays within user limit (e.g. 500 MB)
 * STRICT RULE: NEVER removes items from 'downloaded_chapters' (manual user downloads).
 */
export async function performAutoCacheCleanup(
  currentMangaId?: string,
  retentionWindow: number = 3,
  maxCacheMb: number = 500
): Promise<{ deletedCount: number; freedBytes: number }> {
  try {
    const db = await getLocalDB();
    const allCached = await db.getAll('auto_cached_chapters');
    if (!allCached || allCached.length === 0) return { deletedCount: 0, freedBytes: 0 };

    let deletedCount = 0;
    let freedBytes = 0;

    // 1. Group by manga and apply rolling retention window (keep latest 3 chapters)
    if (currentMangaId) {
      const mangaChapters = allCached.filter((c) => c.mangaId === currentMangaId);
      // Sort by lastAccessedAt descending
      mangaChapters.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      if (mangaChapters.length > retentionWindow) {
        const toRemove = mangaChapters.slice(retentionWindow);
        for (const item of toRemove) {
          await db.delete('auto_cached_chapters', item.chapterId);
          deletedCount++;
          freedBytes += item.sizeBytes || 0;
        }
      }
    }

    // 2. Check total cache size limit (MB)
    const remaining = await db.getAll('auto_cached_chapters');
    let totalSizeBytes = remaining.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
    const maxBytes = maxCacheMb * 1024 * 1024;

    if (totalSizeBytes > maxBytes) {
      // Sort remaining by oldest last accessed
      remaining.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      for (const item of remaining) {
        if (totalSizeBytes <= maxBytes) break;
        await db.delete('auto_cached_chapters', item.chapterId);
        deletedCount++;
        freedBytes += item.sizeBytes || 0;
        totalSizeBytes -= item.sizeBytes || 0;
      }
    }

    return { deletedCount, freedBytes };
  } catch (err) {
    console.error('Error during auto-cache cleanup:', err);
    return { deletedCount: 0, freedBytes: 0 };
  }
}

// --- 3. STORAGE CALCULATION & BREAKDOWN ---
export async function calculateStorageUsage(): Promise<{
  totalBytes: number;
  formattedTotal: string;
  manualBytes: number;
  formattedManual: string;
  manualCount: number;
  autoCacheBytes: number;
  formattedAutoCache: string;
  autoCacheCount: number;
}> {
  const manual = await getAllDownloadedChapters();
  const auto = await getAllAutoCachedChapters();

  let manualBytes = 0;
  for (const ch of manual) manualBytes += ch.sizeBytes || 0;

  let autoCacheBytes = 0;
  for (const ch of auto) autoCacheBytes += ch.sizeBytes || 0;

  const totalBytes = manualBytes + autoCacheBytes;

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes > 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  };

  return {
    totalBytes,
    formattedTotal: formatSize(totalBytes),
    manualBytes,
    formattedManual: formatSize(manualBytes),
    manualCount: manual.length,
    autoCacheBytes,
    formattedAutoCache: formatSize(autoCacheBytes),
    autoCacheCount: auto.length,
  };
}

// --- 4. OFFLINE MANGA CACHING ---
export async function cacheMangaForOffline(manga: MangaItem): Promise<void> {
  const db = await getLocalDB();
  await db.put('cached_manga', manga);
}

export async function getCachedManga(mangaId: string): Promise<MangaItem | undefined> {
  const db = await getLocalDB();
  return db.get('cached_manga', mangaId);
}

export async function getAllCachedManga(): Promise<MangaItem[]> {
  const db = await getLocalDB();
  return db.getAll('cached_manga');
}

// --- 5. OFFLINE PROGRESS QUEUE ---
export async function enqueueOfflineProgress(progress: ReadingProgress): Promise<void> {
  const db = await getLocalDB();
  await db.add('offline_progress_queue', progress);
}

export async function getOfflineProgressQueue(): Promise<any[]> {
  const db = await getLocalDB();
  return db.getAll('offline_progress_queue');
}

export async function clearOfflineProgressQueue(): Promise<void> {
  const db = await getLocalDB();
  await db.clear('offline_progress_queue');
}

// --- 6. OFFLINE LIBRARY BACKUP ---
export async function syncOfflineLibrary(items: MangaItem[]): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction('offline_library', 'readwrite');
  await tx.store.clear();
  for (const item of items) {
    await tx.store.put(item);
  }
  await tx.done;
}

export async function getOfflineLibrary(): Promise<MangaItem[]> {
  const db = await getLocalDB();
  return db.getAll('offline_library');
}
