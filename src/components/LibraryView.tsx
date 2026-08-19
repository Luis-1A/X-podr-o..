import React, { useState, useEffect, useMemo } from 'react';
import { MangaItem, ReadingProgress } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiGetLibrary, getProxiedImageUrl } from '../services/api';
import {
  BookOpen,
  Play,
  Search,
  Flame,
  Bookmark,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface LibraryViewProps {
  onSelectManga: (mangaId: string, mangaData?: MangaItem) => void;
  onResumeReading?: (progress: ReadingProgress) => void;
  onNavigateToDiscover: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  onSelectManga,
  onNavigateToDiscover,
}) => {
  const { user } = useAuth();
  const [library, setLibrary] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await apiGetLibrary();
      setLibrary(items);
    } catch (err: any) {
      setError('Não foi possível sincronizar sua biblioteca.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return library;
    return library.filter((m) =>
      m.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );
  }, [library, searchQuery]);

  return (
    <div id="library-view-root" className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Bookmark className="w-3.5 h-3.5" />
            Cloud Firestore Sincronizado
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Meus Favoritos</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            {library.length} {library.length === 1 ? 'mangá salvo' : 'mangás salvos'} na sua conta
          </p>
        </div>

        {/* Search filter */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar favoritos..."
            className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-rose-500 transition"
          />
        </div>
      </div>

      {/* 4 UI States */}
      {loading ? (
        <div className="p-12 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-3">
          <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-neutral-400">Carregando favoritos do Firestore...</p>
        </div>
      ) : error ? (
        <div className="p-8 bg-neutral-900 border border-rose-900/40 rounded-2xl text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <h3 className="text-sm font-bold text-white">{error}</h3>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-4">
          <Bookmark className="w-12 h-12 text-neutral-600 mx-auto" />
          <h3 className="text-base font-bold text-white">Sua biblioteca está vazia</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Adicione seus mangás favoritos do MangaFire para acompanhá-los facilmente de qualquer dispositivo.
          </p>
          <button
            type="button"
            onClick={onNavigateToDiscover}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition inline-flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-950/50"
          >
            <Flame className="w-4 h-4" /> Explorar Mangás
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              id={`library-card-${item.id}`}
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
                <div className="mt-2 text-[10px] text-neutral-400">Ver capítulos →</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
