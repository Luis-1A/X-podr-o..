import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChapterItem, MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiGetChapterPages, apiSaveReadingProgress, getProxiedImageUrl } from '../services/api';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertCircle,
  Flame,
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
  const { settings } = useAuth();

  const [readerMode, setReaderMode] = useState<'webtoon' | 'single' | 'double'>(
    settings?.reader_mode || 'webtoon'
  );
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Find next and previous chapters in sorted list
  const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  // Load Chapter Pages
  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetChapterPages(chapter.id);
      if (data.pages && data.pages.length > 0) {
        setPages(data.pages);
      } else {
        setError('Não foi possível carregar as páginas deste capítulo no MangaFire.');
      }
    } catch (err: any) {
      setError('Erro ao carregar as imagens do capítulo. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [chapter.id]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Sync Progress with Firestore and IndexedDB
  const syncProgress = useCallback(
    async (page: number) => {
      if (!pages.length) return;
      const totalPages = pages.length;
      const progressPercent = Math.min(100, Math.round((page / totalPages) * 100));

      const prog: ReadingProgress = {
        mangaId: manga.id,
        chapterId: chapter.id,
        mangaTitle: manga.title,
        chapterNumber: chapter.chapter,
        chapterTitle: chapter.title || undefined,
        coverUrl: manga.coverUrl,
        currentPage: page,
        totalPages,
        percentage: progressPercent,
        isCompleted: progressPercent >= 95,
        updatedAt: new Date().toISOString(),
      };

      try {
        await apiSaveReadingProgress(prog);
      } catch (err) {
        console.warn('Progress sync warning:', err);
      }
    },
    [manga, chapter, pages]
  );

  // Update progress on page change
  useEffect(() => {
    if (pages.length > 0) {
      syncProgress(currentPage);
    }
  }, [currentPage, pages, syncProgress]);

  // Key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        if (currentPage < pages.length) setCurrentPage((p) => p + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (currentPage > 1) setCurrentPage((p) => p - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, pages.length, onClose]);

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
      id="reader-view-root"
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black text-white flex flex-col select-none overflow-hidden"
    >
      {/* Top Header Bar */}
      {showControls && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-neutral-950/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-neutral-800 animate-in slide-in-from-top duration-150">
          <div className="flex items-center gap-3">
            <button
              id="reader-back-btn"
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="truncate max-w-xs sm:max-w-md">
              <h2 className="text-sm font-bold text-white truncate">{manga.title}</h2>
              <p className="text-xs text-rose-400 font-semibold truncate flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> Capítulo {chapter.chapter}
                {chapter.title && ` - ${chapter.title}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="bg-neutral-900 rounded-xl p-1 border border-neutral-800 flex text-xs">
              <button
                type="button"
                onClick={() => setReaderMode('webtoon')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  readerMode === 'webtoon' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Webtoon
              </button>
              <button
                type="button"
                onClick={() => setReaderMode('single')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  readerMode === 'single' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Paginado
              </button>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition cursor-pointer hidden sm:block"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Main Pages Canvas */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex items-center justify-center relative cursor-pointer"
        onClick={() => setShowControls((prev) => !prev)}
      >
        {loading ? (
          <div className="text-center space-y-4 p-8">
            <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-neutral-300 font-medium">Carregando páginas no MangaFire...</p>
          </div>
        ) : error ? (
          <div className="text-center space-y-4 p-8 max-w-md bg-neutral-900 border border-rose-900/50 rounded-2xl">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-base font-bold text-white">{error}</h3>
            <button
              type="button"
              onClick={loadPages}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/50"
            >
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </button>
          </div>
        ) : readerMode === 'webtoon' ? (
          /* Webtoon Mode: Continuous vertical scroll */
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center py-16 space-y-0 min-h-screen">
            {pages.map((imgUrl, idx) => (
              <img
                key={idx}
                src={getProxiedImageUrl(imgUrl)}
                alt={`Página ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full object-contain shadow-2xl block"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80';
                }}
              />
            ))}
          </div>
        ) : (
          /* Paged Single Mode */
          <div className="w-full h-full flex items-center justify-center p-4">
            {pages[currentPage - 1] && (
              <img
                src={getProxiedImageUrl(pages[currentPage - 1])}
                alt={`Página ${currentPage}`}
                referrerPolicy="no-referrer"
                className="max-h-[92vh] max-w-full object-contain shadow-2xl"
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Floating Navigation */}
      {showControls && !loading && !error && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-neutral-950/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between border-t border-neutral-800 animate-in slide-in-from-bottom duration-150">
          {/* Prev Chapter */}
          <button
            type="button"
            disabled={!prevChapter}
            onClick={(e) => {
              e.stopPropagation();
              if (prevChapter) onSelectChapter(prevChapter);
            }}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold text-neutral-300 flex items-center gap-1.5 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" /> Cap. Anterior
          </button>

          {/* Page Counter */}
          <div className="text-xs text-neutral-300 font-bold">
            {readerMode === 'webtoon'
              ? `${pages.length} páginas`
              : `Página ${currentPage} de ${pages.length}`}
          </div>

          {/* Next Chapter */}
          <button
            type="button"
            disabled={!nextChapter}
            onClick={(e) => {
              e.stopPropagation();
              if (nextChapter) onSelectChapter(nextChapter);
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:pointer-events-none text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-rose-950/50"
          >
            Próximo Cap. <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
