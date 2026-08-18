import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { DownloadedChapter, DownloadQueueItem } from '../types';
import {
  calculateStorageUsage,
  deleteDownloadedChapter,
  getAllDownloadedChapters,
  getDownloadedChapter,
} from '../services/storage';
import { downloadChapterWithProgress } from '../services/api';

interface DownloadContextType {
  queue: DownloadQueueItem[];
  downloadedChapters: Map<string, DownloadedChapter>;
  storageStats: { bytes: number; formatted: string; chapterCount: number };
  isDownloading: boolean;
  queueChapter: (chapter: {
    id: string;
    mangaId: string;
    chapterNumber: string;
    chapterTitle?: string;
    mangaTitle: string;
    coverUrl?: string;
  }) => void;
  queueBatchChapters: (chapters: Array<{
    id: string;
    mangaId: string;
    chapterNumber: string;
    chapterTitle?: string;
    mangaTitle: string;
    coverUrl?: string;
  }>) => void;
  removeDownloadedChapter: (chapterId: string) => Promise<void>;
  refreshStorageStats: () => Promise<void>;
  isChapterDownloaded: (chapterId: string) => boolean;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<DownloadQueueItem[]>([]);
  const [downloadedChapters, setDownloadedChapters] = useState<Map<string, DownloadedChapter>>(new Map());
  const [storageStats, setStorageStats] = useState({ bytes: 0, formatted: '0 B', chapterCount: 0 });
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Load existing downloaded chapters from IndexedDB
  const refreshStorageStats = useCallback(async () => {
    try {
      const chapters = await getAllDownloadedChapters();
      const map = new Map<string, DownloadedChapter>();
      for (const ch of chapters) {
        map.set(ch.chapterId, ch);
      }
      setDownloadedChapters(map);

      const stats = await calculateStorageUsage();
      setStorageStats(stats);
    } catch (err) {
      console.error('Error refreshing downloaded chapters:', err);
    }
  }, []);

  useEffect(() => {
    refreshStorageStats();
  }, [refreshStorageStats]);

  const queueChapter = useCallback((chapter: {
    id: string;
    mangaId: string;
    chapterNumber: string;
    chapterTitle?: string;
    mangaTitle: string;
    coverUrl?: string;
  }) => {
    if (downloadedChapters.has(chapter.id)) return;

    setQueue((prev) => {
      // Avoid duplicate queueing
      if (prev.some((item) => item.chapterId === chapter.id)) return prev;

      const newItem: DownloadQueueItem = {
        id: 'q_' + chapter.id,
        chapterId: chapter.id,
        mangaId: chapter.mangaId,
        mangaTitle: chapter.mangaTitle,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.chapterTitle,
        coverUrl: chapter.coverUrl,
        status: 'queued',
        totalPages: 0,
        downloadedPages: 0,
        progressPercent: 0,
      };
      return [...prev, newItem];
    });
  }, [downloadedChapters]);

  const queueBatchChapters = useCallback((chapters: Array<{
    id: string;
    mangaId: string;
    chapterNumber: string;
    chapterTitle?: string;
    mangaTitle: string;
    coverUrl?: string;
  }>) => {
    setQueue((prev) => {
      const newItems: DownloadQueueItem[] = [];
      for (const ch of chapters) {
        if (!downloadedChapters.has(ch.id) && !prev.some((p) => p.chapterId === ch.id)) {
          newItems.push({
            id: 'q_' + ch.id,
            chapterId: ch.id,
            mangaId: ch.mangaId,
            mangaTitle: ch.mangaTitle,
            chapterNumber: ch.chapterNumber,
            chapterTitle: ch.chapterTitle,
            coverUrl: ch.coverUrl,
            status: 'queued',
            totalPages: 0,
            downloadedPages: 0,
            progressPercent: 0,
          });
        }
      }
      return [...prev, ...newItems];
    });
  }, [downloadedChapters]);

  const removeDownloadedChapter = useCallback(async (chapterId: string) => {
    await deleteDownloadedChapter(chapterId);
    setDownloadedChapters((prev) => {
      const next = new Map(prev);
      next.delete(chapterId);
      return next;
    });
    await refreshStorageStats();
  }, [refreshStorageStats]);

  const isChapterDownloaded = useCallback((chapterId: string) => {
    return downloadedChapters.has(chapterId);
  }, [downloadedChapters]);

  // Queue worker
  useEffect(() => {
    if (isProcessingQueue || queue.length === 0) return;

    const nextItem = queue.find((item) => item.status === 'queued');
    if (!nextItem) return;

    setIsProcessingQueue(true);

    // Update status to downloading
    setQueue((prev) =>
      prev.map((item) => (item.id === nextItem.id ? { ...item, status: 'downloading' } : item))
    );

    downloadChapterWithProgress(
      {
        id: nextItem.chapterId,
        mangaId: nextItem.mangaId,
        chapterNumber: nextItem.chapterNumber,
        chapterTitle: nextItem.chapterTitle,
        mangaTitle: nextItem.mangaTitle,
        coverUrl: nextItem.coverUrl,
      },
      (p) => {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? {
                  ...item,
                  totalPages: p.total,
                  downloadedPages: p.current,
                  progressPercent: p.percent,
                }
              : item
          )
        );
      }
    )
      .then(async (savedChapter) => {
        setDownloadedChapters((prev) => new Map(prev).set(savedChapter.chapterId, savedChapter));
        setQueue((prev) => prev.filter((item) => item.id !== nextItem.id));
        await refreshStorageStats();
      })
      .catch((err) => {
        console.error('Download item failed:', err);
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? { ...item, status: 'failed', error: err.message || 'Falha no download' }
              : item
          )
        );
      })
      .finally(() => {
        setIsProcessingQueue(false);
      });
  }, [queue, isProcessingQueue, refreshStorageStats]);

  return (
    <DownloadContext.Provider
      value={{
        queue,
        downloadedChapters,
        storageStats,
        isDownloading: isProcessingQueue,
        queueChapter,
        queueBatchChapters,
        removeDownloadedChapter,
        refreshStorageStats,
        isChapterDownloaded,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export function useDownloads() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}
