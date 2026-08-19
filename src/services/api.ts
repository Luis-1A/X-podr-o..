import axios from 'axios';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  ChapterItem,
  ChapterPagesResult,
  LibraryCategory,
  MangaItem,
  MangaSearchPreview,
  ReadingHistoryItem,
  ReadingProgress,
  User,
  UserProfile,
  UserSettings,
} from '../types';
import {
  syncOfflineLibrary,
  getOfflineLibrary,
  cacheMangaForOffline,
  getCachedManga,
  getOfflineHistory,
  saveOfflineHistory,
  getOfflineProgress,
  saveOfflineProgress,
} from './storage';

export function getApiBaseUrl(): string {
  const custom = localStorage.getItem('xpodrao_api_url');
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv.VITE_API_URL) {
    return (metaEnv.VITE_API_URL as string).replace(/\/+$/, '');
  }
  return '/api';
}

export function setCustomApiBaseUrl(url: string | null) {
  if (!url || !url.trim()) {
    localStorage.removeItem('xpodrao_api_url');
  } else {
    localStorage.setItem('xpodrao_api_url', url.trim());
  }
  client.defaults.baseURL = getApiBaseUrl();
}

export const client = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
});

client.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

// Fast Client-Side Search Cache & Inflight Controller
const clientSearchCache = new Map<string, { results: MangaSearchPreview[]; timestamp: number }>();
let currentSearchAbortController: AbortController | null = null;

// Helper for proxied images (solves CORS & hotlink protection)
export function getProxiedImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }
  const base = getApiBaseUrl();
  return `${base}/proxy/image?url=${encodeURIComponent(originalUrl)}`;
}

// ==========================================
// 1. FIREBASE AUTH & USER PROFILE FUNCTIONS
// ==========================================

export async function firebaseRegisterUser(
  email: string,
  pass: string,
  username: string,
  preferredGenres: string[] = [],
  preferredLanguages: string[] = ['pt-br', 'en']
): Promise<{ user: User; profile: UserProfile; settings: UserSettings }> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  const fbUser = userCredential.user;

  const now = new Date().toISOString();
  const userData: User = {
    id: fbUser.uid,
    username: username || email.split('@')[0],
    email: fbUser.email || email,
  };

  const profileData: UserProfile = {
    displayName: username || email.split('@')[0],
    preferredGenres,
    preferredLanguages,
  };

  const settingsData: UserSettings = {
    reader_mode: 'webtoon',
    reading_direction: 'ltr',
    page_fit: 'width',
    auto_download_next: 1,
    keep_downloads: 5,
    theme: 'dark',
    preload_network: 'all',
  };

  try {
    // Write user doc to Firestore: users/{uid}
    await setDoc(doc(db, 'users', fbUser.uid), {
      name: userData.username,
      email: userData.email,
      createdAt: now,
      lastLoginAt: now,
      role: 'user',
    });

    // Write initial preferences: users/{uid}/settings/preferences
    await setDoc(doc(db, 'users', fbUser.uid, 'settings', 'preferences'), {
      ...settingsData,
      preferredGenres,
      preferredLanguages,
      updatedAt: now,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`);
  }

  localStorage.setItem('xpodrao_cached_user', JSON.stringify(userData));
  return { user: userData, profile: profileData, settings: settingsData };
}

export async function firebaseLoginUser(
  email: string,
  pass: string
): Promise<{ user: User; profile: UserProfile; settings: UserSettings }> {
  const userCredential = await signInWithEmailAndPassword(auth, email, pass);
  const fbUser = userCredential.user;

  const now = new Date().toISOString();
  let username = fbUser.email?.split('@')[0] || 'Leitor';
  let profileData: UserProfile = {
    displayName: username,
    preferredGenres: [],
    preferredLanguages: ['pt-br', 'en'],
  };
  let settingsData: UserSettings = {
    reader_mode: 'webtoon',
    reading_direction: 'ltr',
    page_fit: 'width',
    auto_download_next: 1,
    keep_downloads: 5,
    theme: 'dark',
    preload_network: 'all',
  };

  try {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.name) username = data.name;
      await updateDoc(userDocRef, { lastLoginAt: now });
    } else {
      await setDoc(userDocRef, {
        name: username,
        email: fbUser.email,
        createdAt: now,
        lastLoginAt: now,
        role: 'user',
      });
    }

    // Load settings from Firestore
    const settingsSnap = await getDoc(doc(db, 'users', fbUser.uid, 'settings', 'preferences'));
    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      settingsData = { ...settingsData, ...s };
      if (s.preferredGenres) profileData.preferredGenres = s.preferredGenres;
      if (s.preferredLanguages) profileData.preferredLanguages = s.preferredLanguages;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`);
  }

  const userData: User = {
    id: fbUser.uid,
    username,
    email: fbUser.email || email,
  };

  localStorage.setItem('xpodrao_cached_user', JSON.stringify(userData));
  return { user: userData, profile: profileData, settings: settingsData };
}

