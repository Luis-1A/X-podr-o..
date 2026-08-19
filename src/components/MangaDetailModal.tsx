import React, { useState, useEffect, useMemo } from 'react';
import { ChapterItem, LibraryCategory, MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  apiAddToLibrary,
  apiGetMangaChapters,
  apiGetMangaDetails,
  apiRemoveFromLibrary,
  getProxiedImageUrl,
} from '../services/api';
import { cacheMangaForOffline, getCachedManga, getOfflineProgress } from '../services/storage';
import {
  X,
  BookOpen,
  Play,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  Clock,
  Flame,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface MangaDetailModalProps {
  mangaId: string;
  initialData?: MangaItem;
  onClose: () => void;
  onStartReading: (chapter: ChapterItem, manga: MangaItem) => void;
}

export const MangaDetailModal: React.FC<MangaDetailModalProps> = ({
  mangaId,
  initialData,
  onClose,
  onStartReading,
}) => {
  const { user, isOnline } = useAuth();

  const [manga, setManga] = useState<MangaItem | null>(initialData || null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  const [loadingDetails, setLoadingDetails] = useState<boolean>(!initialData);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load Manga Details & Chapters (Etapa B)
  useEffect(() => {
    let isMounted = true;

    async function loadAll() {
      setError(null);

      // 1. Fetch Details (Stage B enrichment)
      try {
        let details = initialData || (await getCachedManga(mangaId));
        if (isMounted && details) {
          setManga(details);
        }

        if (isOnline) {
          const onlineDetails = await apiGetMangaDetails(mangaId);
          if (onlineDetails && isMounted) {
            setManga(onlineDetails);
            await cacheMangaForOffline(onlineDetails);
          }
        }
      } catch (err) {
        console.warn('Details fetch error:', err);
      } finally {
        if (isMounted) setLoadingDetails(false);
      }

      // 2. Fetch Chapters
      try {
        setLoadingChapters(true);
        const chList = await apiGetMangaChapters(mangaId);
        if (isMounted) {
          setChapters(chList);
        }
      } catch (chErr) {
        console.warn('Chapters fetch error:', chErr);
      } finally {
        if (isMounted) setLoadingChapters(false);
      }

      // 3. Fetch Local/Firestore Progress
      try {
        const p = await getOfflineProgress(mangaId);
        if (isMounted && p) {
          setProgress(p);
        }
      } catch (pErr) {
        console.warn('Progress load warning:', pErr);
      }
    }

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [mangaId, initialData, isOnline]);

  const handleToggleFavorite = async () => {
    if (!manga) return;
    if (isFavorite) {
      await apiRemoveFromLibrary(manga.id);
      setIsFavorite(false);
    } else {
      await apiAddToLibrary(manga, 'reading');
      setIsFavorite(true);
    }
  };

  // Find next chapter to read
  const nextChapterToRead = useMemo(() => {
    if (!chapters.length) return null;
    if (progress) {
      const idx = chapters.findIndex((c) => c.id === progress.chapterId || c.chapter === progress.chapterNumber);
      if (idx !== -1) {
        // If chapter was 100% completed, offer next
        if (progress.percentage >= 90 && idx < chapters.length - 1) {
          return chapters[idx + 1];
        }
        return chapters[idx];
      }
    }
    return chapters[0];
  }, [chapters, progress]);

  return (
    <div id="manga-detail-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div id="manga-detail-container" className="w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden text-neutral-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/80">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-400 text-xs font-bold border border-rose-500/30 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> MangaFire
            </span>
            <span className="text-xs text-neutral-400 hidden sm:inline">Catálogo & Capítulos</span>
          </div>

          <button
            id="close-manga-detail-btn"
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Info Section */}
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Poster */}
            <div className="w-full sm:w-52 shrink-0 aspect-[3/4] bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-xl relative">
              <img
                src={getProxiedImageUrl(manga?.coverUrl || '')}
                alt={manga?.title || 'Capa do Mangá'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80';
                }}
              />
            </div>

            {/* Metadata & Actions */}
            <div className="flex-1 space-y-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  {manga?.title || 'Carregando obra...'}
                </h1>
                {manga?.author && (
                  <p className="text-xs text-neutral-400 mt-1">Autor: {manga.author}</p>
                )}
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-300 text-xs font-semibold">
                  {manga?.status === 'completed' ? 'Completo' : 'Em lançamento'}
                </span>
                {chapters.length > 0 ? (
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">
                    {chapters.length} capítulos encontrados
                  </span>
                ) : loadingChapters ? (
                  <span className="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-400 text-xs flex items-center gap-1.5">
                    <div className="w-3 h-3 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                    Carregando capítulos...
                  </span>
                ) : null}
              </div>

              {/* Synopsis */}
              <div className="text-xs text-neutral-300 leading-relaxed max-h-36 overflow-y-auto pr-2 bg-neutral-950/60 p-3.5 rounded-xl border border-neutral-800/80">
                {manga?.description || 'Nenhuma sinopse disponível no momento.'}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {nextChapterToRead && (
                  <button
                    id="start-reading-btn"
                    type="button"
                    onClick={() => manga && onStartReading(nextChapterToRead, manga)}
                    className="px-5 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-950/50 flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    {progress
                      ? `Continuar do Cap. ${progress.chapterNumber} (${progress.percentage}%)`
                      : `Começar a ler (Cap. ${nextChapterToRead.chapter})`}
                  </button>
                )}

                <button
                  id="toggle-favorite-btn"
                  type="button"
                  onClick={handleToggleFavorite}
                  className={`px-4 py-3 rounded-xl text-xs font-semibold border transition flex items-center gap-2 cursor-pointer ${
                    isFavorite
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                  }`}
                >
                  {isFavorite ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                  {isFavorite ? 'Salvo nos Favoritos' : 'Adicionar aos Favoritos'}
                </button>
              </div>
            </div>
          </div>

          {/* Chapters List */}
          <div className="space-y-3 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-rose-500" />
                Lista de Capítulos ({chapters.length})
              </h2>
            </div>

            {loadingChapters ? (
              <div className="p-8 bg-neutral-950 rounded-2xl border border-neutral-800 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mx-auto" />
                <p className="text-xs text-neutral-400">Indexando capítulos no MangaFire...</p>
              </div>
            ) : chapters.length === 0 ? (
              <div className="p-6 bg-neutral-950 rounded-2xl border border-neutral-800 text-center text-xs text-neutral-400">
                Nenhum capítulo disponível no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {chapters.map((ch) => {
                  const isCurrent = progress?.chapterId === ch.id;
                  return (
                    <button
                      key={ch.id}
                      id={`chapter-item-${ch.id}`}
                      type="button"
                      onClick={() => manga && onStartReading(ch, manga)}
                      className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                        isCurrent
                          ? 'bg-rose-950/50 border-rose-600/80 text-rose-300'
                          : 'bg-neutral-950 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-800/40 text-neutral-200'
                      }`}
                    >
                      <div className="truncate">
                        <p className="text-xs font-bold truncate">Capítulo {ch.chapter}</p>
                        {ch.title && ch.title !== `Capítulo ${ch.chapter}` && (
                          <p className="text-[11px] text-neutral-400 truncate">{ch.title}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400 shrink-0 font-medium">Ler →</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
