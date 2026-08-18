import axios from 'axios';
import {
  ChapterItem,
  ChapterPagesResult,
  DownloadedChapter,
  DownloadQueueItem,
  ExtensionItem,
  LibraryCategory,
  MangaItem,
  ReadingHistoryItem,
  ReadingProgress,
  User,
  UserProfile,
  UserSettings,
} from '../types';
import {
  clearOfflineProgressQueue,
  enqueueOfflineProgress,
  getOfflineProgressQueue,
  saveDownloadedChapter,
} from './storage';

const API_BASE = '/api';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 45000,
});

// Attach JWT token to requests if present
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('xpodrao_auth_token') || localStorage.getItem('mangaverse_auth_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Resilient response interceptor
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // If token expired or invalid, purge stale tokens so subsequent guest/public calls succeed
      const url = error.config?.url || '';
      if (url.includes('/auth/me') || url.includes('/user/')) {
        localStorage.removeItem('xpodrao_auth_token');
        localStorage.removeItem('mangaverse_auth_token');
      }
    }
    return Promise.reject(error);
  }
);

// Helper for proxied images (solves CORS & hotlink protection)
export function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  return `/api/proxy/image?url=${encodeURIComponent(originalUrl)}`;
}

// --- AUTH APIS ---
export async function apiRegister(data: {
  username: string;
  email: string;
  password: string;
  preferredGenres?: string[];
  preferredLanguages?: string[];
}) {
  const res = await client.post('/auth/register', data);
  if (res.data.token) {
    localStorage.setItem('xpodrao_auth_token', res.data.token);
  }
  return res.data;
}

export async function apiLogin(login: string, password: string) {
  const res = await client.post('/auth/login', { login, password });
  if (res.data.token) {
    localStorage.setItem('xpodrao_auth_token', res.data.token);
  }
  return res.data;
}

export async function apiGuest() {
  const res = await client.post('/auth/guest');
  if (res.data.token) {
    localStorage.setItem('xpodrao_auth_token', res.data.token);
  }
  return res.data;
}

export async function apiGetMe() {
  const res = await client.get('/auth/me');
  return res.data;
}

// --- USER PREFERENCES & SETTINGS ---
export async function apiUpdatePreferences(preferences: {
  preferredGenres?: string[];
  preferredLanguages?: string[];
  displayName?: string;
}) {
  const res = await client.put('/user/preferences', preferences);
  return res.data;
}

export async function apiGetSettings(): Promise<UserSettings> {
  const res = await client.get('/user/settings');
  return res.data;
}

export async function apiUpdateSettings(settings: Partial<UserSettings>) {
  const res = await client.put('/user/settings', settings);
  return res.data;
}

// --- LIBRARY APIS ---
export async function apiGetLibrary(): Promise<MangaItem[]> {
  const res = await client.get('/user/library');
  return (res.data || []).map((item: any) => ({
    id: item.manga_id,
    sourceId: item.source_id,
    title: item.title,
    coverUrl: item.cover_url,
    author: item.author,
    artist: item.artist,
    status: item.status,
    category: item.category,
    totalChapters: item.total_chapters,
    unreadCount: item.unread_count,
    addedAt: item.added_at,
    updatedAt: item.updated_at,
    genres: [],
    description: '',
  }));
}

export async function apiAddToLibrary(manga: {
  mangaId: string;
  sourceId: string;
  title: string;
  coverUrl: string;
  author?: string;
  artist?: string;
  status?: string;
  category?: LibraryCategory;
  totalChapters?: number;
}) {
  const res = await client.post('/user/library', manga);
  return res.data;
}

export async function apiUpdateLibraryCategory(mangaId: string, category: LibraryCategory) {
  const res = await client.put(`/user/library/${mangaId}`, { category });
  return res.data;
}

export async function apiRemoveFromLibrary(mangaId: string) {
  const res = await client.delete(`/user/library/${mangaId}`);
  return res.data;
}