export async function firebaseGoogleSignIn(): Promise<{ user: User; profile: UserProfile; settings: UserSettings }> {
  const userCredential = await signInWithPopup(auth, googleProvider);
  const fbUser = userCredential.user;

  const now = new Date().toISOString();
  const username = fbUser.displayName || fbUser.email?.split('@')[0] || 'Google User';
  const userData: User = {
    id: fbUser.uid,
    username,
    email: fbUser.email || '',
  };

  const profileData: UserProfile = {
    displayName: username,
    avatar: fbUser.photoURL || undefined,
    preferredGenres: [],
    preferredLanguages: ['pt-br', 'en'],
  };

  const settingsData: UserSettings = {
    reader_mode: 'webtoon',
    reading_direction: 'ltr',
    page_fit: 'width',
    auto_download_next: 1,
    keep_downloads: 5,
    theme: 'dark',
  };

  try {
    const userDocRef = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      await setDoc(userDocRef, {
        name: username,
        email: fbUser.email,
        avatar: fbUser.photoURL || '',
        createdAt: now,
        lastLoginAt: now,
        role: 'user',
      });
    } else {
      await updateDoc(userDocRef, { lastLoginAt: now });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`);
  }

  localStorage.setItem('xpodrao_cached_user', JSON.stringify(userData));
  return { user: userData, profile: profileData, settings: settingsData };
}

export async function firebaseGuestSignIn(): Promise<{ user: User; profile: UserProfile; settings: UserSettings }> {
  let fbUser: any = null;
  try {
    const userCredential = await signInAnonymously(auth);
    fbUser = userCredential.user;
  } catch (e) {
    // If anonymous auth is disabled on console, create local guest
    console.warn('Anonymous auth offline, using local guest fallback:', e);
  }

  const guestId = fbUser?.uid || 'guest_' + Date.now();
  const userData: User = {
    id: guestId,
    username: 'Leitor Visitante',
    email: 'visitante@xpodrao.local',
    isGuest: true,
  };

  const profileData: UserProfile = {
    displayName: 'Leitor Visitante',
    preferredGenres: [],
    preferredLanguages: ['pt-br', 'en'],
  };

  const settingsData: UserSettings = {
    reader_mode: 'webtoon',
    reading_direction: 'ltr',
    page_fit: 'width',
    auto_download_next: 1,
    keep_downloads: 5,
    theme: 'dark',
  };

  localStorage.setItem('xpodrao_cached_user', JSON.stringify(userData));
  return { user: userData, profile: profileData, settings: settingsData };
}

export async function firebaseSignOutUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('Firebase signout warning:', e);
  }
  localStorage.removeItem('xpodrao_cached_user');
}

// ==========================================
// 2. FIRESTORE USER DATA SYNC (FAVORITES / HISTORY / PROGRESS / SETTINGS)
// ==========================================

export async function apiGetLibrary(): Promise<MangaItem[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return await getOfflineLibrary();
  }

  try {
    const favsRef = collection(db, 'users', currentUser.uid, 'favorites');
    const snapshot = await getDocs(favsRef);
    const mangas: MangaItem[] = [];

    snapshot.forEach((d) => {
      const data = d.data();
      mangas.push({
        id: data.mangaId || d.id,
        sourceId: 'mangafire',
        sourceName: 'MangaFire',
        title: data.title || 'Sem título',
        description: data.description || '',
        coverUrl: data.cover || '',
        author: data.author || '',
        artist: '',
        status: data.status || 'ongoing',
        genres: data.genres || [],
        contentRating: 'safe',
        category: data.category || 'reading',
        totalChapters: data.totalChapters,
        addedAt: data.addedAt,
      });
    });

    await syncOfflineLibrary(mangas);
    return mangas;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/favorites`);
    return await getOfflineLibrary();
  }
}

