import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MangaItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiSearchManga, apiGetRecommendations, getProxiedImageUrl } from '../services/api';
import { Search, Sparkles, Filter, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';

const GENRES_LIST = [
  'Action',
  'Adventure',
  'Romance',
  'Fantasy',
  'Comedy',
  'Drama',
  'Mystery',
  'Horror',
  'Sci-Fi',
  'Sports',
  'Slice of Life',
  'Supernatural',
  'Isekai',
  'Psychological',
];

interface DiscoverViewProps {
  onSelectManga: (mangaId: string, mangaData?: MangaItem) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectManga }) => {
  const { profile, isOnline } = useAuth();

  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string>('pt-br');

  const [results, setResults] = useState<MangaItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [recommendations, setRecommendations] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);

  // Initial load: fetch recommendations or trending titles
  useEffect(() => {
    let isMounted = true;
    async function loadInit() {
      if (!isOnline) return;
      try {
        const userGenres = profile?.preferredGenres || [];
        const recs = await apiGetRecommendations(userGenres);
        if (isMounted) {
          setRecommendations(recs);
        }
      } catch (err) {
        console.error('Error loading recommendations:', err);
      }
    }
    loadInit();
    return () => {
      isMounted = false;
    };
  }, [profile, isOnline]);

  // AbortController ref for in-flight search requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search function
  const handleSearch = useCallback(
    async (overrideQuery?: string, overrideGenre?: string | null) => {
      const q = overrideQuery !== undefined ? overrideQuery : query;
      const genre = overrideGenre !== undefined ? overrideGenre : selectedGenre;

      if (!q.trim() && !genre) {
        setResults([]);
        setSearched(false);
        return;
      }

      // Cancel any ongoing search request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setSearched(true);

      try {
        const langs = selectedLang === 'all' ? undefined : [selectedLang, 'en'];
        const genres = genre ? [genre] : undefined;

        const data = await apiSearchManga(
          {
            q: q.trim(),
            genres,
            lang: langs,
            limit: 24,
          },
          controller.signal
        );

        if (!controller.signal.aborted) {
          setResults(data.results || []);
          setTotalCount(data.total || 0);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          console.error('Search query failed:', err);
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [query, selectedGenre, selectedLang]
  );

  // Debounced search when typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim() || selectedGenre) {
        handleSearch();
      } else {
        setResults([]);
        setSearched(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, selectedGenre, selectedLang, handleSearch]);

  return (
    <div id="discover-view-container" className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6 animate-in fade-in duration-150">
      {/* Title & Description */}
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-red-500" />
          Descobrir & Pesquisar
        </h2>
        <p className="text-xs text-neutral-400">
          Prioridade MangaFire com fallback automático para MangaDex e extensões conectadas
        </p>
      </div>

      {/* Search Input and Filters Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3.5 shadow-md">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Text Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              id="discover-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o nome do mangá (ex: Solo Leveling, Naruto, Berserk, One Piece)..."
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 transition"
            />
            {loading && (
              <RefreshCw className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-rose-400 animate-spin" />
            )}
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400 font-medium whitespace-nowrap">Idioma:</label>
            <select
              id="discover-lang-select"
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-neutral-200 focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="pt-br">🇧🇷 Português (PT-BR)</option>
              <option value="en">🇺🇸 English</option>
              <option value="es">🇪🇸 Español</option>
              <option value="all">🌐 Todos os Idiomas</option>
            </select>
          </div>
        </div>

        {/* Genre Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => { setSelectedGenre(null); }}
            className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition cursor-pointer ${
              selectedGenre === null
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-neutral-200'
            }`}
          >
            Todos os Gêneros
          </button>
          {GENRES_LIST.map((g) => {
            const isSelected = selectedGenre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGenre(isSelected ? null : g)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition cursor-pointer ${
                  isSelected
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                    : 'bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-neutral-200'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* SEARCH RESULTS */}
      {searched ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              Resultados da Pesquisa
              {totalCount > 0 && (
                <span className="text-xs font-normal text-neutral-400">
                  ({totalCount} encontrados)
                </span>
              )}
            </h3>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                <div key={i} className="aspect-[3/4] bg-neutral-900 rounded-2xl border border-neutral-800" />
              ))}
            </div>
          ) : results.length === 0 ? (
            /* Real Empty Search Result */
            <div id="search-empty-results" className="text-center py-16 px-4 bg-neutral-900/30 border border-neutral-800/60 rounded-3xl space-y-3 max-w-md mx-auto">
              <AlertCircle className="w-10 h-10 text-neutral-500 mx-auto" />
              <h4 className="text-base font-bold text-white">Nenhum resultado encontrado</h4>
              <p className="text-xs text-neutral-400">
                Não encontramos mangás para os termos pesquisados. Tente mudar o idioma ou ajustar o nome.
              </p>
            </div>
          ) : (
            <div id="search-results-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {results.map((item) => (
                <div
                  key={item.id}
                  id={`search-card-${item.id}`}
                  onClick={() => onSelectManga(item.id, item)}
                  className="group relative bg-neutral-900 border border-neutral-800/80 hover:border-rose-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-950/20 flex flex-col"
                >
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
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-black/20" />
                    {item.status && (
                      <div className="absolute top-2 right-2">
                        <span className="px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm border border-neutral-700/60 text-[9px] font-medium text-neutral-300">
                          {item.status === 'completed' ? 'Completo' : 'Em andamento'}
                        </span>
                      </div>
                    )}
                  </div>

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
                      <div className="flex items-center gap-1.5 truncate max-w-[110px]">
                        <span className="truncate">
                          {item.genres?.[0] || 'Mangá'}
                        </span>
                        {item.sources && item.sources.length > 1 && (
                          <span className="px-1 py-0.2 rounded bg-rose-950/70 border border-rose-800/60 text-[9px] text-rose-300 font-semibold shrink-0">
                            {item.sources.length} fontes
                          </span>
                        )}
                      </div>
                      <span className="text-rose-400 font-medium">Ver capítulos &rarr;</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* RECOMMENDATIONS SECTION */
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-500" />
              Recomendações e Populares
            </h3>
          </div>

          {recommendations.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900/20 rounded-2xl border border-neutral-800/60 text-neutral-400 text-xs">
              Carregando títulos recomendados da fonte...
            </div>
          ) : (
            <div id="recommendations-grid" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {recommendations.map((item) => (
                <div
                  key={item.id}
                  id={`rec-card-${item.id}`}
                  onClick={() => onSelectManga(item.id, item)}
                  className="group relative bg-neutral-900 border border-neutral-800/80 hover:border-rose-500/50 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-950/20 flex flex-col"
                >
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
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-black/20" />
                  </div>

                  <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-rose-400 transition">
                        {item.title}
                      </h4>
                      {item.genres && item.genres.length > 0 && (
                        <p className="text-[10px] text-neutral-400 mt-1 line-clamp-1">
                          {item.genres.slice(0, 2).join(' • ')}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-400">
                      <span>MangaDex</span>
                      <span className="text-rose-400 font-medium">Detalhes &rarr;</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