// --- READING PROGRESS & HISTORY ---
export async function apiGetProgress(): Promise<ReadingProgress[]> {
  const res = await client.get('/user/progress');
  return (res.data || []).map((p: any) => ({
    id: p.id,
    mangaId: p.manga_id,
    chapterId: p.chapter_id,
    mangaTitle: p.manga_title,
    chapterNumber: p.chapter_number,
    chapterTitle: p.chapter_title,
    currentPage: p.current_page,
    totalPages: p.total_pages,
    percentage: p.percentage,
    isCompleted: p.is_completed === 1,
    updatedAt: p.updated_at,
  }));
}

export async function apiGetMangaProgress(mangaId: string): Promise<ReadingProgress | null> {
  try {
    const res = await client.get(`/user/progress/${mangaId}`);
    if (!res.data) return null;
    const p = res.data;
    return {
      id: p.id,
      mangaId: p.manga_id,
      chapterId: p.chapter_id,
      mangaTitle: p.manga_title,
      chapterNumber: p.chapter_number,
      chapterTitle: p.chapter_title,
      currentPage: p.current_page,
      totalPages: p.total_pages,
      percentage: p.percentage,
      isCompleted: p.is_completed === 1,
      updatedAt: p.updated_at,
    };
  } catch (err) {
    return null;
  }
}

export async function apiSaveProgress(progress: ReadingProgress, isOnline: boolean = true) {
  if (!isOnline) {
    await enqueueOfflineProgress(progress);
    return { offlineSaved: true };
  }

  try {
    const res = await client.post('/user/progress', {
      mangaId: progress.mangaId,
      chapterId: progress.chapterId,
      mangaTitle: progress.mangaTitle,
      chapterNumber: progress.chapterNumber,
      chapterTitle: progress.chapterTitle,
      coverUrl: progress.coverUrl,
      currentPage: progress.currentPage,
      totalPages: progress.totalPages,
      isCompleted: progress.isCompleted,
    });
    return res.data;
  } catch (err) {
    // If request fails due to network drop, enqueue locally
    await enqueueOfflineProgress(progress);
    return { offlineSaved: true };
  }
}

export async function syncOfflineProgressQueue(): Promise<number> {
  const queue = await getOfflineProgressQueue();
  if (!queue || queue.length === 0) return 0;

  try {
    const res = await client.post('/user/progress/sync', { queue });
    if (res.data.success) {
      await clearOfflineProgressQueue();
      return res.data.syncedCount || queue.length;
    }
  } catch (err) {
    console.error('Failed to sync offline progress queue:', err);
  }
  return 0;
}

export async function apiGetHistory(): Promise<ReadingHistoryItem[]> {
  const res = await client.get('/user/history');
  return (res.data || []).map((h: any) => ({
    id: h.id,
    mangaId: h.manga_id,
    chapterId: h.chapter_id,
    mangaTitle: h.manga_title,
    chapterNumber: h.chapter_number,
    chapterTitle: h.chapter_title,
    coverUrl: h.cover_url,
    page: h.page,
    totalPages: h.total_pages,
    readAt: h.read_at,
  }));
}

export async function apiDeleteHistoryItem(chapterId: string) {
  const res = await client.delete(`/user/history/${chapterId}`);
  return res.data;
}

export async function apiClearHistory() {
  const res = await client.delete('/user/history');
  return res.data;
}