export async function apiAddToLibrary(manga: MangaItem, category: LibraryCategory = 'reading') {
  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  if (currentUser) {
    try {
      const favRef = doc(db, 'users', currentUser.uid, 'favorites', manga.id);
      await setDoc(favRef, {
        mangaId: manga.id,
        title: manga.title,
        cover: manga.coverUrl || '',
        description: manga.description || '',
        category,
        totalChapters: manga.totalChapters || 0,
        addedAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/favorites/${manga.id}`);
    }
  }

  // Also cache locally
  const currentLib = await getOfflineLibrary();
  const updated = [...currentLib.filter((m) => m.id !== manga.id), { ...manga, category, addedAt: now }];
  await syncOfflineLibrary(updated);
}

export async function apiRemoveFromLibrary(mangaId: string) {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'favorites', mangaId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/favorites/${mangaId}`);
    }
  }

  const currentLib = await getOfflineLibrary();
  await syncOfflineLibrary(currentLib.filter((m) => m.id !== mangaId));
}

export async function apiGetHistory(): Promise<ReadingHistoryItem[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return await getOfflineHistory();
  }

  try {
    const histRef = collection(db, 'users', currentUser.uid, 'history');
    const q = query(histRef, orderBy('lastReadAt', 'desc'), firestoreLimit(60));
    const snapshot = await getDocs(q);
    const history: ReadingHistoryItem[] = [];

    snapshot.forEach((d) => {
      const data = d.data();
      history.push({
        id: d.id,
        mangaId: data.mangaId,
        chapterId: data.chapterId,
        mangaTitle: data.title || '',
        chapterNumber: data.chapterNumber || '1',
        chapterTitle: data.chapterTitle || '',
        coverUrl: data.coverUrl || '',
        page: data.page || 1,
        totalPages: data.totalPages || 1,
        readAt: data.lastReadAt || new Date().toISOString(),
      });
    });

    await saveOfflineHistory(history);
    return history;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/history`);
    return await getOfflineHistory();
  }
}

export async function apiSaveReadingProgress(prog: ReadingProgress) {
  const currentUser = auth.currentUser;
  const now = new Date().toISOString();

  if (currentUser) {
    try {
      // 1. Update Progress
      const progRef = doc(db, 'users', currentUser.uid, 'progress', prog.mangaId);
      await setDoc(progRef, {
        mangaId: prog.mangaId,
        chapterId: prog.chapterId,
        chapterNumber: prog.chapterNumber,
        progress: prog.percentage,
        currentPage: prog.currentPage,
        totalPages: prog.totalPages,
        updatedAt: now,
      });

      // 2. Add/Update History
      const histDocId = `${prog.mangaId}_${prog.chapterId}`;
      const histRef = doc(db, 'users', currentUser.uid, 'history', histDocId);
      await setDoc(histRef, {
        mangaId: prog.mangaId,
        chapterId: prog.chapterId,
        chapterNumber: prog.chapterNumber,
        title: prog.mangaTitle,
        chapterTitle: prog.chapterTitle || '',
        coverUrl: prog.coverUrl || '',
        page: prog.currentPage,
        totalPages: prog.totalPages,
        lastReadAt: now,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/progress/${prog.mangaId}`);
    }
  }

  await saveOfflineProgress(prog);
}

