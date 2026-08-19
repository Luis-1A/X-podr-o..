export type LibraryCategory = 'reading' | 'plan_to_read' | 'completed' | 'on_hold' | 'dropped';

export interface User {
  id: string;
  username: string;
  email: string;
  isGuest?: boolean;
}

export interface UserProfile {
  displayName: string;
  avatar?: string;
  preferredGenres: string[];
  preferredLanguages: string[];
}

export interface UserSettings {
  reader_mode: 'webtoon' | 'single' | 'double';
  reading_direction: 'ltr' | 'rtl';
  page_fit: 'width' | 'height' | 'original';
  auto_download_next: number;
  keep_downloads: number;
  theme: 'dark' | 'light' | 'oled';
  preload_network?: 'wifi' | 'all' | 'off';
  max_cache_mb?: number;
  cache_retention_chapters?: number;
}

export interface MangaItem {
  id: string;
  sourceId: string;
  sourceName?: string;
  title: string;
  altTitles?: string[];
  description: string;
  coverUrl: string;
  author: string;
  artist: string;
  status: 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
  genres: string[];
  year?: number;
  contentRating?: string;
  availableLanguages?: string[];
  category?: LibraryCategory;
  totalChapters?: number;
  unreadCount?: number;
  addedAt?: string;
  updatedAt?: string;
  sources?: Array<{ sourceId: string; sourceName: string; mangaId: string }>;
  hasFallback?: boolean;
  sourceCount?: number;
  primarySource?: string;
}

export interface ChapterSourceAlternative {
  sourceId: string;
  sourceName: string;
  chapterId: string;
  originalChapterId?: string;
  pages?: number;
}

export interface ChapterItem {
  id: string;
  mangaId: string;
  volume: string | null;
  chapter: string;
  title: string | null;
  language: string;
  publishAt: string;
  pages: number;
  scanlationGroup?: string;
  sourceId?: string;
  sourceName?: string;
  originalChapterId?: string;
  alternativeSources?: ChapterSourceAlternative[];
  isGapFiller?: boolean;
}

export interface ChapterFeedResponse {
  chapters: ChapterItem[];
  meta?: {
    primarySource: string;
    totalChapters: number;
    sourcesCount: number;
    gapsFilledCount: number;
    sourcesUsed: Array<{ sourceId: string; sourceName: string; chapterCount: number }>;
  };
}

export interface AutoCachedChapter {
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterTitle?: string;
  pages: { pageNumber: number; blobUrl: string; dataUrl?: string }[];
  totalPages: number;
  downloadedPagesCount: number;
  isComplete: boolean;
  isBufferReady: boolean; // First 5 pages ready
  sizeBytes: number;
  cachedAt: number; // timestamp
  lastAccessedAt: number;
}

export interface ReadingProgress {
  id?: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterTitle?: string;
  coverUrl?: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  isCompleted: boolean;
  updatedAt: string;
}

export interface ReadingHistoryItem {
  id?: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterTitle?: string;
  coverUrl?: string;
  page: number;
  totalPages: number;
  readAt: string;
}

export interface DownloadedChapter {
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterTitle?: string;
  coverUrl?: string;
  pageCount: number;
  pages: { pageNumber: number; dataUrl: string }[];
  sizeBytes: number;
  downloadedAt: string;
}

export interface DownloadQueueItem {
  id: string;
  chapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterTitle?: string;
  coverUrl?: string;
  status: 'downloading' | 'queued' | 'completed' | 'failed';
  totalPages: number;
  downloadedPages: number;
  progressPercent: number;
  error?: string;
}

export interface ChapterPagesResult {
  chapterId: string;
  pages: string[];
  total: number;
}

export interface MangaSearchPreview {
  id: string;
  title: string;
  coverUrl: string;
  description: string;
  source: string;
  sourceId: string;
  totalChapters?: number;
  type?: string;
  status?: string;
  genres?: string[];
  isComplete?: boolean;
}

export interface ExtensionItem {
  id: string;
  name: string;
  pkg: string;
  version: string;
  lang: string;
  isNsfw: boolean;
  icon: string | null;
  sources: Array<{ name: string; id: string; baseUrl: string }>;
  isEnabled?: boolean;
}

