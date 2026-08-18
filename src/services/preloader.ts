import { ChapterItem, MangaItem, AutoCachedChapter } from '../types';
import { apiGetChapterPages, getProxiedImageUrl } from './api';
import {
  getAutoCachedChapter,
  saveAutoCachedChapter,
  getDownloadedChapter,
  performAutoCacheCleanup,
} from './storage';

export type PreloadStatus = 'idle' | 'buffering_initial' | 'reading_ready' | 'downloading_full' | 'completed' | 'error';

export interface PreloadProgressEvent {
  chapterId: string;
  mangaId: string;
  status: PreloadStatus;
  total: number;
  loadedCount: number;
  percent: number;
  isBufferReady: boolean; // First 5 pages loaded
  pageUrls: string[]; // Blob or proxied URLs ready for immediate rendering
  error?: string;
}

type PreloadListener = (event: PreloadProgressEvent) => void;

interface ChapterQueueItem {
  chapter: ChapterItem;
  manga: MangaItem;
  nextChapter?: ChapterItem | null;
  pageUrls: string[];
  loadedBlobs: Map<number, { blobUrl: string; sizeBytes: number; dataUrl?: string }>;
  status: PreloadStatus;
  currentReadingPage: number;
  abortController: AbortController | null;
}

class PreloaderEngine {
  private activeChapterId: string | null = null;
  private queue: Map<string, ChapterQueueItem> = new Map();
  private listeners: Set<PreloadListener> = new Set();
  private memoryBlobCache: Map<string, string[]> = new Map(); // chapterId -> array of blob URLs
  private isProcessing: boolean = false;
  private isOnline: boolean = navigator.onLine;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.resumeActivePreloads();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  public subscribe(listener: PreloadListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: PreloadProgressEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in preloader listener:', err);
      }
    });
  }

  /**
   * Starts or attaches to intelligent preloading for a chapter.
   * Priority:
   * 1. Check if already in Manual Downloads (Instant)
   * 2. Check if already in Auto-Cache (Instant)
   * 3. Fetch Chapter Page List
   * 4. Prioritize FIRST 5 PAGES buffer -> Liberate Reading immediately (isBufferReady = true)
   * 5. Download remaining pages in background
   * 6. Once full chapter is downloaded, automatically start preloading NEXT chapter!
   */
  public async loadChapter(
    chapter: ChapterItem,
    manga: MangaItem,
    nextChapter?: ChapterItem | null,
    initialReadingPage: number = 1
  ): Promise<{
    pages: string[];
    isBufferReady: boolean;
    isFullyLoaded: boolean;
  }> {
    this.activeChapterId = chapter.id;

    // 1. Check in-memory blob cache
    if (this.memoryBlobCache.has(chapter.id)) {
      const cachedPages = this.memoryBlobCache.get(chapter.id)!;
      this.notify({
        chapterId: chapter.id,
        mangaId: manga.id,
        status: 'completed',
        total: cachedPages.length,
        loadedCount: cachedPages.length,
        percent: 100,
        isBufferReady: true,
        pageUrls: cachedPages,
      });

      // Also trigger background preload for next chapter if present
      if (nextChapter) {
        this.preloadNextChapterInBackground(nextChapter, manga);
      }

      return { pages: cachedPages, isBufferReady: true, isFullyLoaded: true };
    }

    // 2. Check manual user downloads in IndexedDB (Highest Priority)
    const downloaded = await getDownloadedChapter(chapter.id);
    if (downloaded && downloaded.pages && downloaded.pages.length > 0) {
      const pageUrls = downloaded.pages.map((p) => p.dataUrl);
      this.memoryBlobCache.set(chapter.id, pageUrls);
      this.notify({
        chapterId: chapter.id,
        mangaId: manga.id,
        status: 'completed',
        total: pageUrls.length,
        loadedCount: pageUrls.length,
        percent: 100,
        isBufferReady: true,
        pageUrls,
      });

      if (nextChapter) {
        this.preloadNextChapterInBackground(nextChapter, manga);
      }

      return { pages: pageUrls, isBufferReady: true, isFullyLoaded: true };
    }

    // 3. Check Auto-Cached Chapters in IndexedDB
    const autoCached = await getAutoCachedChapter(chapter.id);
    if (autoCached && autoCached.pages && autoCached.pages.length > 0 && autoCached.isBufferReady) {
      const pageUrls = autoCached.pages.map((p) => p.dataUrl || p.blobUrl);
      this.memoryBlobCache.set(chapter.id, pageUrls);
      this.notify({
        chapterId: chapter.id,
        mangaId: manga.id,
        status: autoCached.isComplete ? 'completed' : 'reading_ready',
        total: autoCached.totalPages,
        loadedCount: autoCached.downloadedPagesCount,
        percent: Math.round((autoCached.downloadedPagesCount / autoCached.totalPages) * 100),
        isBufferReady: true,
        pageUrls,
      });

      if (!autoCached.isComplete) {
        // Continue downloading the rest in background
        this.startBackgroundPreloadQueue(chapter, manga, nextChapter, initialReadingPage);
      } else if (nextChapter) {
        this.preloadNextChapterInBackground(nextChapter, manga);
      }

      return {
        pages: pageUrls,
        isBufferReady: true,
        isFullyLoaded: autoCached.isComplete,
      };
    }

    // 4. Start fresh preloading queue
    return this.startBackgroundPreloadQueue(chapter, manga, nextChapter, initialReadingPage);
  }

  /**
   * Initializes queue, prioritizes first 5 pages, and streams rest in background.
   */
  private async startBackgroundPreloadQueue(
    chapter: ChapterItem,
    manga: MangaItem,
    nextChapter?: ChapterItem | null,
    readingPage: number = 1
  ): Promise<{
    pages: string[];
    isBufferReady: boolean;
    isFullyLoaded: boolean;
  }> {
    let queueItem = this.queue.get(chapter.id);
    if (!queueItem) {
      queueItem = {
        chapter,
        manga,
        nextChapter,
        pageUrls: [],
        loadedBlobs: new Map(),
        status: 'buffering_initial',
        currentReadingPage: readingPage,
        abortController: new AbortController(),
      };
      this.queue.set(chapter.id, queueItem);
    } else {
      queueItem.currentReadingPage = readingPage;
      queueItem.nextChapter = nextChapter;
    }

    // Fetch page URLs from API if not already fetched
    if (queueItem.pageUrls.length === 0) {
      try {
        const pagesRes = await apiGetChapterPages(chapter.id);
        if (!pagesRes || !pagesRes.pages || pagesRes.pages.length === 0) {
          throw new Error('Nenhuma página disponível para este capítulo.');
        }
        queueItem.pageUrls = pagesRes.pages;
      } catch (err: any) {
        queueItem.status = 'error';
        this.notify({
          chapterId: chapter.id,
          mangaId: manga.id,
          status: 'error',
          total: 0,
          loadedCount: 0,
          percent: 0,
          isBufferReady: false,
          pageUrls: [],
          error: err.message || 'Falha ao buscar lista de páginas.',
        });
        throw err;
      }
    }

    // Trigger processing
    this.processQueue();

    // Wait for either the first 5 pages (Buffer Ready) or total available if < 5
    const initialBufferTarget = Math.min(5, queueItem.pageUrls.length);
    const isAlreadyBufferReady = queueItem.loadedBlobs.size >= initialBufferTarget;

    if (isAlreadyBufferReady) {
      const urls = this.buildCurrentPageUrlList(queueItem);
      return {
        pages: urls,
        isBufferReady: true,
        isFullyLoaded: queueItem.loadedBlobs.size >= queueItem.pageUrls.length,
      };
    }

    // Await first 5 pages buffer resolution
    return new Promise((resolve) => {
      const checkBuffer = () => {
        const item = this.queue.get(chapter.id);
        if (!item) {
          resolve({ pages: [], isBufferReady: false, isFullyLoaded: false });
          return;
        }

        const readyCount = item.loadedBlobs.size;
        const target = Math.min(5, item.pageUrls.length);

        if (readyCount >= target || item.status === 'reading_ready' || item.status === 'completed') {
          const urls = this.buildCurrentPageUrlList(item);
          resolve({
            pages: urls,
            isBufferReady: true,
            isFullyLoaded: item.status === 'completed',
          });
        }
      };

      const unsubscribe = this.subscribe((event) => {
        if (event.chapterId === chapter.id) {
          if (event.isBufferReady || event.status === 'completed' || event.status === 'error') {
            unsubscribe();
            checkBuffer();
          }
        }
      });

      // Safety timeout fallback (5 seconds) so reading is never blocked indefinitely
      setTimeout(() => {
        unsubscribe();
        const item = this.queue.get(chapter.id);
        if (item) {
          const urls = this.buildCurrentPageUrlList(item);
          resolve({
            pages: urls.length > 0 ? urls : item.pageUrls.map(getProxiedImageUrl),
            isBufferReady: true,
            isFullyLoaded: false,
          });
        }
      }, 5000);
    });
  }

  /**
   * Called when user flips pages or scrolls to inform the preloader of reading position.
   * Dynamically adjusts page download priority to keep ahead of reader's velocity.
   */
  public updateReadingPosition(chapterId: string, pageNumber: number) {
    const queueItem = this.queue.get(chapterId);
    if (queueItem) {
      queueItem.currentReadingPage = pageNumber;
      // Trigger processing loop to re-sort priority based on new reading position
      this.processQueue();
    }
  }

  /**
   * Builds an ordered list of page URLs using blob URLs where downloaded, and proxied URLs for pending
   */
  private buildCurrentPageUrlList(item: ChapterQueueItem): string[] {
    return item.pageUrls.map((remoteUrl, idx) => {
      const cached = item.loadedBlobs.get(idx);
      if (cached && (cached.blobUrl || cached.dataUrl)) {
        return cached.blobUrl || cached.dataUrl!;
      }
      return getProxiedImageUrl(remoteUrl);
    });
  }

  /**
   * Main Queue Processing Engine
   */
  private async processQueue() {
    if (this.isProcessing || !this.isOnline) return;
    this.isProcessing = true;

    try {
      // Prioritize active chapter first, then next chapters
      const activeId = this.activeChapterId;
      const queueItems = Array.from(this.queue.values()).sort((a, b) => {
        if (a.chapter.id === activeId) return -1;
        if (b.chapter.id === activeId) return 1;
        return 0;
      });

      for (const item of queueItems) {
        if (item.status === 'completed' || item.pageUrls.length === 0) continue;

        // Calculate download priority order based on reading position & initial buffer
        const total = item.pageUrls.length;
        const currentPos = item.currentReadingPage - 1; // 0-indexed

        // Priority ordering:
        // 1. Initial 5 pages: [0, 1, 2, 3, 4]
        // 2. Ahead of user: [currentPos, currentPos+1, currentPos+2, ...]
        // 3. Rest of the chapter
        const priorityOrder: number[] = [];

        // First 5 pages always top priority if not loaded yet
        for (let i = 0; i < Math.min(5, total); i++) {
          if (!item.loadedBlobs.has(i)) priorityOrder.push(i);
        }

        // Lookahead buffer from current reading position (next 10 pages)
        for (let i = Math.max(0, currentPos); i < Math.min(total, currentPos + 10); i++) {
          if (!item.loadedBlobs.has(i) && !priorityOrder.includes(i)) {
            priorityOrder.push(i);
          }
        }

        // All remaining pages
        for (let i = 0; i < total; i++) {
          if (!item.loadedBlobs.has(i) && !priorityOrder.includes(i)) {
            priorityOrder.push(i);
          }
        }

        // Concurrently download batches of up to 4 pages
        const BATCH_SIZE = 4;
        for (let i = 0; i < priorityOrder.length; i += BATCH_SIZE) {
          const batch = priorityOrder.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async (pageIdx) => {
              await this.downloadSinglePage(item, pageIdx);
            })
          );

          // Check if buffer is ready (first 5 pages)
          const first5Count = Math.min(5, total);
          let initialBufferComplete = true;
          for (let k = 0; k < first5Count; k++) {
            if (!item.loadedBlobs.has(k)) {
              initialBufferComplete = false;
              break;
            }
          }

          const currentLoadedCount = item.loadedBlobs.size;
          const percent = Math.round((currentLoadedCount / total) * 100);

          if (initialBufferComplete && item.status === 'buffering_initial') {
            item.status = 'reading_ready';
            const pageUrls = this.buildCurrentPageUrlList(item);
            this.notify({
              chapterId: item.chapter.id,
              mangaId: item.manga.id,
              status: 'reading_ready',
              total,
              loadedCount: currentLoadedCount,
              percent,
              isBufferReady: true,
              pageUrls,
            });
          } else {
            this.notify({
              chapterId: item.chapter.id,
              mangaId: item.manga.id,
              status: item.status,
              total,
              loadedCount: currentLoadedCount,
              percent,
              isBufferReady: initialBufferComplete,
              pageUrls: this.buildCurrentPageUrlList(item),
            });
          }
        }

        // Check if entire chapter is finished
        if (item.loadedBlobs.size >= total) {
          item.status = 'completed';
          const finalPageUrls = this.buildCurrentPageUrlList(item);
          this.memoryBlobCache.set(item.chapter.id, finalPageUrls);

          // Persist full chapter into IndexedDB auto_cached_chapters store
          const pagesToSave: { pageNumber: number; blobUrl: string; dataUrl?: string }[] = [];
          let totalBytes = 0;
          for (let idx = 0; idx < total; idx++) {
            const b = item.loadedBlobs.get(idx);
            if (b) {
              pagesToSave.push({ pageNumber: idx + 1, blobUrl: b.blobUrl, dataUrl: b.dataUrl });
              totalBytes += b.sizeBytes || 0;
            }
          }

          const autoCachedObj: AutoCachedChapter = {
            chapterId: item.chapter.id,
            mangaId: item.manga.id,
            mangaTitle: item.manga.title,
            chapterNumber: item.chapter.chapter,
            chapterTitle: item.chapter.title || undefined,
            pages: pagesToSave,
            totalPages: total,
            downloadedPagesCount: total,
            isComplete: true,
            isBufferReady: true,
            sizeBytes: totalBytes,
            cachedAt: Date.now(),
            lastAccessedAt: Date.now(),
          };

          await saveAutoCachedChapter(autoCachedObj);

          // Perform Rolling Auto-Cache Cleanup (Keep 3 recent chapters, limit total size)
          await performAutoCacheCleanup(item.manga.id, 3, 500);

          this.notify({
            chapterId: item.chapter.id,
            mangaId: item.manga.id,
            status: 'completed',
            total,
            loadedCount: total,
            percent: 100,
            isBufferReady: true,
            pageUrls: finalPageUrls,
          });

          // Next Chapter Preload Initiation
          if (item.nextChapter) {
            this.preloadNextChapterInBackground(item.nextChapter, item.manga);
          }
        }
      }
    } catch (err) {
      console.error('Error in preloader queue process:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Fetches single page image via proxy, creates Blob URL and Data URL
   */
  private async downloadSinglePage(item: ChapterQueueItem, pageIndex: number): Promise<void> {
    if (item.loadedBlobs.has(pageIndex)) return;

    const rawUrl = item.pageUrls[pageIndex];
    if (!rawUrl) return;

    const proxiedUrl = getProxiedImageUrl(rawUrl);

    try {
      const response = await fetch(proxiedUrl, {
        signal: item.abortController?.signal,
      });

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const sizeBytes = blob.size;

      // Convert to DataURL for IndexedDB persistence
      const dataUrl = await this.blobToDataUrl(blob);

      item.loadedBlobs.set(pageIndex, {
        blobUrl,
        sizeBytes,
        dataUrl,
      });
    } catch (err) {
      // Non-blocking: will fallback to network stream on render
      console.warn(`Could not preload page ${pageIndex + 1}:`, err);
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Starts preloading the next chapter silently in the background
   */
  public async preloadNextChapterInBackground(nextChapter: ChapterItem, manga: MangaItem) {
    if (!nextChapter || !this.isOnline) return;

    // Check if next chapter is already cached or in queue
    if (this.memoryBlobCache.has(nextChapter.id) || this.queue.has(nextChapter.id)) {
      return;
    }

    const downloaded = await getDownloadedChapter(nextChapter.id);
    if (downloaded) return;

    const autoCached = await getAutoCachedChapter(nextChapter.id);
    if (autoCached && autoCached.isComplete) return;

    // Enqueue next chapter
    const queueItem: ChapterQueueItem = {
      chapter: nextChapter,
      manga,
      pageUrls: [],
      loadedBlobs: new Map(),
      status: 'buffering_initial',
      currentReadingPage: 1,
      abortController: new AbortController(),
    };

    this.queue.set(nextChapter.id, queueItem);

    try {
      const pagesRes = await apiGetChapterPages(nextChapter.id);
      if (pagesRes && pagesRes.pages && pagesRes.pages.length > 0) {
        queueItem.pageUrls = pagesRes.pages;
        this.processQueue();
      }
    } catch (e) {
      // Silent failure for background speculative next chapter
    }
  }

  private resumeActivePreloads() {
    this.processQueue();
  }

  /**
   * Cleans up in-memory blob URLs when closing reader
   */
  public clearSessionCache(keepChapterId?: string) {
    this.queue.forEach((item, id) => {
      if (id !== keepChapterId) {
        item.abortController?.abort();
        item.loadedBlobs.forEach((b) => {
          if (b.blobUrl && b.blobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(b.blobUrl);
          }
        });
      }
    });

    if (!keepChapterId) {
      this.queue.clear();
      this.memoryBlobCache.clear();
      this.activeChapterId = null;
    }
  }
}

export const preloader = new PreloaderEngine();