export async function apiUpdateSettings(settings: Partial<UserSettings> & { preferredGenres?: string[]; preferredLanguages?: string[] }) {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const prefRef = doc(db, 'users', currentUser.uid, 'settings', 'preferences');
      await setDoc(prefRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/settings/preferences`);
    }
  }
}

// ==========================================
// 3. FAST MANGAFIRE SEARCH (ETAPA A & B)
// ==========================================

export async function apiSearchManga(
  queryText: string,
  limit: number = 24,
  signal?: AbortSignal
): Promise<{ results: MangaSearchPreview[]; total: number }> {
  const trimmed = queryText.trim();
  if (!trimmed) return { results: [], total: 0 };

  const cacheKey = `search:${trimmed.toLowerCase()}`;
  const cached = clientSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 15) {
    return { results: cached.results, total: cached.results.length };
  }

  // Cancel previous inflight search
  if (!signal) {
    if (currentSearchAbortController) {
      currentSearchAbortController.abort();
    }
    currentSearchAbortController = new AbortController();
  }

  try {
    const res = await client.get('/manga/search', {
      params: { q: trimmed, limit },
      signal: signal || currentSearchAbortController?.signal,
    });

    const items = res.data?.results || [];
    const previews: MangaSearchPreview[] = items.map((m: any) => ({
      id: m.id,
      title: m.title,
      coverUrl: m.coverUrl,
      description: m.description || '',
      source: 'MangaFire',
      sourceId: m.sourceId || 'mangafire',
      totalChapters: m.totalChapters,
      type: m.type,
      status: m.status,
      genres: m.genres || [],
    }));

    clientSearchCache.set(cacheKey, { results: previews, timestamp: Date.now() });
    return { results: previews, total: previews.length };
  } catch (err: any) {
    if (axios.isCancel(err) || err.name === 'CanceledError' || err.name === 'AbortError') {
      // Ignored canceled request
      return { results: [], total: 0 };
    }
    console.warn('apiSearchManga warning:', err);
    return { results: [], total: 0 };
  }
}

export async function apiGetDiscover(): Promise<{ popular: MangaItem[]; latest: MangaItem[] }> {
  try {
    const res = await client.get('/manga/discover');
    return res.data || { popular: [], latest: [] };
  } catch (err) {
    console.warn('apiGetDiscover warning:', err);
    return { popular: [], latest: [] };
  }
}

export async function apiGetMangaDetails(mangaId: string): Promise<MangaItem | null> {
  const cached = await getCachedManga(mangaId);
  if (cached) return cached;

  try {
    const res = await client.get(`/manga/${encodeURIComponent(mangaId)}`);
    if (res.data) {
      await cacheMangaForOffline(res.data);
      return res.data;
    }
    return null;
  } catch (err) {
    console.warn('apiGetMangaDetails warning:', err);
    return cached;
  }
}

export async function apiGetMangaChapters(mangaId: string): Promise<ChapterItem[]> {
  try {
    const res = await client.get(`/manga/${encodeURIComponent(mangaId)}/chapters`);
    return res.data?.chapters || [];
  } catch (err) {
    console.warn('apiGetMangaChapters warning:', err);
    return [];
  }
}

export async function apiGetChapterPages(chapterId: string): Promise<ChapterPagesResult> {
  try {
    const res = await client.get(`/chapter/${encodeURIComponent(chapterId)}/pages`);
    return res.data || { chapterId, pages: [], total: 0 };
  } catch (err) {
    console.warn('apiGetChapterPages warning:', err);
    return { chapterId, pages: [], total: 0 };
  }
}
