import React, { useState, useEffect, useMemo } from 'react';
import { DownloadedChapter, MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import { apiGetLibrary, apiGetProgress, getProxiedImageUrl } from '../services/api';
import { getOfflineLibrary, syncOfflineLibrary } from '../services/storage';
import {
  BookOpen,
  Play,
  Search,
  Filter,
  ArrowRight,
  Download,
  CheckCircle2,
  Clock,
  Sparkles,
  WifiOff,
} from 'lucide-react';

interface LibraryViewProps {
  onSelectManga: (mangaId: string, mangaData?: MangaItem) => void;
  onResumeReading: (progress: ReadingProgress) => void;
  onNavigateToDiscover: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onSelectManga,
  onResumeReading,
  onNavigateToDiscover,
}) => {
  const { user, isOnline } = useAuth();
  const { downloadedChapters } = useDownloads();

  const [library, setLibrary] = useState<MangaItem[]>([]);
  const [progressList, setProgressList] = useState<ReadingProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Load user library & progress
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        if (isOnline && user) {
          const [libItems, progItems] = await Promise.all([
            apiGetLibrary(),
            apiGetProgress(),
          ]);
          if (isMounted) {
            setLibrary(libItems);
            setProgressList(progItems);
            // Backup library locally for offline access
            await syncOfflineLibrary(libItems);
          }
        } else {
          // Offline mode fallback: load from IndexedDB
          const offlineLib = await getOfflineLibrary();
          if (isMounted) {
            setLibrary(offlineLib);
          }
        }
      } catch (err) {
        console.warn('Could not load online library, falling back to local store:', err);
        const offlineLib = await getOfflineLibrary();
        if (isMounted) {
          setLibrary(offlineLib);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [user, isOnline]);

  // Find most recent reading progress item for "Continuar Lendo"
  const latestProgress = useMemo(() => {
    if (progressList.length === 0) return null;
    return progressList[0]; // sorted by updated_at desc from API
  }, [progressList]);

  // Categories count
  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'reading', label: 'Lendo' },
    { id: 'plan_to_read', label: 'Planejo Ler' },
    { id: 'completed', label: 'Concluídos' },
    { id: 'downloaded', label: 'Baixados' },
  ];

  // Filtered manga items
  const filteredLibrary = useMemo(() => {
    return library.filter((item) => {
      // Category filter
      if (selectedCategory === 'downloaded') {
        const hasDownloadedChapters = Array.from(downloadedChapters.values()).some(
          (dc: DownloadedChapter) => dc.mangaId === item.id
        );
        if (!hasDownloadedChapters) return false;
      } else if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesAuthor = item.author?.toLowerCase().includes(q);
        return matchesTitle || matchesAuthor;
      }

      return true;
    });
  }, [library, selectedCategory, searchQuery, downloadedChapters]);

  return (
    <div id="library-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-8 animate-in fade-in duration-150">
      {/* Offline Mode Alert banner if applicable */}
      {!isOnline && (
        <div id="offline-library-banner" className="p-3.5 bg-amber-950/40 border border-amber-800/60 rounded-xl flex items-center justify-between gap-3 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Modo Offline Ativo:</strong> Exibindo biblioteca em cache e capítulos disponíveis para leitura sem internet.
            </span>
          </div>
        </div>
      )}

      {/* CONTINUAR LENDO (Resume Reading Section) - Strictly shown only when real reading progress exists */}
      {latestProgress && (
        <section id="continue-reading-section" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-500" />
              Continuar Lendo
            </h2>
          </div>

          <div className="bg-gradient-to-r from-neutral-900 to-neutral-900/80 border border-neutral-800 hover:border-neutral-700/80 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition group">
            <div className="flex items-center space-x-4">
              {latestProgress.coverUrl ? (
                <img
                  src={getProxiedImageUrl(latestProgress.coverUrl)}
                  alt={latestProgress.mangaTitle}
                  className="w-14 h-20 sm:w-16 sm:h-24 object-cover rounded-xl shadow-md shrink-0 border border-neutral-800"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Fallback visual placeholder
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-14 h-20 sm:w-16 sm:h-24 bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-500 shrink-0">
                  <BookOpen className="w-6 h-6" />
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-800/60 text-rose-300">
                  Capítulo {latestProgress.chapterNumber}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white leading-snug group-hover:text-rose-400 transition">
                  {latestProgress.mangaTitle}
                </h3>
                {latestProgress.chapterTitle && (
                  <p className="text-xs text-neutral-400 line-clamp-1">
                    {latestProgress.chapterTitle}
                  </p>
                )}

                {/* Real Progress Bar */}
                <div className="flex items-center space-x-3 pt-1">
                  <div className="w-36 sm:w-48 bg-neutral-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-rose-500 to-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, latestProgress.percentage)}%` }}
                    />
                  </div>
                  <span className="text-xs text-neutral-400 font-medium">
                    Página {latestProgress.currentPage} de {latestProgress.totalPages} ({latestProgress.percentage}%)
                  </span>
                </div>
              </div>
            </div>

            <button
              id="resume-reading-btn"
              type="button"
              onClick={() => onResumeReading(latestProgress)}
              className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-medium rounded-xl text-xs sm:text-sm transition shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Play className="w-4 h-4 fill-white" />
              Continuar Leitura
            </button>
          </div>
        </section>
      )}

      {/* LIBRARY HEADER & CONTROLS */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Minha Biblioteca
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-medium">
                {library.length} {library.length === 1 ? 'título' : 'títulos'}
              </span>
            </h2>
            <p className="text-xs text-neutral-400">Seus mangás salvos, organizados e sincronizados</p>
          </div>

          {/* Search in library */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              id="library-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar na biblioteca..."
              className="w-full pl-9 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition"
            />
          </div>
        </div>

        {/* Category Filter Chips */}
        <div id="library-category-chips" className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                id={`filter-cat-${cat.id}`}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  isSelected
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* LIBRARY GRID OR EMPTY STATES */}
      {loading ? (
        <div id="library-loading-state" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[2/3] bg-neutral-900 rounded-2xl border border-neutral-800/80" />
          ))}
        </div>
      ) : library.length === 0 ? (
        /* Empty Library State */
        <div id="empty-library-container" className="text-center py-16 px-4 bg-neutral-900/30 border border-neutral-800/60 rounded-3xl space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center mx-auto text-neutral-400">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-white">Sua biblioteca está vazia</h3>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-sm mx-auto leading-relaxed">
              Explore novos títulos do catálogo MangaFire e fontes conectadas, adicione aos favoritos e acompanhe seu progresso de leitura.
            </p>
          </div>
          <button
            id="empty-library-discover-btn"
            type="button"
            onClick={onNavigateToDiscover}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white text-xs font-semibold rounded-xl transition shadow-lg shadow-red-950/40 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Explorar Catálogo de Mangás
          </button>
        </div>
      ) : filteredLibrary.length === 0 ? (
        /* Filter Empty State */
        <div id="filtered-empty-state" className="text-center py-12 text-neutral-400 bg-neutral-900/20 rounded-2xl border border-neutral-800/60">
          <p className="text-sm">Nenhum mangá encontrado nesta categoria ou pesquisa.</p>
        </div>
      ) : (
        /* Real Manga Cards Grid */
        <div id="library-manga-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {filteredLibrary.map((item) => {
            const hasDownloads = Array.from(downloadedChapters.values()).some(
              (dc: DownloadedChapter) => dc.mangaId === item.id
            );

            return (
              <div
                key={item.id}
                id={`manga-card-${item.id}`}
                onClick={() => onSelectManga(item.id, item)}
                className="group relative bg-neutral-900 border border-neutral-800/80 hover:border-rose-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-950/20 flex flex-col"
              >
                {/* Cover container */}
                <div className="aspect-[3/4] w-full relative bg-neutral-950 overflow-hidden">
                  {item.coverUrl ? (
                    <img
                      src={getProxiedImageUrl(item.coverUrl)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <BookOpen className="w-8 h-8" />
                    </div>
                  )}

                  {/* Gradient overlay on bottom */}
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-black/20" />

                  {/* Badges */}
                  <div className="absolute top-2 left-2 right-2 flex justify-between items-start gap-1">
                    {hasDownloads && (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-700/80 text-[10px] font-semibold text-emerald-300 flex items-center gap-1 shadow">
                        <Download className="w-2.5 h-2.5" />
                        Offline
                      </span>
                    )}

                    {item.status && (
                      <span className="ml-auto px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-neutral-700/60 text-[9px] font-medium text-neutral-300">
                        {item.status === 'completed' ? 'Completo' : 'Lançando'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-rose-400 transition">
                      {item.title}
                    </h4>
                    {item.author && (
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-1">
                        {item.author}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-400">
                    <span className="capitalize">{item.category?.replace('_', ' ') || 'Biblioteca'}</span>
                    <span className="text-rose-400 font-medium group-hover:translate-x-0.5 transition-transform">
                      Abrir &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
