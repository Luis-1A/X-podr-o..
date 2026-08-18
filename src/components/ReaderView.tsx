import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChapterItem, MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiSaveProgress, getProxiedImageUrl } from '../services/api';
import { getDownloadedChapter, getAutoCachedChapter } from '../services/storage';
import { preloader, PreloadProgressEvent } from '../services/preloader';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  Zap,
} from 'lucide-react';

interface ReaderViewProps {
  chapter: ChapterItem;
  manga: MangaItem;
  allChapters?: ChapterItem[];
  initialPage?: number;
  onClose: () => void;
  onSelectChapter: (nextChapter: ChapterItem) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  chapter,
  manga,
  allChapters = [],
  initialPage = 1,
  onClose,
  onSelectChapter,
}) => {
  const { isOnline, settings } = useAuth();

  // Reader Modes: 'webtoon' (vertical scroll), 'single' (paged), 'double' (spread)
  const [readerMode, setReaderMode] = useState<'webtoon' | 'single' | 'double'>(
    settings?.reader_mode || 'webtoon'
  );
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>(
    settings?.reading_direction || 'ltr'
  );

  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfflineLoaded, setIsOfflineLoaded] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [preloadStatus, setPreloadStatus] = useState<{
    percent: number;
    loadedCount: number;
    total: number;
    isComplete: boolean;
  }>({
    percent: 0,
    loadedCount: 0,
    total: 0,
    isComplete: false,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastSavedPageRef = useRef<number>(initialPage);

  // Find next and previous chapters
  const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;
  const nextChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;

  // Load chapter using Intelligent Progressive Preloader
  useEffect(() => {
    let isMounted = true;

    async function initializeReader() {
      setLoading(true);
      setError(null);

      // Check if user has manual download in IndexedDB first
      const manualDownload = await getDownloadedChapter(chapter.id);
      if (manualDownload && manualDownload.pages && manualDownload.pages.length > 0) {
        if (isMounted) {
          const dlPages = manualDownload.pages.map((p) => p.dataUrl);
          setPages(dlPages);
          setIsOfflineLoaded(true);
          setLoading(false);
          setPreloadStatus({
            percent: 100,
            loadedCount: dlPages.length,
            total: dlPages.length,
            isComplete: true,
          });
        }
        return;
      }

      // Check if chapter is already in auto-cache
      const autoCached = await getAutoCachedChapter(chapter.id);
      if (autoCached && autoCached.pages && autoCached.pages.length > 0) {
        const cachedUrls = autoCached.pages.map((p) => p.dataUrl || p.blobUrl);
        if (isMounted) {
          setPages(cachedUrls);
          setIsOfflineLoaded(true);
          setLoading(false);
          setPreloadStatus({
            percent: autoCached.isComplete ? 100 : Math.round((autoCached.downloadedPagesCount / autoCached.totalPages) * 100),
            loadedCount: autoCached.downloadedPagesCount,
            total: autoCached.totalPages,
            isComplete: autoCached.isComplete,
          });
        }
        if (autoCached.isComplete) {
          // Preload next chapter speculatively in background
          if (nextChapter) {
            preloader.preloadNextChapterInBackground(nextChapter, manga);
          }
          return;
        }
      }

      if (!isOnline && (!manualDownload && !autoCached)) {
        if (isMounted) {
          setError('Este capítulo não foi baixado e não está disponível no modo offline.');
          setLoading(false);
        }
        return;
      }

      // Start Progressive Preloader: downloads 5-page buffer, then releases reader, then downloads rest
      try {
        const result = await preloader.loadChapter(chapter, manga, nextChapter, initialPage);
        if (isMounted && result.pages.length > 0) {
          setPages(result.pages);
          setLoading(false);
        }
      } catch (err: any) {
        console.error('Preloader initialization error:', err);
        if (isMounted) {
          setError(err.message || 'Erro ao carregar imagens do capítulo.');
          setLoading(false);
        }
      }
    }

    // Subscribe to preloader events to receive updated blob URLs and progress in real-time
    const unsubscribe = preloader.subscribe((event: PreloadProgressEvent) => {
      if (!isMounted || event.chapterId !== chapter.id) return;

      if (event.pageUrls && event.pageUrls.length > 0) {
        setPages(event.pageUrls);
      }

      if (event.isBufferReady || event.status === 'reading_ready' || event.status === 'completed') {
        setLoading(false);
      }

      if (event.status === 'error' && event.error) {
        setError(event.error);
        setLoading(false);
      }

      setPreloadStatus({
        percent: event.percent,
        loadedCount: event.loadedCount,
        total: event.total,
        isComplete: event.status === 'completed',
      });
    });

    initializeReader();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [chapter.id, isOnline]);

  // Save progress helper (Purely based on user's actual reading page, never altered by preloader)
  const saveCurrentProgress = useCallback(
    async (page: number, total: number) => {
      if (total <= 0) return;
      lastSavedPageRef.current = page;

      const progressData: ReadingProgress = {
        mangaId: manga.id,
        chapterId: chapter.id,
        mangaTitle: manga.title,
        chapterNumber: chapter.chapter,
        chapterTitle: chapter.title || undefined,
        coverUrl: manga.coverUrl,
        currentPage: page,
        totalPages: total,
        percentage: Math.min(100, Math.round((page / total) * 100)),
        isCompleted: page >= total,
        updatedAt: new Date().toISOString(),
      };

      await apiSaveProgress(progressData, isOnline);
    },
    [chapter, manga, isOnline]
  );

  // Scroll to initial page when pages are loaded (for Webtoon mode)
  useEffect(() => {
    if (pages.length > 0 && initialPage > 1 && readerMode === 'webtoon') {
      setTimeout(() => {
        const targetElement = pageRefs.current[initialPage - 1];
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
  }, [pages.length, initialPage, readerMode]);

  // Observer for Webtoon vertical scroll mode to update current page and notify Preloader
  useEffect(() => {
    if (readerMode !== 'webtoon' || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageIndex = Number(entry.target.getAttribute('data-page-index'));
            if (!isNaN(pageIndex) && pageIndex + 1 !== currentPage) {
              const newPage = pageIndex + 1;
              setCurrentPage(newPage);
              saveCurrentProgress(newPage, pages.length);
              // Dynamic Ahead-of-Page Prioritization: Notify preloader of reader's velocity
              preloader.updateReadingPosition(chapter.id, newPage);
            }
          }
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -50% 0px',
        threshold: 0.1,
      }
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [readerMode, pages.length, currentPage, saveCurrentProgress, chapter.id]);

  // Manual Page change for Single / Double mode
  const handlePageChange = (newPage: number) => {
    const clamped = Math.max(1, Math.min(newPage, pages.length));
    setCurrentPage(clamped);
    saveCurrentProgress(clamped, pages.length);
    preloader.updateReadingPosition(chapter.id, clamped);

    if (readerMode === 'webtoon') {
      const el = pageRefs.current[clamped - 1];
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPage < pages.length) {
      handlePageChange(currentPage + (readerMode === 'double' ? 2 : 1));
    } else if (nextChapter) {
      onSelectChapter(nextChapter);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      handlePageChange(currentPage - (readerMode === 'double' ? 2 : 1));
    } else if (prevChapter) {
      onSelectChapter(prevChapter);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (readingDirection === 'ltr') handleNextPage();
        else handlePrevPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (readingDirection === 'ltr') handlePrevPage();
        else handleNextPage();
      } else if (e.key === 'f') {
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      id="reader-view-fullscreen"
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none overflow-hidden"
    >
      {/* FLOATING TOP OVERLAY */}
      <div
        className={`fixed top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/95 via-black/70 to-transparent p-4 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        }`}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              id="reader-back-btn"
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-200 hover:text-white border border-neutral-800 transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-tight line-clamp-1">
                {manga.title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="text-rose-400 font-semibold">Capítulo {chapter.chapter}</span>
                {chapter.title && <span className="line-clamp-1">• {chapter.title}</span>}
                {isOfflineLoaded && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded">
                    Offline
                  </span>
                )}
                {/* Background Preload Subtle Indicator */}
                {!isOfflineLoaded && preloadStatus.total > 0 && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium transition ${
                      preloadStatus.isComplete
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                    }`}
                    title={
                      preloadStatus.isComplete
                        ? 'Capítulo completo baixado e preparado em cache local'
                        : `Pré-carregando em segundo plano: ${preloadStatus.loadedCount}/${preloadStatus.total} páginas`
                    }
                  >
                    {preloadStatus.isComplete ? (
                      <>
                        <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" /> Pronto
                      </>
                    ) : (
                      <>
                        <DownloadCloud className="w-3 h-3 text-rose-400 animate-pulse" /> {preloadStatus.percent}%
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            {/* Page Count Indicator */}
            {pages.length > 0 && (
              <span className="px-3 py-1.5 bg-neutral-900/90 border border-neutral-800 rounded-xl text-neutral-300 font-mono font-medium">
                {currentPage} / {pages.length}
              </span>
            )}

            {/* Mode Toggle Button */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-0.5 hidden sm:flex">
              <button
                type="button"
                onClick={() => setReaderMode('webtoon')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readerMode === 'webtoon' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Webtoon
              </button>
              <button
                type="button"
                onClick={() => setReaderMode('single')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  readerMode === 'single' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Página
              </button>
            </div>

            {/* Fullscreen button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 transition cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* READER CONTENT AREA */}
      <div
        id="reader-canvas-container"
        onClick={() => setShowControls(!showControls)}
        className="flex-1 overflow-y-auto overflow-x-hidden flex justify-center items-start relative cursor-default"
      >
        {loading ? (
          <div className="m-auto text-center space-y-3 p-8">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
            <p className="text-sm font-medium text-neutral-300">Preparando buffer inicial de páginas...</p>
            <p className="text-xs text-neutral-500">Liberando leitura instantânea em poucos segundos</p>
          </div>
        ) : error ? (
          <div className="m-auto text-center space-y-4 p-8 max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Falha ao carregar capítulo</h3>
            <p className="text-xs text-neutral-400">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Voltar aos detalhes
            </button>
          </div>
        ) : readerMode === 'webtoon' ? (
          /* WEBTOON MODE (Continuous Vertical Scroll) */
          <div
            className="w-full flex flex-col items-center space-y-1 py-4 sm:py-8"
            style={{ maxWidth: `${Math.max(600, zoomLevel * 8)}px` }}
          >
            {pages.map((imgUrl, index) => (
              <div
                key={index}
                ref={(el) => (pageRefs.current[index] = el)}
                data-page-index={index}
                className="w-full relative flex justify-center bg-black min-h-[300px]"
              >
                <img
                  src={imgUrl.startsWith('blob:') || imgUrl.startsWith('data:') ? imgUrl : getProxiedImageUrl(imgUrl)}
                  alt={`Página ${index + 1}`}
                  className="w-full h-auto object-contain shadow-2xl"
                  referrerPolicy="no-referrer"
                  loading={index < 5 ? 'eager' : 'lazy'}
                />
              </div>
            ))}

            {/* END OF CHAPTER BANNER */}
            <div className="w-full max-w-lg p-8 my-12 bg-neutral-950 border border-neutral-800 rounded-3xl text-center space-y-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div>
                <h4 className="text-base font-bold text-white">Fim do Capítulo {chapter.chapter}</h4>
                <p className="text-xs text-neutral-400 mt-1">Progresso salvo com sucesso!</p>
              </div>

              <div className="flex gap-3 justify-center pt-2">
                {nextChapter ? (
                  <button
                    type="button"
                    onClick={() => onSelectChapter(nextChapter)}
                    className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold rounded-xl text-xs transition shadow-lg shadow-rose-900/30 flex items-center gap-2 cursor-pointer"
                  >
                    Próximo: Capítulo {nextChapter.chapter} <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl text-xs cursor-pointer"
                  >
                    Voltar aos detalhes
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* SINGLE / PAGED HORIZONTAL MODE */
          <div className="w-full h-full flex items-center justify-center relative p-4">
            <div className="max-w-4xl max-h-[88vh] flex items-center justify-center">
              {pages[currentPage - 1] && (
                <img
                  src={
                    pages[currentPage - 1].startsWith('blob:') || pages[currentPage - 1].startsWith('data:')
                      ? pages[currentPage - 1]
                      : getProxiedImageUrl(pages[currentPage - 1])
                  }
                  alt={`Página ${currentPage}`}
                  className="max-h-[85vh] w-auto object-contain rounded shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            {/* Click zones for page flipping */}
            <div
              className="absolute top-0 bottom-0 left-0 w-1/3 cursor-w-resize"
              onClick={(e) => {
                e.stopPropagation();
                if (readingDirection === 'ltr') handlePrevPage();
                else handleNextPage();
              }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 w-1/3 cursor-e-resize"
              onClick={(e) => {
                e.stopPropagation();
                if (readingDirection === 'ltr') handleNextPage();
                else handlePrevPage();
              }}
            />
          </div>
        )}
      </div>

      {/* FLOATING BOTTOM OVERLAY CONTROLS */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-4 pb-6 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
        }`}
      >
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Scrubber slider */}
          {pages.length > 1 && (
            <div className="flex items-center space-x-3 bg-neutral-950/80 border border-neutral-800/80 rounded-2xl px-4 py-2.5 backdrop-blur-md">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={currentPage <= 1 && !prevChapter}
                className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <input
                id="reader-page-slider"
                type="range"
                min={1}
                max={pages.length}
                value={currentPage}
                onChange={(e) => handlePageChange(parseInt(e.target.value, 10))}
                className="flex-1 accent-rose-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />

              <button
                type="button"
                onClick={handleNextPage}
                disabled={currentPage >= pages.length && !nextChapter}
                className="p-1 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Bottom Bar Buttons */}
          <div className="flex items-center justify-between text-xs">
            {/* Chapter navigation */}
            <div className="flex items-center space-x-2">
              {prevChapter && (
                <button
                  type="button"
                  onClick={() => onSelectChapter(prevChapter)}
                  className="px-3 py-1.5 bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-neutral-300 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Cap. Anterior ({prevChapter.chapter})
                </button>
              )}
            </div>

            {/* Zoom Controls */}
            {readerMode === 'webtoon' && (
              <div className="flex items-center space-x-1 bg-neutral-900/90 border border-neutral-800 rounded-xl px-2 py-1">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(60, z - 15))}
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                  title="Diminuir largura"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-neutral-400 font-mono">{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(160, z + 15))}
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                  title="Aumentar largura"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center space-x-2">
              {nextChapter && (
                <button
                  type="button"
                  onClick={() => onSelectChapter(nextChapter)}
                  className="px-3 py-1.5 bg-rose-900/40 hover:bg-rose-600 border border-rose-800/80 rounded-xl text-rose-200 hover:text-white font-medium flex items-center gap-1 cursor-pointer"
                >
                  Próximo ({nextChapter.chapter}) <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