// --- MANGA & CHAPTER APIS ---
export async function apiSearchManga(
  params: {
    q?: string;
    genres?: string[];
    lang?: string[];
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal
): Promise<{ results: MangaItem[]; total: number }> {
  try {
    const res = await client.get('/manga/search', {
      params: {
        q: params.q || '',
        genres: params.genres?.join(','),
        lang: params.lang?.join(','),
        limit: params.limit || 24,
        offset: params.offset || 0,
      },
      signal,
    });
    return res.data || { results: [], total: 0 };
  } catch (err: any) {
    if (axios.isCancel(err) || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.message === 'canceled') {
      // Intentionally aborted due to typing or user navigation
      return { results: [], total: 0 };
    }
    console.error('apiSearchManga error:', err.message || err);
    return { results: [], total: 0 };
  }
}

export async function apiGetMangaDetails(mangaId: string): Promise<MangaItem> {
  const res = await client.get(`/manga/${mangaId}`);
  return res.data;
}

export async function apiGetMangaChapters(mangaId: string, languages: string[] = ['pt-br', 'pt', 'en', 'es']): Promise<ChapterItem[]> {
  try {
    const res = await client.get(`/manga/${mangaId}/feed`, {
      params: {
        lang: languages.join(','),
      },
    });
    return res.data || [];
  } catch (err) {
    console.error('apiGetMangaChapters error:', err);
    return [];
  }
}

export async function apiGetChapterPages(chapterId: string): Promise<{
  chapterId: string;
  baseUrl: string;
  hash: string;
  pages: string[];
  dataSaverPages: string[];
}> {
  const res = await client.get(`/chapter/${chapterId}/pages`);
  return res.data;
}

export async function apiGetUpdates(): Promise<any[]> {
  try {
    const res = await client.get('/manga/updates');
    return res.data || [];
  } catch (err) {
    console.error('apiGetUpdates error:', err);
    return [];
  }
}

export async function apiGetRecommendations(genres?: string[]): Promise<MangaItem[]> {
  try {
    const res = await client.get('/manga/recommendations', {
      params: {
        genres: genres?.join(','),
      },
    });
    return res.data || [];
  } catch (err) {
    console.error('apiGetRecommendations error:', err);
    return [];
  }
}

export async function apiGetExtensions(): Promise<ExtensionItem[]> {
  try {
    const res = await client.get('/extensions/catalog');
    return res.data || [];
  } catch (err) {
    console.error('apiGetExtensions error:', err);
    return [];
  }
}

// --- DOWNLOAD ENGINE ---
/**
 * Downloads all pages of a chapter and stores them into IndexedDB
 */
export async function downloadChapterWithProgress(
  chapter: {
    id: string;
    mangaId: string;
    chapterNumber: string;
    chapterTitle?: string;
    mangaTitle: string;
    coverUrl?: string;
  },
  onProgress?: (progress: { current: number; total: number; percent: number }) => void
): Promise<DownloadedChapter> {
  // 1. Get real chapter pages
  const pagesData = await apiGetChapterPages(chapter.id);
  const pageUrls = pagesData.pages || [];
  if (pageUrls.length === 0) {
    throw new Error('Nenhuma página encontrada para este capítulo.');
  }

  const downloadedPages: Array<{ pageNumber: number; dataUrl: string }> = [];
  let totalBytes = 0;

  // 2. Fetch pages through proxy and convert to data URLs
  for (let i = 0; i < pageUrls.length; i++) {
    const rawUrl = pageUrls[i];
    const proxyUrl = getProxiedImageUrl(rawUrl);

    try {
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      totalBytes += blob.size;

      // Convert Blob to Data URL for rock-solid offline persistence in IndexedDB
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      downloadedPages.push({
        pageNumber: i + 1,
        dataUrl,
      });

      const current = i + 1;
      const total = pageUrls.length;
      const percent = Math.round((current / total) * 100);
      onProgress?.({ current, total, percent });
    } catch (err: any) {
      console.error(`Error downloading page ${i + 1}:`, err);
      throw new Error(`Falha ao baixar página ${i + 1}: ${err.message || ''}`);
    }
  }

  const result: DownloadedChapter = {
    chapterId: chapter.id,
    mangaId: chapter.mangaId,
    mangaTitle: chapter.mangaTitle,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.chapterTitle || '',
    coverUrl: chapter.coverUrl || '',
    pageCount: downloadedPages.length,
    pages: downloadedPages,
    sizeBytes: totalBytes,
    downloadedAt: new Date().toISOString(),
  };

  // Save to IndexedDB
  await saveDownloadedChapter(result);

  // Sync download metadata to server if online
  try {
    await client.post('/user/downloads', {
      mangaId: chapter.mangaId,
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.chapterTitle,
      mangaTitle: chapter.mangaTitle,
      coverUrl: chapter.coverUrl,
      pageCount: downloadedPages.length,
      sizeBytes: totalBytes,
    });
  } catch (e) {
    // Ignore server sync failure
  }

  return result;
}

export async function apiPullFullSync() {
  const res = await client.get('/sync/pull');
  return res.data;
}
