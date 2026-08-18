import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiGetUpdates, apiGetLibrary, getProxiedImageUrl } from '../services/api';
import { Bell, RefreshCw, BookOpen, AlertCircle, Clock } from 'lucide-react';
import { MangaItem } from '../types';

interface UpdatesViewProps {
  onSelectManga: (mangaId: string) => void;
}

export const UpdatesView: React.FC<UpdatesViewProps> = ({ onSelectManga }) => {
  const { user, isOnline } = useAuth();
  const [updates, setUpdates] = useState<any[]>([]);
  const [library, setLibrary] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchUpdates = async () => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lib, updateList] = await Promise.all([
        apiGetLibrary(),
        apiGetUpdates(),
      ]);
      setLibrary(lib);
      setUpdates(updateList || []);
    } catch (e) {
      console.error('Error fetching updates:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, [user, isOnline]);

  return (
    <div id="updates-view-container" className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 space-y-6 animate-in fade-in duration-150">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-rose-500" />
            Atualizações Recentes
          </h2>
          <p className="text-xs text-neutral-400">
            Verificação em tempo real de novos capítulos lançados para mangás da sua biblioteca
          </p>
        </div>

        {isOnline && (
          <button
            type="button"
            onClick={fetchUpdates}
            disabled={loading}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition cursor-pointer"
            title="Verificar agora"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-400' : ''}`} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
          <p className="text-xs text-neutral-400">Verificando novos lançamentos nas fontes...</p>
        </div>
      ) : updates.length === 0 ? (
        /* Empty Updates State */
        <div id="updates-empty-container" className="text-center py-16 px-4 bg-neutral-900/30 border border-neutral-800/60 rounded-3xl space-y-3 max-w-md mx-auto">
          <Bell className="w-10 h-10 text-neutral-500 mx-auto" />
          <h4 className="text-base font-bold text-white">Nenhuma atualização disponível</h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Todos os títulos da sua biblioteca estão em dia com os lançamentos mais recentes das fontes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map((update, idx) => {
            const manga = library.find((m) => m.id === update.mangaId);
            return (
              <div
                key={idx}
                onClick={() => onSelectManga(update.mangaId)}
                className="bg-neutral-900 border border-neutral-800 hover:border-rose-500/50 rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer transition"
              >
                <div className="flex items-center space-x-3.5">
                  {manga?.coverUrl ? (
                    <img
                      src={getProxiedImageUrl(manga.coverUrl)}
                      alt={manga.title}
                      className="w-12 h-16 object-cover rounded-xl border border-neutral-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-neutral-800 rounded-xl flex items-center justify-center text-neutral-600 shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300">
                      Novo: Capítulo {update.chapterNumber}
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-white leading-tight">
                      {manga?.title || 'Mangá'}
                    </h4>
                    {update.chapterTitle && (
                      <p className="text-xs text-neutral-400 line-clamp-1">{update.chapterTitle}</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow"
                >
                  Ver Mangá
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
