import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MangaItem, MangaSearchPreview } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiSearchManga, apiGetDiscover, getProxiedImageUrl } from '../services/api';
import { Search, Sparkles, AlertCircle, RefreshCw, BookOpen, Layers, Flame, CheckCircle2 } from 'lucide-react';

interface DiscoverViewProps {
  onSelectManga: (mangaId: string, mangaData?: MangaItem) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectManga }) => {
  const { isOnline } = useAuth();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<MangaSearchPreview[]>([]);
  const [popular, setPopular] = useState<MangaItem[]>([]);
  const [latest, setLatest] = useState<MangaItem[]>([]);

  // 4 States: 'IDLE' | 'LOADING' | 'SUCCESS' | 'EMPTY' | 'ERROR'
  const [searchState, setSearchState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'EMPTY' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce input effect (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // Load initial discover titles (Popular & Latest from MangaFire)
  useEffect(() => {
    let isMounted = true;
    async function loadDiscover() {
      try {
        const data = await apiGetDiscover();
        if (isMounted) {
          setPopular(data.popular || []);
          setLatest(data.latest || []);
        }
      } catch (err) {
        console.warn('Could not load discover titles:', err);
      }
    }
    loadDiscover();
    return () => {
      isMounted = false;
    };
  }, []);

  // Perform Fast Search (Etapa A: Prévia Imediata)
  const executeSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery) {
      setResults([]);
      setSearchState('IDLE');
      return;
    }

    // Cancel any previous inflight search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSearchState('LOADING');
    setErrorMessage(null);

    try {
      const data = await apiSearchManga(searchQuery, 24, controller.signal);

      if (data.results && data.results.length > 0) {
        setResults(data.results);
        setSearchState('SUCCESS');
      } else {
        setResults([]);
        setSearchState('EMPTY');
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      setErrorMessage('Não foi possível carregar os resultados da busca.');
      setSearchState('ERROR');
    }
  }, []);

  // Trigger search when debouncedQuery changes
  useEffect(() => {
    if (debouncedQuery) {
      executeSearch(debouncedQuery);
    } else {
      setResults([]);
      setSearchState('IDLE');
    }
  }, [debouncedQuery, executeSearch]);

  const handleRetry = () => {
    if (debouncedQuery) {
      executeSearch(debouncedQuery);
    }
  };

  return (
    <div id="discover-view-root" className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* Search Header Banner */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-3">
            <Flame className="w-3.5 h-3.5" />
            MangaFire Integrado
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Descobrir Mangás & Webtoons
          </h1>
          <p className="text-sm text-neutral-400 mt-1 mb-5">
            Busca instantânea em duas etapas com prévia de capa e catálogo de capítulos atualizados.
          </p>

          {/* Search Input Box */}
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute left-4 text-neutral-400 pointer-events-none" />
            <input
              id="manga-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o título (ex: Jajapotecai, Diário de Anne Frank, Solo Leveling)..."
              className="w-full pl-12 pr-10 py-3.5 bg-neutral-950 border border-neutral-700/80 rounded-2xl text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-sm shadow-inner transition"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 text-xs font-bold text-neutral-400 hover:text-white px-1.5 py-0.5 rounded-full bg-neutral-800 transition"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Quick Suggestions */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">Sugestões rápidas:</span>
            {['Jajapotecai', 'Solo Leveling', 'One Piece', 'Jujutsu Kaisen', 'Chainsaw Man'].map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setQuery(sug)}
                className="px-2.5 py-1 rounded-lg bg-neutral-950/70 border border-neutral-800 hover:border-rose-500/50 hover:text-rose-300 transition cursor-pointer"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4 EXPLICIT STATES: LOADING / SUCCESS / EMPTY / ERROR / IDLE (Discover)     */}
      {/* ========================================================================= */}

      {/* 1. STATE: LOADING (Instant Preview Feedback) */}
      {searchState === 'LOADING' && (
        <div id="search-loading-state" className="p-8 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-4">
          <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
          <div>
            <h3 className="text-base font-bold text-white flex items-center justify-center gap-2">
              🔎 Pesquisando <span className="text-rose-400">"{debouncedQuery}"</span>...
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Etapa A: Obtendo prévia e metadados no MangaFire...
            </p>
          </div>
        </div>
      )}

      {/* 2. STATE: ERROR (With Retry Button - No White Screen) */}
      {searchState === 'ERROR' && (
        <div id="search-error-state" className="p-8 bg-neutral-900 border border-rose-900/40 rounded-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              😵 {errorMessage || 'Não foi possível carregar os resultados.'}
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Verifique sua conexão ou tente novamente.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/50"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      )}

      {/* 3. STATE: EMPTY (No Results) */}
      {searchState === 'EMPTY' && (
        <div id="search-empty-state" className="p-8 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-3">
          <BookOpen className="w-10 h-10 text-neutral-500 mx-auto" />
          <h3 className="text-base font-bold text-white">Nenhum mangá encontrado para "{debouncedQuery}"</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Tente pesquisar por outros termos, nomes alternativos em inglês/japonês ou selecione uma das sugestões rápidas acima.
          </p>
        </div>
      )}

      {/* 4. STATE: SUCCESS (Results Grid) */}
      {searchState === 'SUCCESS' && results.length > 0 && (
        <div id="search-results-section" className="space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-500" />
              Resultados para <span className="text-rose-400">"{debouncedQuery}"</span>
              <span className="text-xs font-semibold text-neutral-400 px-2 py-0.5 rounded-full bg-neutral-800">
                {results.length} encontrados
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {results.map((item) => (
              <div
                key={item.id}
                id={`manga-card-${item.id}`}
                onClick={() =>
                  onSelectManga(item.id, {
                    id: item.id,
                    sourceId: 'mangafire',
                    sourceName: 'MangaFire',
                    title: item.title,
                    description: item.description,
                    coverUrl: item.coverUrl,
                    author: '',
                    artist: '',
                    status: 'ongoing',
                    genres: item.genres || [],
                    totalChapters: item.totalChapters,
                  })
                }
                className="group relative bg-neutral-900 border border-neutral-800 hover:border-rose-500/60 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-950/20 flex flex-col"
              >
                {/* Cover Image */}
                <div className="aspect-[3/4] bg-neutral-950 relative overflow-hidden">
                  <img
                    src={getProxiedImageUrl(item.coverUrl)}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80';
                    }}
                  />
                  {/* MangaFire Source Badge */}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-rose-600/90 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase shadow-sm">
                    MangaFire
                  </div>

                  {item.totalChapters ? (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-neutral-900/90 backdrop-blur-sm text-amber-400 text-[10px] font-bold border border-amber-500/30 shadow-sm">
                      {item.totalChapters} caps
                    </div>
                  ) : null}
                </div>

                {/* Details */}
                <div className="p-3 flex-1 flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-white line-clamp-2 group-hover:text-rose-400 transition">
                    {item.title}
                  </h3>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="truncate">{item.type || 'Manga'}</span>
                    <span className="text-rose-400 text-[10px] font-semibold">Ver capítulos →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DEFAULT IDLE STATE: TRENDING & POPULAR CATALOG ON MANGAFIRE            */}
      {/* ========================================================================= */}
      {searchState === 'IDLE' && (
        <div className="space-y-8">
          {/* Popular Section */}
          {popular.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Flame className="w-5 h-5 text-rose-500" />
                  Destaques Populares MangaFire
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {popular.map((item) => (
                  <div
                    key={item.id}
                    id={`popular-card-${item.id}`}
                    onClick={() => onSelectManga(item.id, item)}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-rose-500/60 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl flex flex-col"
                  >
                    <div className="aspect-[3/4] bg-neutral-950 relative overflow-hidden">
                      <img
                        src={getProxiedImageUrl(item.coverUrl)}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80';
                        }}
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-rose-600/90 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase">
                        MangaFire
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <h3 className="text-xs font-bold text-white line-clamp-2 group-hover:text-rose-400 transition">
                        {item.title}
                      </h3>
                      <div className="mt-2 text-[10px] text-neutral-400">Explorar obra →</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Updates Section */}
          {latest.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Recém Atualizados
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {latest.map((item) => (
                  <div
                    key={item.id}
                    id={`latest-card-${item.id}`}
                    onClick={() => onSelectManga(item.id, item)}
                    className="group bg-neutral-900 border border-neutral-800 hover:border-rose-500/60 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl flex flex-col"
                  >
                    <div className="aspect-[3/4] bg-neutral-950 relative overflow-hidden">
                      <img
                        src={getProxiedImageUrl(item.coverUrl)}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&q=80';
                        }}
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-rose-600/90 backdrop-blur-sm text-white text-[10px] font-extrabold uppercase">
                        MangaFire
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <h3 className="text-xs font-bold text-white line-clamp-2 group-hover:text-rose-400 transition">
                        {item.title}
                      </h3>
                      <div className="mt-2 text-[10px] text-neutral-400">Ler agora →</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
